const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert');

const db = new DatabaseSync(':memory:');

db.exec(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance_minor INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    direction TEXT NOT NULL
  );
`);

function applyJournalBalance(op, oldEntry, newEntry) {
  if (op === 'INSERT') {
    const acc = db.prepare('SELECT type, balance_minor FROM accounts WHERE id = ?').get(newEntry.account_id);
    let delta = 0;
    if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
      delta = newEntry.direction === 'DEBIT' ? newEntry.amount_minor : -newEntry.amount_minor;
    } else {
      delta = newEntry.direction === 'CREDIT' ? newEntry.amount_minor : -newEntry.amount_minor;
    }
    db.prepare('UPDATE accounts SET balance_minor = balance_minor + ? WHERE id = ?').run(delta, newEntry.account_id);
  } else if (op === 'DELETE') {
    const acc = db.prepare('SELECT type, balance_minor FROM accounts WHERE id = ?').get(oldEntry.account_id);
    let delta = 0;
    if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
      delta = oldEntry.direction === 'DEBIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
    } else {
      delta = oldEntry.direction === 'CREDIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
    }
    db.prepare('UPDATE accounts SET balance_minor = balance_minor + ? WHERE id = ?').run(delta, oldEntry.account_id);
  } else if (op === 'UPDATE') {
    // 1. Revert OLD
    const oldAcc = db.prepare('SELECT type, balance_minor FROM accounts WHERE id = ?').get(oldEntry.account_id);
    let oldDelta = 0;
    if (oldAcc.type === 'ASSET' || oldAcc.type === 'EXPENSE') {
      oldDelta = oldEntry.direction === 'DEBIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
    } else {
      oldDelta = oldEntry.direction === 'CREDIT' ? -oldEntry.amount_minor : oldEntry.amount_minor;
    }

    // 2. Apply NEW
    const newAcc = db.prepare('SELECT type, balance_minor FROM accounts WHERE id = ?').get(newEntry.account_id);
    let newDelta = 0;
    if (newAcc.type === 'ASSET' || newAcc.type === 'EXPENSE') {
      newDelta = newEntry.direction === 'DEBIT' ? newEntry.amount_minor : -newEntry.amount_minor;
    } else {
      newDelta = newEntry.direction === 'CREDIT' ? newEntry.amount_minor : -newEntry.amount_minor;
    }

    if (oldEntry.account_id === newEntry.account_id) {
      db.prepare('UPDATE accounts SET balance_minor = balance_minor + ? WHERE id = ?').run(oldDelta + newDelta, newEntry.account_id);
    } else {
      db.prepare('UPDATE accounts SET balance_minor = balance_minor + ? WHERE id = ?').run(oldDelta, oldEntry.account_id);
      db.prepare('UPDATE accounts SET balance_minor = balance_minor + ? WHERE id = ?').run(newDelta, newEntry.account_id);
    }
  }
}

// Setup accounts
db.prepare("INSERT INTO accounts VALUES ('acc1', 'u1', 'Bank', 'ASSET', 100000)").run();
db.prepare("INSERT INTO accounts VALUES ('acc2', 'u1', 'Expenses', 'EXPENSE', 0)").run();
db.prepare("INSERT INTO accounts VALUES ('acc3', 'u1', 'Income', 'INCOME', 0)").run();

// Initial transaction: DEBIT Expenses 5000, CREDIT Bank 5000
const e1 = { id: 'j1', user_id: 'u1', transaction_id: 't1', account_id: 'acc2', amount_minor: 5000, direction: 'DEBIT' };
const e2 = { id: 'j2', user_id: 'u1', transaction_id: 't1', account_id: 'acc1', amount_minor: 5000, direction: 'CREDIT' };

applyJournalBalance('INSERT', null, e1);
applyJournalBalance('INSERT', null, e2);

let bank = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc1'").get().balance_minor;
let exp = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc2'").get().balance_minor;
assert.strictEqual(bank, 95000, 'Bank decremented by 5000');
assert.strictEqual(exp, 5000, 'Expense incremented by 5000');
console.log('✓ Initial insert passed: Bank=95000, Expense=5000');

// Scenario 1: UPDATE amount from 5000 to 7000 on Expense and Bank
const e1_updated = { ...e1, amount_minor: 7000 };
const e2_updated = { ...e2, amount_minor: 7000 };

applyJournalBalance('UPDATE', e1, e1_updated);
applyJournalBalance('UPDATE', e2, e2_updated);

bank = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc1'").get().balance_minor;
exp = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc2'").get().balance_minor;
assert.strictEqual(bank, 93000, 'Bank decremented to 93000');
assert.strictEqual(exp, 7000, 'Expense incremented to 7000');
console.log('✓ Update amount passed: Bank=93000, Expense=7000');

// Scenario 2: UPDATE account_id from Expense (acc2) to Income (acc3) with direction flip
// Reassign e1 from Expense (acc2) DEBIT 7000 to Income (acc3) CREDIT 7000
const e1_reassigned = { ...e1_updated, account_id: 'acc3', direction: 'CREDIT' };
applyJournalBalance('UPDATE', e1_updated, e1_reassigned);

exp = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc2'").get().balance_minor;
let inc = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc3'").get().balance_minor;
assert.strictEqual(exp, 0, 'Expense restored to 0 after reassignment');
assert.strictEqual(inc, 7000, 'Income credited with 7000');
console.log('✓ Account reassignment passed: Expense restored to 0, Income=7000');

// Scenario 3: DELETE restores everything
applyJournalBalance('DELETE', e1_reassigned, null);
applyJournalBalance('DELETE', e2_updated, null);

bank = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc1'").get().balance_minor;
exp = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc2'").get().balance_minor;
inc = db.prepare("SELECT balance_minor FROM accounts WHERE id = 'acc3'").get().balance_minor;
assert.strictEqual(bank, 100000, 'Bank restored to 100000');
assert.strictEqual(exp, 0, 'Expense is 0');
assert.strictEqual(inc, 0, 'Income restored to 0');
console.log('✓ Delete restores all balances cleanly: Bank=100000, Exp=0, Inc=0');
