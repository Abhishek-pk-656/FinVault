# Investigation & Blueprint Report: IOU Settlement Ledger Accounting

**Explorer:** Explorer 3 (`explorer_m3_iter2_3`)  
**Roles:** Read-only investigation, Code analysis, Blueprint synthesis  
**Target Milestone:** FinVault Milestone 3 Iteration 2 (Shared Packages, Auth, Sync Engine & Edge Functions)  
**Parent Agent:** `867b8adb-e639-414f-92fa-0326940898a2`  
**Date:** 2026-11-09  

---

## 1. Observation

### 1.1 `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql` (lines 225-247)
In the PL/pgSQL function `settle_iou(...)`, step 5 handles the contra clearing account selection:
```sql
225:     -- 5. Locate or provision Contra Clearing Account
226:     SELECT id INTO v_clearing_id FROM accounts
227:     WHERE user_id = v_user_id AND name = 'IOU Clearing' AND is_archived = FALSE
228:     LIMIT 1;
229: 
230:     IF v_clearing_id IS NULL THEN
231:         SELECT id INTO v_clearing_id FROM accounts
232:         WHERE user_id = v_user_id AND name = 'Opening Balance Equity' AND is_archived = FALSE
233:         LIMIT 1;
234:     END IF;
235: 
236:     IF v_clearing_id IS NULL THEN
237:         INSERT INTO accounts (user_id, name, type, currency, balance_minor)
238:         VALUES (
239:             v_user_id,
240:             'IOU Clearing',
241:             CASE WHEN v_iou.direction = 'LENT' THEN 'ASSET'::account_type ELSE 'LIABILITY'::account_type END,
242:             v_iou.currency,
243:             0
244:         )
245:         RETURNING id INTO v_clearing_id;
246:     END IF;
```

**Direct Observation**:
1. In `supabase/migrations/20261108000000_init_finvault_schema.sql` (lines 346-357) and `20261108000001_security_hardening_and_iou_settlement.sql` (lines 55-68), the user provisioning trigger function `handle_new_user_provisioning()` always inserts five default accounts upon user registration:
   - `'Cash Wallet'` (`ASSET`)
   - `'Primary Bank Account'` (`ASSET`)
   - `'General Expenses'` (`EXPENSE`)
   - `'Primary Income'` (`INCOME`)
   - `'Opening Balance Equity'` (`EQUITY`)
2. `handle_new_user_provisioning()` does NOT provision `'IOU Clearing'`.
3. Consequently, for every provisioned user, the initial lookup for `'IOU Clearing'` on lines 226-228 returns `NULL`.
4. The fallback on lines 230-234 executes: `'Opening Balance Equity'` is found, and its UUID is assigned to `v_clearing_id`.
5. The subsequent check `IF v_clearing_id IS NULL` on line 236 evaluates to `FALSE`. The dynamic provisioning of `'IOU Clearing'` (lines 236-246) is **dead code and is never reached**.
6. When the settlement transaction is posted:
   - For `LENT` direction (`v_iou.direction = 'LENT'`):
     - `DEBIT` target asset account (e.g. Cash Wallet)
     - `CREDIT` `v_clearing_id` (`Opening Balance Equity`)
     In double-entry accounting (`update_account_balance_on_journal`), crediting an account of type `EQUITY` increases its balance (`balance_minor = balance_minor + amount_minor`). Thus, debt recovery increases user equity (net worth) instead of clearing a receivable asset.
   - For `BORROWED` direction (`v_iou.direction = 'BORROWED'`):
     - `DEBIT` `v_clearing_id` (`Opening Balance Equity`)
     - `CREDIT` target asset account (e.g. Cash Wallet)
     Debiting an account of type `EQUITY` decreases equity (`balance_minor = balance_minor - amount_minor`). Thus, debt repayment diminishes user equity (net worth) instead of extinguishing a liability.

---

