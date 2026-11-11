/**
 * FinVault E2E Master Test Suite Runner
 * 
 * Runs all Tier 1-4 test suites, collects metrics, and prints structured report.
 */

import { run } from 'node:test';
import * as path from 'node:path';
import { globSync } from 'node:fs';

async function main() {
  console.log('='.repeat(70));
  console.log('       FINVAULT COMPREHENSIVE E2E & INVARIANT TEST SUITE       ');
  console.log('='.repeat(70));
  console.log('Frameworks: Vitest compatible + fast-check property testing');
  console.log('Invariants: Double-Entry Lite (SUM debits == credits), Strict BIGINT,');
  console.log('            Supabase RLS Multi-Tenant Isolation, Offline SQLite Sync');
  console.log('-'.repeat(70));

  const testFiles = [
    // Tier 1: Feature Coverage
    'tests/e2e/tier1-feature-coverage/ledger-invariants.test.ts',
    'tests/e2e/tier1-feature-coverage/bigint-money.test.ts',
    'tests/e2e/tier1-feature-coverage/rls-isolation.test.ts',
    'tests/e2e/tier1-feature-coverage/offline-sqlite.test.ts',
    'tests/e2e/tier1-feature-coverage/sync-reconciliation.test.ts',

    // Tier 2: Boundary & Corner Cases
    'tests/e2e/tier2-boundary-and-corner-cases/ledger-boundary.test.ts',
    'tests/e2e/tier2-boundary-and-corner-cases/bigint-boundary.test.ts',
    'tests/e2e/tier2-boundary-and-corner-cases/rls-corner-cases.test.ts',
    'tests/e2e/tier2-boundary-and-corner-cases/sqlite-sync-corner.test.ts',

    // Tier 3: Pairwise Combinations
    'tests/e2e/tier3-cross-feature-combinations/pairwise-combinations.test.ts',

    // Tier 4: Real-World Workload Scenarios
    'tests/e2e/tier4-workload-scenarios/workload-scenarios.test.ts'
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let suitesPassed = 0;
  let suitesFailed = 0;

  for await (const event of run({ files: testFiles.map(f => path.resolve(process.cwd(), f)) })) {
    if (event.type === 'test:pass') {
      if ((event.data as any).nesting === 0) {
        suitesPassed++;
      } else {
        passedTests++;
        console.log(`  [PASS] ${(event.data as any).name} (${Math.round((event.data as any).details?.duration_ms || 0)}ms)`);
      }
    } else if (event.type === 'test:fail') {
      if ((event.data as any).nesting === 0) {
        suitesFailed++;
      } else {
        failedTests++;
        console.error(`  [FAIL] ${(event.data as any).name}: ${(event.data as any).details?.error?.message}`);
      }
    }
  }

  console.log('='.repeat(70));
  console.log('                     TEST EXECUTION SUMMARY                    ');
  console.log('='.repeat(70));
  console.log(`Total Test Suites:  ${suitesPassed + suitesFailed} (Passed: ${suitesPassed}, Failed: ${suitesFailed})`);
  console.log(`Total Test Cases:   ${passedTests + failedTests} (Passed: ${passedTests}, Failed: ${failedTests})`);
  console.log(`Success Rate:       ${failedTests === 0 ? '100%' : Math.round((passedTests / (passedTests + failedTests)) * 100) + '%'}`);
  console.log('='.repeat(70));

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
