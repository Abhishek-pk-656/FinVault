/**
 * Tier 2: Boundary & Corner Cases — Supabase RLS & Tenant Edge Cases
 * 
 * Verifies anonymous session rejections, spoofing attempts, cross-tenant settlement
 * blocking, and concurrency isolation under load.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 2: Supabase RLS & Tenant Edge Cases', () => {
  const anonSession: UserSession = {
    userId: '00000000-0000-0000-0000-000000000000',
    email: '',
    role: 'anon'
  };

  const userA: UserSession = {
    userId: crypto.randomUUID(),
    email: 'userA@vault.test',
    role: 'authenticated'
  };

  const userB: UserSession = {
    userId: crypto.randomUUID(),
    email: 'userB@vault.test',
    role: 'authenticated'
  };

  // Edge 1: Anonymous session rejection across all resources
  it('T2-RLS-01: completely blocks anonymous (unauthenticated) sessions from all database operations', () => {
    const supabase = new SupabaseOracle();

    // Anonymous read attempts return empty lists or null
    expect(supabase.getAccounts(anonSession)).toHaveLength(0);
    expect(supabase.getTransactions(anonSession)).toHaveLength(0);
    expect(supabase.getIOUs(anonSession)).toHaveLength(0);
    expect(supabase.getSinkingFunds(anonSession)).toHaveLength(0);
    expect(supabase.getAccountById(anonSession, 'any-id')).toBeNull();

    // Anonymous mutation attempts throw RLS violation
    expect(() => supabase.createAccount(anonSession, { name: 'Anon Acc', type: 'ASSET' })).toThrow('RLS policy violation');
    expect(() => supabase.createIOU(anonSession, { counterpartyName: 'X', direction: 'LENT', principalMinor: 100n })).toThrow('RLS policy violation');
    expect(() => supabase.createSinkingFund(anonSession, { name: 'Goal', targetAmountMinor: 1000n })).toThrow('RLS policy violation');
  });

  // Edge 2: Cross-tenant IOU settlement attempt blocked
  it('T2-RLS-02: prevents User B from settling or tampering with User A IOU debt records', () => {
    const supabase = new SupabaseOracle();
    const accA = supabase.createAccount(userA, { name: "Alice Bank", type: 'ASSET' });
    const accB = supabase.createAccount(userB, { name: "Bob Bank", type: 'ASSET' });

    const iouA = supabase.createIOU(userA, {
      counterpartyName: 'David',
      direction: 'LENT',
      principalMinor: 500000n
    });

    // Bob attempts to settle Alice's IOU using Bob's account
    expect(() => {
      supabase.settleIOU(userB, iouA.id, 100000n, accB.id);
    }).toThrow('IOU not found or access denied by RLS');

    // Bob attempts to settle Alice's IOU referencing Alice's account
    expect(() => {
      supabase.settleIOU(userB, iouA.id, 100000n, accA.id);
    }).toThrow('IOU not found or access denied by RLS');

    // Alice's IOU remains untouched
    const aliceIOU = supabase.ious.get(iouA.id)!;
    expect(aliceIOU.remaining_balance_minor).toBe(500000n);
    expect(aliceIOU.status).toBe('OPEN');
  });

  // Edge 3: Cross-tenant foreign key hijacking with partial valid entries
  it('T2-RLS-03: rejects transaction when 1 of 4 entries references a foreign tenant account', () => {
    const supabase = new SupabaseOracle();
    const accA1 = supabase.createAccount(userA, { name: "Alice Checking", type: 'ASSET' });
    const accB1 = supabase.createAccount(userB, { name: "Bob Checking", type: 'ASSET' });
    const accB2 = supabase.createAccount(userB, { name: "Bob Groceries", type: 'EXPENSE' });
    const accB3 = supabase.createAccount(userB, { name: "Bob Utilities", type: 'EXPENSE' });

    // Bob submits multi-split where credit references Alice's checking account
    expect(() => {
      supabase.postTransaction(userB, {
        idempotencyKey: crypto.randomUUID(),
        transactionDate: '2026-11-08',
        description: 'Multi-split theft attempt',
        entries: [
          { accountId: accB2.id, amountMinor: 50000n, direction: 'DEBIT' },
          { accountId: accB3.id, amountMinor: 50000n, direction: 'DEBIT' },
          { accountId: accB1.id, amountMinor: 50000n, direction: 'CREDIT' },
          { accountId: accA1.id, amountMinor: 50000n, direction: 'CREDIT' } // Foreign account!
        ]
      });
    }).toThrow('Cross-tenant foreign key violation');
  });

  // Edge 4: Non-existent foreign key account reference
  it('T2-RLS-04: rejects transaction referencing a non-existent account UUID', () => {
    const supabase = new SupabaseOracle();
    const accB = supabase.createAccount(userB, { name: "Bob Checking", type: 'ASSET' });
    const fakeAccountId = crypto.randomUUID();

    expect(() => {
      supabase.postTransaction(userB, {
        idempotencyKey: crypto.randomUUID(),
        transactionDate: '2026-11-08',
        description: 'Ghost account reference',
        entries: [
          { accountId: accB.id, amountMinor: 1000n, direction: 'DEBIT' },
          { accountId: fakeAccountId, amountMinor: 1000n, direction: 'CREDIT' }
        ]
      });
    }).toThrow('Foreign key violation: account');
  });

  // Edge 5: Concurrent multi-tenant independent operations
  it('T2-RLS-05: executes interleaved transactions for 3 separate tenants without data collision', () => {
    const supabase = new SupabaseOracle();
    const tenants = [
      { session: userA, name: 'Alice' },
      { session: userB, name: 'Bob' },
      { session: { userId: crypto.randomUUID(), email: 'charlie@test.com', role: 'authenticated' as const }, name: 'Charlie' }
    ];

    const tenantAccounts = tenants.map(t => ({
      ...t,
      bank: supabase.createAccount(t.session, { name: `${t.name} Bank`, type: 'ASSET' }),
      expense: supabase.createAccount(t.session, { name: `${t.name} Expense`, type: 'EXPENSE' })
    }));

    // Post transactions in interleaved round-robin fashion
    for (let round = 1; round <= 3; round++) {
      for (const t of tenantAccounts) {
        supabase.postTransaction(t.session, {
          idempotencyKey: `idemp-${t.name}-rnd-${round}`,
          transactionDate: '2026-11-08',
          description: `${t.name} Expense Round ${round}`,
          entries: [
            { accountId: t.expense.id, amountMinor: BigInt(round * 500), direction: 'DEBIT' },
            { accountId: t.bank.id, amountMinor: BigInt(round * 500), direction: 'CREDIT' }
          ]
        });
      }
    }

    // Verify each tenant sees only their 3 transactions and exact balances
    for (const t of tenantAccounts) {
      const txs = supabase.getTransactions(t.session);
      expect(txs).toHaveLength(3);

      const bankAcc = supabase.getAccountById(t.session, t.bank.id)!;
      const expAcc = supabase.getAccountById(t.session, t.expense.id)!;

      // 500 + 1000 + 1500 = 3000 minor units
      expect(bankAcc.balance_minor).toBe(-3000n);
      expect(expAcc.balance_minor).toBe(3000n);
    }
  });
});