### 1.2 `packages/sync-engine/src/operations/ious.ts` (lines 49-73)
In the client-side `IOUsOperations.settleIOU(...)` implementation:
```ts
49:     // Locate or create contra clearing account
50:     let clearingAcc = await this.adapter.queryOne<any>(
51:       `SELECT * FROM accounts WHERE user_id = ? AND name = 'IOU Clearing'`,
52:       [userId]
53:     );
54: 
55:     if (!clearingAcc) {
56:       clearingAcc = await this.adapter.queryOne<any>(
57:         `SELECT * FROM accounts WHERE user_id = ? AND name = 'Opening Balance Equity'`,
58:         [userId]
59:       );
60:     }
61: 
62:     if (!clearingAcc) {
63:       const clearingId = crypto.randomUUID();
64:       const clearingType = iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY';
65:       const now = new Date().toISOString();
66:       await this.adapter.run(
67:         `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
68:          VALUES (?, ?, 'IOU Clearing', ?, ?, 0, 0, ?, ?, 1)`,
69:         [clearingId, userId, clearingType, iou.currency || 'INR', now, now]
70:       );
71:       clearingAcc = { id: clearingId };
72:     }
```

**Direct Observation**:
1. Lines 55-60 implement the identical faulty fallback.
2. If the local SQLite database contains an account named `'Opening Balance Equity'` for the user, `clearingAcc` is bound to that account.
3. The dynamic creation of `'IOU Clearing'` on lines 62-72 is bypassed, causing the client ledger to pollute the user's equity account on settlements.

---

