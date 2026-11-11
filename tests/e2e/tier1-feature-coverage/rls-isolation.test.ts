/**
 * Tier 1: Feature Coverage — Supabase Row Level Security (RLS) Isolation
 * 
 * Verifies that authenticated user sessions are strictly isolated via RLS
 * policies (auth.uid() = user_id) across Accounts, Transactions, Journal Entries,
 * IOUs, and Sinking Funds.
 */

import { describe, it, expect } from '../infra/harness.ts';
import { SupabaseOracle } from '../infra/supabase-oracle.ts';
import type { UserSession } from '../infra/supabase-oracle.ts';
import * as crypto from 'node:crypto';

describe('Tier 1: Supabase Row Level Security (RLS) Isolation', () => {
  const userA: UserSession = {
    userId: crypto.randomUUID(),
    email: 'alice@example.com',
    role: 'authenticated'
  };

  const userB: UserSession = {
    userId: crypto.randomUUID(),
    email: 'bob@example.com',
    role: 'authenticated'
  };

  // Test 1: Account isolation
  it('T1-RLS-01: verifies accounts created by User A are invisible to User B', () => {
    const supabase = new SupabaseOracle();
    const accA = supabase.createAccount(userA, { name: "Alice's Secret Vault", type: 'ASSET' });

    const bobAccounts = supabase.getAccounts(userB);
    const aliceAccounts = supabase.getAccounts(userA);

    expect(bobAccounts).toHaveLength(0);
    expect(aliceAccounts).toHaveLength(1);
    expect(aliceAccounts[0].id).toBe(accA.id);
  });

  // Test 2: Account access by ID rejection
  it('T1-RLS-02: prevents User B from accessing User A account by specific UUID', () => {
    const supabase = new SupabaseOracle();
    const accA = supabase.createAccount(userA, { name: "Alice Checking", type: 'ASSET' });

    const fetchedByBob = supabase.getAccountById(userB, accA.id);
    const fetchedByAlice = supabase.getAccountById(userA, accA.id);

    expect(fetchedByBob).toBeNull();
    expect(fetchedByAlice).not.toBeNull();
    expect(fetchedByAlice?.name).toBe("Alice Checking");
  });

  // Test 3: Transaction & Journal Entry isolation
  it('T1-RLS-03: verifies transactions and journal entries posted by User A are invisible to User B', () => {
    const supabase = new SupabaseOracle();
    const accA1 = supabase.createAccount(userA, { name: "Alice Bank", type: 'ASSET' });
    const accA2 = supabase.createAccount(userA, { name: "Alice Salary", type: 'INCOME' });

    const { transaction } = supabase.postTransaction(userA, {
      idempotencyKey: crypto.randomUUID(),
      transactionDate: '2026-11-08',
      description: 'Alice Salary Credit',
      entries: [
        { accountId: accA1.id, amountMinor: 7500000n, direction: 'DEBIT' },
        { accountId: accA2.id, amountMinor: 7500000n, direction: 'CREDIT' }
      ]
    });

    const bobTransactions = supabase.getTransactions(userB);
    const bobEntries = supabase.getJournalEntries(userB, transaction.id);

    expect(bobTransactions).toHaveLength(0);
    expect(bobEntries).toHaveLength(0);

    const aliceTransactions = supabase.getTransactions(userA);
    const aliceEntries = supabase.getJournalEntries(userA, transaction.id);
    expect(aliceTransactions).toHaveLength(1);
    expect(aliceEntries).toHaveLength(2);
  });

  // Test 4: Cross-tenant foreign key hijacking rejection
  it('T1-RLS-04: strictly aborts transaction if User B attempts to reference User A account', () => {
    const supabase = new SupabaseOracle();
    const accA = supabase.createAccount(userA, { name: "Alice Savings", type: 'ASSET' });
    const accB = supabase.createAccount(userB, { name: "Bob Checking", type: 'ASSET' });

    expect(() => {
      supabase.postTransaction(userB, {
        idempotencyKey: crypto.randomUUID(),
        transactionDate: '2026-11-08',
        description: 'Cross tenant attack attempt',
        entries: [
          { accountId: accA.id, amountMinor: 100000n, direction: 'CREDIT' }, // Attempting to touch Alice's account!
          { accountId: accB.id, amountMinor: 100000n, direction: 'DEBIT' }
        ]
      });
    }).toThrow('Cross-tenant foreign key violation');
  });

  // Test 5: Peer Lending IOU isolation
  it('T1-RLS-05: verifies IOU debt records are isolated between distinct users', () => {
    const supabase = new SupabaseOracle();
    supabase.createIOU(userA, {
      counterpartyName: 'Charlie',
      direction: 'LENT',
      principalMinor: 500000n
    });

    const bobIOUs = supabase.getIOUs(userB);
    const aliceIOUs = supabase.getIOUs(userA);

    expect(bobIOUs).toHaveLength(0);
    expect(aliceIOUs).toHaveLength(1);
    expect(aliceIOUs[0].counterparty_name).toBe('Charlie');
  });

  // Test 6: Sinking fund isolation
  it('T1-RLS-06: isolates sinking funds between distinct authenticated users', () => {
    const supabase = new SupabaseOracle();
    supabase.createSinkingFund(userA, {
      name: 'Emergency Fund 2026',
      targetAmountMinor: 10000000n
    });

    const bobFunds = supabase.getSinkingFunds(userB);
    const aliceFunds = supabase.getSinkingFunds(userA);

    expect(bobFunds).toHaveLength(0);
    expect(aliceFunds).toHaveLength(1);
    expect(aliceFunds[0].name).toBe('Emergency Fund 2026');
  });
});
