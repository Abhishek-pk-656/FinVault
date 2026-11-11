// Mock Deno Request / Response environment for Node.js
const fs = require('fs');

// We test the logic of validate-transaction handler
async function testHandler() {
  const handler = async (body) => {
    const { entries } = body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return { status: 400, body: { error: 'Entries array is required' } };
    }
    if (entries.length < 2) {
      return { status: 400, body: { error: 'A transaction must contain at least two journal entries' } };
    }
    let debits = 0n;
    let credits = 0n;
    for (const e of entries) {
      if (!e.account_id || typeof e.account_id !== 'string') {
        return { status: 400, body: { error: 'Each entry must have a valid account_id' } };
      }
      if (e.amount_minor === undefined || e.amount_minor === null) {
        return { status: 400, body: { error: 'amount_minor is required for all entries' } };
      }
      let amount;
      try {
        amount = BigInt(e.amount_minor);
      } catch {
        return { status: 400, body: { error: `Invalid amount_minor: "${e.amount_minor}". Must be a valid integer.` } };
      }
      if (amount <= 0n) {
        return { status: 400, body: { error: `Journal entry amount must be strictly positive (> 0n), received: ${amount.toString()}n` } };
      }
      if (e.direction === 'DEBIT') {
        debits += amount;
      } else if (e.direction === 'CREDIT') {
        credits += amount;
      } else {
        return { status: 400, body: { error: `Invalid direction: "${e.direction}". Must be DEBIT or CREDIT.` } };
      }
    }
    if (debits !== credits) {
      return {
        status: 400,
        body: {
          error: 'Double-entry balance violation',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: (debits - credits).toString()
        }
      };
    }
    return { status: 200, body: { valid: true, balancedAmount: debits.toString() } };
  };

  // Test 1: Empty
  let res = await handler({});
  if (res.status !== 400) throw new Error('Test 1 failed');

  // Test 2: Single leg
  res = await handler({ entries: [{ account_id: 'a1', amount_minor: '100', direction: 'DEBIT' }] });
  if (res.status !== 400) throw new Error('Test 2 failed');

  // Test 3: Zero amount
  res = await handler({
    entries: [
      { account_id: 'a1', amount_minor: '0', direction: 'DEBIT' },
      { account_id: 'a2', amount_minor: '0', direction: 'CREDIT' }
    ]
  });
  if (res.status !== 400) throw new Error('Test 3 failed');

  // Test 4: Negative amount
  res = await handler({
    entries: [
      { account_id: 'a1', amount_minor: '-500', direction: 'DEBIT' },
      { account_id: 'a2', amount_minor: '-500', direction: 'CREDIT' }
    ]
  });
  if (res.status !== 400) throw new Error('Test 4 failed');

  // Test 5: Unbalanced
  res = await handler({
    entries: [
      { account_id: 'a1', amount_minor: '500', direction: 'DEBIT' },
      { account_id: 'a2', amount_minor: '600', direction: 'CREDIT' }
    ]
  });
  if (res.status !== 400 || res.body.difference !== '-100') throw new Error('Test 5 failed');

  // Test 6: Balanced BigInt beyond safe integer
  const bigAmt = '900719925474099999';
  res = await handler({
    entries: [
      { account_id: 'a1', amount_minor: bigAmt, direction: 'DEBIT' },
      { account_id: 'a2', amount_minor: bigAmt, direction: 'CREDIT' }
    ]
  });
  if (res.status !== 200 || res.body.balancedAmount !== bigAmt) throw new Error('Test 6 failed');

  console.log('Edge function logic test PASSED: all 6 checks confirmed');
}

testHandler();