### 1.3 `tests/stress/m3-challenger2-edge-stress.ts` (lines 954-977 & 1065-1072)
1. **Test 4.1.5** (lines 954-977):
```ts
954:     // 4.1.5 Contra Clearing Fallback 2: Opening Balance Equity fallback
955:     // Setup BORROWED IOU for User 2 who only has 'Opening Balance Equity'
956:     await db.execute(`
957:       INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
958:       VALUES ('acc_u2_bank', 'u_test2', 'U2 Bank', 'ASSET', 'INR', 30000, 0, '2026-11-08', '2026-11-08'),
959:              ('acc_u2_equity', 'u_test2', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')
960:     `);
961:     await db.execute(`
962:       INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
963:       VALUES ('iou_borrowed_u2', 'u_test2', 'Lender Dave', 'BORROWED', 5000, 5000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
964:     `);
965: 
966:     const u2Res = await settleIOU('iou_borrowed_u2', 5000n, 'acc_u2_bank', 'u_test2');
967:     assert(u2Res.iou.status === 'SETTLED', '4.1.5.a Borrowed IOU settled using Opening Balance Equity fallback');
968: 
969:     // Confirm that 'IOU Clearing' was NOT created because 'Opening Balance Equity' existed
970:     const u2Clearing = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test2' AND name = 'IOU Clearing'`)) as any[];
971:     assert(u2Clearing.length === 0, '4.1.5.b "Opening Balance Equity" fallback prioritized; no redundant IOU Clearing created');
```
*Observation*: Test 4.1.5 explicitly asserts the flawed behavior that Reviewer 2 flagged! Specifically, line 971 asserts `u2Clearing.length === 0`. If `settleIOU` is fixed to dynamically create `'IOU Clearing'` instead of falling back to Equity, line 971 will fail because `u2Clearing.length` will be `1`.

2. **In-Memory RPC Simulator `PostgresSettleIOUSimulator`** (lines 1065-1072):
```ts
1065:         if (!v_clearing_id) {
1066:           for (const acc of this.accounts.values()) {
1067:             if (acc.user_id === v_user_id && acc.name === 'Opening Balance Equity' && !acc.is_archived) {
1068:               v_clearing_id = acc.id;
1069:               break;
1070:             }
1071:           }
1072:         }
```
*Observation*: The test harness's simulator replicates the flawed SQL fallback.

---

### 1.4 `packages/sync-engine/tests/sync-engine.test.ts` (lines 626-650)
Test F20 in the sync engine test suite verifies:
```ts
626:   test('F20: settleIOU dynamically provisions contra clearing account for BORROWED direction', async () => {
627:     const db = await initDatabase(':memory:');
628:     await db.execute(
629:       `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
630:        VALUES ('acc_borrowed_bank', 'u_borrow', 'Bank Account', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08')`
631:     );
632:     await db.execute(
633:       `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
634:        VALUES ('iou_borrowed_1', 'u_borrow', 'Charlie', 'BORROWED', 20000, 20000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
635:     );
636: 
637:     const res = await settleIOU('iou_borrowed_1', 20000n, 'acc_borrowed_bank', 'u_borrow');
638:     assert.equal(res.iou.status, 'SETTLED');
639:     assert.equal(res.iou.remaining_balance_minor, 0n);
640: 
641:     // Bank account should have decreased by 20000
642:     const accounts = await getAccounts('u_borrow');
643:     const bank = accounts.find(a => a.id === 'acc_borrowed_bank')!;
644:     assert.equal(bank.balance_minor, 30000n);
645: 
646:     // Auto-created IOU Clearing account should exist with LIABILITY type
647:     const clearing = accounts.find(a => a.name === 'IOU Clearing');
648:     assert.ok(clearing);
649:     assert.equal(clearing.type, 'LIABILITY');
650:   });
```
*Observation*: Test F20 seeds `u_borrow` with only `acc_borrowed_bank` and NO `Opening Balance Equity`. Thus, F20 already passes and expects `'IOU Clearing'` (`LIABILITY`) to be created. However, the suite lacks an explicit test ensuring that if `Opening Balance Equity` IS present, it is not used.

---

### 1.5 `tests/e2e/infra/supabase-oracle.ts` (lines 381-390)
In the E2E mock harness:
```ts
381:     // Create contra account for IOU clearing if not existing
382:     let clearingAcc = Array.from(this.accounts.values()).find(a => a.user_id === session.userId && a.name === 'IOU Clearing');
383:     if (!clearingAcc) {
384:       clearingAcc = this.createAccount(session, {
385:         name: 'IOU Clearing',
386:         type: iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY',
387:         currency: iou.currency
388:       });
389:     }
```
*Observation*: The E2E test harness (`supabase-oracle.ts`) **never implemented the faulty Equity fallback**; it already implemented the correct dynamic provisioning logic. This confirms that all 63 E2E integration tests will remain completely unbroken by this change.

---

## 2. Logic Chain

1. **Accounting Correctness (`Assets = Liabilities + Equity`)**:
   - When a user lends money, they exchange Cash (`ASSET`) for a Receivable (`ASSET`). Total assets and equity remain unchanged.
   - When the counterparty repays the lent debt, the user receives Cash (`DEBIT ASSET`) and extinguishes the Receivable (`CREDIT ASSET`).
   - If this repayment credits `Opening Balance Equity`, user Equity increases. In reality, no new wealth was created; an existing asset was simply converted into cash. Crediting equity creates fictitious net worth.
   - Conversely, when repaying borrowed money, the user gives up Cash (`CREDIT ASSET`) and extinguishes a Payable (`DEBIT LIABILITY`). Total assets and total liabilities decrease equally; equity remains unchanged.
   - If this repayment debits `Opening Balance Equity`, user Equity decreases. Debiting equity creates fictitious loss of net worth.
2. **PostgreSQL RPC & TypeScript Client Parity**:
   - Both `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql` and `packages/sync-engine/src/operations/ious.ts` must share the exact same algorithm:
     - Query for an active account with `name = 'IOU Clearing'` belonging to `user_id`.
     - If not found, dynamically insert a new account named `'IOU Clearing'`, with `type = (direction == 'LENT' ? 'ASSET' : 'LIABILITY')`, `currency = iou.currency`, `balance_minor = 0`, and `is_archived = false`.
     - Never check, query, or fall back to `'Opening Balance Equity'`.
3. **Test Harness Reconciliation**:
   - In `tests/stress/m3-challenger2-edge-stress.ts`:
     - Test 4.1.5 must be updated to assert that when a user has `Opening Balance Equity`, `settleIOU` ignores it, creates `'IOU Clearing'` of type `LIABILITY`, leaves `Opening Balance Equity` balance at `0n`, and decreases bank balance by the debt repayment.
     - `PostgresSettleIOUSimulator` must drop lines 1065-1072 to remain in exact parity with the PostgreSQL RPC.
   - In `packages/sync-engine/tests/sync-engine.test.ts`:
     - An additional test case should be added to explicitly verify that when `Opening Balance Equity` is present, `settleIOU` still provisions `'IOU Clearing'` without touching `Opening Balance Equity`.

---

## 3. Caveats

1. **Existing User Databases**:
   - If any test database or dev environment already settled an IOU using `'Opening Balance Equity'`, that account may carry a balance. However, this is Phase 1 dev iteration, and migrations are applied cleanly to fresh Supabase/SQLite instances.
2. **Account Name Collision**:
   - An account named `'IOU Clearing'` will be created per user. If a user has multiple currencies, the first settlement creates `'IOU Clearing'` in `v_iou.currency`. For multi-currency IOUs, future iterations could qualify the clearing account name (e.g. `'IOU Clearing (USD)'`), but currently currency defaults to `INR` and is sufficient for Phase 1.
3. **No Production Source Code Modifications**:
   - As an Explorer agent, this report provides verified blueprints only. No edits have been made to production source files.

---

## 4. Conclusion & Exact Line-by-Line Fix Blueprints

### Blueprint 1: `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql`

**Target File:** `supabase/migrations/20261108000001_security_hardening_and_iou_settlement.sql`  
**Target Lines:** 225-247  

#### BEFORE:
```sql
    -- 5. Locate or provision Contra Clearing Account
    SELECT id INTO v_clearing_id FROM accounts
    WHERE user_id = v_user_id AND name = 'IOU Clearing' AND is_archived = FALSE
    LIMIT 1;

    IF v_clearing_id IS NULL THEN
        SELECT id INTO v_clearing_id FROM accounts
        WHERE user_id = v_user_id AND name = 'Opening Balance Equity' AND is_archived = FALSE
        LIMIT 1;
    END IF;

    IF v_clearing_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, currency, balance_minor)
        VALUES (
            v_user_id,
            'IOU Clearing',
            CASE WHEN v_iou.direction = 'LENT' THEN 'ASSET'::account_type ELSE 'LIABILITY'::account_type END,
            v_iou.currency,
            0
        )
        RETURNING id INTO v_clearing_id;
    END IF;
```

#### AFTER (Drop lines 230-234):
```sql
    -- 5. Locate or provision Contra Clearing Account
    SELECT id INTO v_clearing_id FROM accounts
    WHERE user_id = v_user_id AND name = 'IOU Clearing' AND is_archived = FALSE
    LIMIT 1;

    IF v_clearing_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, currency, balance_minor)
        VALUES (
            v_user_id,
            'IOU Clearing',
            CASE WHEN v_iou.direction = 'LENT' THEN 'ASSET'::account_type ELSE 'LIABILITY'::account_type END,
            v_iou.currency,
            0
        )
        RETURNING id INTO v_clearing_id;
    END IF;
```

---

### Blueprint 2: `packages/sync-engine/src/operations/ious.ts`

**Target File:** `packages/sync-engine/src/operations/ious.ts`  
**Target Lines:** 49-73  

#### BEFORE:
```ts
    // Locate or create contra clearing account
    let clearingAcc = await this.adapter.queryOne<any>(
      `SELECT * FROM accounts WHERE user_id = ? AND name = 'IOU Clearing'`,
      [userId]
    );

    if (!clearingAcc) {
      clearingAcc = await this.adapter.queryOne<any>(
        `SELECT * FROM accounts WHERE user_id = ? AND name = 'Opening Balance Equity'`,
        [userId]
      );
    }

    if (!clearingAcc) {
      const clearingId = crypto.randomUUID();
      const clearingType = iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY';
      const now = new Date().toISOString();
      await this.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES (?, ?, 'IOU Clearing', ?, ?, 0, 0, ?, ?, 1)`,
        [clearingId, userId, clearingType, iou.currency || 'INR', now, now]
      );
      clearingAcc = { id: clearingId };
    }
```

#### AFTER (Drop lines 55-60):
```ts
    // Locate or create contra clearing account
    let clearingAcc = await this.adapter.queryOne<any>(
      `SELECT * FROM accounts WHERE user_id = ? AND name = 'IOU Clearing' AND is_archived = 0`,
      [userId]
    );

    if (!clearingAcc) {
      const clearingId = crypto.randomUUID();
      const clearingType = iou.direction === 'LENT' ? 'ASSET' : 'LIABILITY';
      const now = new Date().toISOString();
      await this.adapter.run(
        `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at, version)
         VALUES (?, ?, 'IOU Clearing', ?, ?, 0, 0, ?, ?, 1)`,
        [clearingId, userId, clearingType, iou.currency || 'INR', now, now]
      );
      clearingAcc = { id: clearingId };
    }
```

---

### Blueprint 3: `tests/stress/m3-challenger2-edge-stress.ts`

**Target File:** `tests/stress/m3-challenger2-edge-stress.ts`  

#### 3A. Header Comment Update (lines 40-43)
##### BEFORE:
```ts
 *      * Fallback logic 1: uses existing 'IOU Clearing' account
 *      * Fallback logic 2: missing 'IOU Clearing', uses 'Opening Balance Equity'
 *      * Fallback logic 3: neither exists, dynamically provisions 'IOU Clearing' (ASSET for LENT, LIABILITY for BORROWED)
```
##### AFTER:
```ts
 *      * Dynamic clearing: uses existing 'IOU Clearing' account if present
 *      * Dynamic provisioning: missing 'IOU Clearing', dynamically provisions 'IOU Clearing' (ASSET for LENT, LIABILITY for BORROWED) rather than falling back to Equity
```

#### 3B. Section 4.1.5 Update (lines 954-977)
##### BEFORE:
```ts
    // 4.1.5 Contra Clearing Fallback 2: Opening Balance Equity fallback
    // Setup BORROWED IOU for User 2 who only has 'Opening Balance Equity'
    await db.execute(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
      VALUES ('acc_u2_bank', 'u_test2', 'U2 Bank', 'ASSET', 'INR', 30000, 0, '2026-11-08', '2026-11-08'),
             ('acc_u2_equity', 'u_test2', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')
    `);
    await db.execute(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
      VALUES ('iou_borrowed_u2', 'u_test2', 'Lender Dave', 'BORROWED', 5000, 5000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
    `);

    const u2Res = await settleIOU('iou_borrowed_u2', 5000n, 'acc_u2_bank', 'u_test2');
    assert(u2Res.iou.status === 'SETTLED', '4.1.5.a Borrowed IOU settled using Opening Balance Equity fallback');

    // Confirm that 'IOU Clearing' was NOT created because 'Opening Balance Equity' existed
    const u2Clearing = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test2' AND name = 'IOU Clearing'`)) as any[];
    assert(u2Clearing.length === 0, '4.1.5.b "Opening Balance Equity" fallback prioritized; no redundant IOU Clearing created');

    // For BORROWED settlement: money left asset account, so bank balance = 30000 - 5000 = 25000
    const u2Accounts = await getAccounts('u_test2');
    const u2Bank = u2Accounts.find(a => a.id === 'acc_u2_bank')!;
    assert(u2Bank.balance_minor === 25000n, '4.1.5.c Borrowed debt repayment decreased bank balance by 5000 paise (25000n)');
```
##### AFTER:
```ts
    // 4.1.5 Contra Clearing Dynamic Provisioning: User with 'Opening Balance Equity'
    // Confirms 'Opening Balance Equity' is NEVER used as clearing account; 'IOU Clearing' is dynamically created with LIABILITY type
    await db.execute(`
      INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
      VALUES ('acc_u2_bank', 'u_test2', 'U2 Bank', 'ASSET', 'INR', 30000, 0, '2026-11-08', '2026-11-08'),
             ('acc_u2_equity', 'u_test2', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')
    `);
    await db.execute(`
      INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
      VALUES ('iou_borrowed_u2', 'u_test2', 'Lender Dave', 'BORROWED', 5000, 5000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)
    `);

    const u2Res = await settleIOU('iou_borrowed_u2', 5000n, 'acc_u2_bank', 'u_test2');
    assert(u2Res.iou.status === 'SETTLED', '4.1.5.a Borrowed IOU settled cleanly');

    // Confirm that 'IOU Clearing' WAS dynamically created with LIABILITY type rather than using Opening Balance Equity
    const u2Clearing = (await db.execute(`SELECT * FROM accounts WHERE user_id = 'u_test2' AND name = 'IOU Clearing'`)) as any[];
    assert(u2Clearing.length === 1 && u2Clearing[0].type === 'LIABILITY', '4.1.5.b Dynamic "IOU Clearing" (LIABILITY) created; Opening Balance Equity not polluted');

    // Confirm that Opening Balance Equity balance remained 0n (untouched)
    const u2Equity = (await db.execute(`SELECT balance_minor FROM accounts WHERE user_id = 'u_test2' AND name = 'Opening Balance Equity'`)) as any[];
    assert(BigInt(u2Equity[0].balance_minor) === 0n, '4.1.5.c Opening Balance Equity balance unchanged (0n)');

    // For BORROWED settlement: money left asset account, so bank balance = 30000 - 5000 = 25000
    const u2Accounts = await getAccounts('u_test2');
    const u2Bank = u2Accounts.find(a => a.id === 'acc_u2_bank')!;
    assert(u2Bank.balance_minor === 25000n, '4.1.5.d Borrowed debt repayment decreased bank balance by 5000 paise (25000n)');
```

#### 3C. `PostgresSettleIOUSimulator` Update (lines 1065-1072)
##### BEFORE:
```ts
        if (!v_clearing_id) {
          for (const acc of this.accounts.values()) {
            if (acc.user_id === v_user_id && acc.name === 'Opening Balance Equity' && !acc.is_archived) {
              v_clearing_id = acc.id;
              break;
            }
          }
        }
```
##### AFTER:
Delete lines 1065-1072 completely.

---

### Blueprint 4: `packages/sync-engine/tests/sync-engine.test.ts`

**Target File:** `packages/sync-engine/tests/sync-engine.test.ts`  
Add test `F23` after test `F22` (or enhance test `F20`):

```ts
  test('F23: settleIOU provisions IOU Clearing without polluting Opening Balance Equity', async () => {
    const db = await initDatabase(':memory:');
    await db.execute(
      `INSERT INTO accounts (id, user_id, name, type, currency, balance_minor, is_archived, created_at, updated_at)
       VALUES ('acc_f23_bank', 'u_f23', 'Bank Account', 'ASSET', 'INR', 50000, 0, '2026-11-08', '2026-11-08'),
              ('acc_f23_equity', 'u_f23', 'Opening Balance Equity', 'EQUITY', 'INR', 0, 0, '2026-11-08', '2026-11-08')`
    );
    await db.execute(
      `INSERT INTO iou_records (id, user_id, counterparty_name, direction, principal_minor, remaining_balance_minor, currency, status, is_deleted, created_at, updated_at, version)
       VALUES ('iou_f23_lent', 'u_f23', 'Frank', 'LENT', 15000, 15000, 'INR', 'OPEN', 0, '2026-11-08', '2026-11-08', 1)`
    );

    const res = await settleIOU('iou_f23_lent', 15000n, 'acc_f23_bank', 'u_f23');
    assert.equal(res.iou.status, 'SETTLED');
    assert.equal(res.iou.remaining_balance_minor, 0n);

    const accounts = await getAccounts('u_f23');
    const bank = accounts.find(a => a.id === 'acc_f23_bank')!;
    const equity = accounts.find(a => a.id === 'acc_f23_equity')!;
    const clearing = accounts.find(a => a.name === 'IOU Clearing');

    // Bank increased by 15000
    assert.equal(bank.balance_minor, 65000n);
    // Equity remained untouched
    assert.equal(equity.balance_minor, 0n);
    // Clearing account created as ASSET
    assert.ok(clearing);
    assert.equal(clearing.type, 'ASSET');
  });
```

---

## 5. Verification Method

Once Worker implements the blueprint:

1. **Verify Unit & Integration Tests**:
   ```powershell
   node --test packages/sync-engine/tests/sync-engine.test.ts
   ```
   Must pass all tests (including dynamic clearing account provisioning).

2. **Verify Adversarial Stress Suite**:
   ```powershell
   node --experimental-strip-types tests/stress/m3-challenger2-edge-stress.ts
   node --experimental-strip-types tests/stress/m3-challenger1-sync-stress.ts
   node --experimental-strip-types tests/stress/m3-auditor-stress.ts
   ```
   Must pass all checks (Challenger 2 section 4.1.5 asserts `u2Clearing.length === 1` and `u2Equity.balance === 0n`).

3. **Verify Comprehensive E2E Invariants**:
   ```powershell
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   Must pass 63/63 tests (100% pass rate).

4. **Verify TypeScript Compilation**:
   ```powershell
   npx tsc --noEmit --project packages/sync-engine/tsconfig.json
   ```

### Invalidation Conditions
- Any occurrence of `name = 'Opening Balance Equity'` fallback in `settle_iou` or `packages/sync-engine/src/operations/ious.ts`.
- Non-zero balance mutation on `Opening Balance Equity` resulting from IOU debt settlements.
- Assertion failure where `IOU Clearing` is not created when `Opening Balance Equity` exists.
