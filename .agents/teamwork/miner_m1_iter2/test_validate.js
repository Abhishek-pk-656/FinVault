async function handleValidation(body) {
  try {
    const { entries } = body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return { status: 400, data: { error: 'Entries array is required' } };
    }

    if (entries.length < 2) {
      return { status: 400, data: { error: 'A transaction must contain at least two journal entries' } };
    }

    let debits = 0n;
    let credits = 0n;

    for (const e of entries) {
      if (!e.account_id || typeof e.account_id !== 'string') {
        return { status: 400, data: { error: 'Each entry must have a valid account_id' } };
      }

      if (e.amount_minor === undefined || e.amount_minor === null || e.amount_minor === '') {
        return { status: 400, data: { error: 'amount_minor is required for all entries' } };
      }

      let amount;
      try {
        amount = BigInt(e.amount_minor);
      } catch {
        return { status: 400, data: { error: `Invalid amount_minor: "${e.amount_minor}". Must be a valid integer.` } };
      }

      if (amount <= 0n) {
        return { status: 400, data: { error: `Journal entry amount must be strictly positive (> 0n), received: ${amount.toString()}n` } };
      }

      if (e.direction === 'DEBIT') {
        debits += amount;
      } else if (e.direction === 'CREDIT') {
        credits += amount;
      } else {
        return { status: 400, data: { error: `Invalid direction: "${e.direction}". Must be DEBIT or CREDIT.` } };
      }
    }

    if (debits !== credits) {
      return {
        status: 400,
        data: {
          error: 'Double-entry balance violation',
          debits: debits.toString(),
          credits: credits.toString(),
          difference: (debits - credits).toString(),
        }
      };
    }

    return {
      status: 200,
      data: { valid: true, balancedAmount: debits.toString() }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return { status: 500, data: { error: message } };
  }
}

// Test cases
async function runTests() {
  const cases = [
    {
      name: 'balanced 2-leg',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: 150000, direction: 'DEBIT' },
          { account_id: 'acc2', amount_minor: '150000', direction: 'CREDIT' }
        ]
      },
      expectedStatus: 200,
      expectedBalanced: '150000'
    },
    {
      name: 'unbalanced',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: 150000, direction: 'DEBIT' },
          { account_id: 'acc2', amount_minor: 140000, direction: 'CREDIT' }
        ]
      },
      expectedStatus: 400,
      expectedError: 'Double-entry balance violation'
    },
    {
      name: 'float rejected',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: 125.5, direction: 'DEBIT' },
          { account_id: 'acc2', amount_minor: 125.5, direction: 'CREDIT' }
        ]
      },
      expectedStatus: 400,
      expectedError: 'Invalid amount_minor'
    },
    {
      name: 'negative rejected',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: -100, direction: 'DEBIT' },
          { account_id: 'acc2', amount_minor: -100, direction: 'CREDIT' }
        ]
      },
      expectedStatus: 400,
      expectedError: 'strictly positive'
    },
    {
      name: 'single leg rejected',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: 100, direction: 'DEBIT' }
        ]
      },
      expectedStatus: 400,
      expectedError: 'at least two journal entries'
    },
    {
      name: 'huge bigint beyond safe integer',
      input: {
        entries: [
          { account_id: 'acc1', amount_minor: '900719925474099200', direction: 'DEBIT' },
          { account_id: 'acc2', amount_minor: '900719925474099200', direction: 'CREDIT' }
        ]
      },
      expectedStatus: 200,
      expectedBalanced: '900719925474099200'
    }
  ];

  for (const c of cases) {
    const res = await handleValidation(c.input);
    if (res.status !== c.expectedStatus) {
      console.error(`FAILED ${c.name}: expected status ${c.expectedStatus}, got ${res.status}`);
      process.exitCode = 1;
      return;
    }
    if (c.expectedBalanced && res.data.balancedAmount !== c.expectedBalanced) {
      console.error(`FAILED ${c.name}: expected balanced ${c.expectedBalanced}, got ${res.data.balancedAmount}`);
      process.exitCode = 1;
      return;
    }
    if (c.expectedError && !res.data.error.includes(c.expectedError)) {
      console.error(`FAILED ${c.name}: expected error containing "${c.expectedError}", got "${res.data.error}"`);
      process.exitCode = 1;
      return;
    }
    console.log(`[PASS] ${c.name}`);
  }
}

runTests();
