/**
 * FinVault Milestone 1 Verification Script
 * Executed by Reviewers and Challengers to verify Milestone 1 completion.
 * Run with: node .agents/teamwork/explorer_m1_3/verify-m1.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${message}`);
  }
}

function checkFileExists(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const exists = fs.existsSync(fullPath);
  assert(exists, `File exists: ${relPath}`);
  return exists;
}

function checkJsonValid(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `JSON file exists: ${relPath}`);
    return;
  }
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    // Strip simple comments for tsconfig if present
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '');
    JSON.parse(cleanContent);
    assert(true, `JSON is valid: ${relPath}`);
  } catch (err) {
    assert(false, `JSON parsing failed for ${relPath}: ${err.message}`);
  }
}

function checkFileContains(relPath, regex, desc) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `File exists for content check: ${relPath}`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(regex.test(content), `${relPath} ${desc}`);
}

function checkFileNotContains(relPath, regex, desc) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    assert(false, `File exists for content check: ${relPath}`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  assert(!regex.test(content), `${relPath} ${desc}`);
}

console.log('====================================================');
console.log('FinVault M1 Verification Suite');
console.log('Target Root:', ROOT);
console.log('====================================================\n');

// 1. Monorepo Root Scaffolding
console.log('--- 1. Monorepo Root Scaffolding ---');
checkFileExists('package.json');
checkFileExists('pnpm-workspace.yaml');
checkFileExists('turbo.json');
checkFileExists('tsconfig.base.json');
checkFileExists('tsconfig.json');
checkFileExists('.gitignore');
checkFileExists('.env.example');

checkJsonValid('package.json');
checkJsonValid('turbo.json');
checkJsonValid('tsconfig.base.json');
checkJsonValid('tsconfig.json');

// 2. Shared Packages Scaffolding
console.log('\n--- 2. Shared Packages Scaffolding ---');
const packages = [
  { name: 'db-types', file: 'packages/db-types/src/index.ts' },
  { name: 'sync-engine', file: 'packages/sync-engine/src/index.ts' },
  { name: 'ui', file: 'packages/ui/src/index.tsx' }
];

for (const pkg of packages) {
  checkFileExists(`packages/${pkg.name}/package.json`);
  checkFileExists(`packages/${pkg.name}/tsconfig.json`);
  checkFileExists(pkg.file);
  checkJsonValid(`packages/${pkg.name}/package.json`);
  checkJsonValid(`packages/${pkg.name}/tsconfig.json`);
}
checkFileExists('packages/ui/src/tokens.ts');

// 3. Application Cockpits Scaffolding
console.log('\n--- 3. Applications Scaffolding ---');
checkFileExists('apps/web/package.json');
checkFileExists('apps/web/tsconfig.json');
checkFileExists('apps/web/next.config.mjs');
checkFileExists('apps/web/tailwind.config.ts');
checkFileExists('apps/web/postcss.config.js');
checkFileExists('apps/web/src/app/layout.tsx');
checkFileExists('apps/web/src/app/page.tsx');
checkJsonValid('apps/web/package.json');
checkJsonValid('apps/web/tsconfig.json');

checkFileExists('apps/mobile/package.json');
checkFileExists('apps/mobile/tsconfig.json');
checkFileExists('apps/mobile/app.json');
checkFileExists('apps/mobile/metro.config.js');
checkFileExists('apps/mobile/App.tsx');
checkJsonValid('apps/mobile/package.json');
checkJsonValid('apps/mobile/tsconfig.json');
checkJsonValid('apps/mobile/app.json');

// 4. Supabase Infrastructure Scaffolding
console.log('\n--- 4. Supabase Infrastructure ---');
checkFileExists('supabase/config.toml');
checkFileExists('supabase/migrations/20261108000000_init_finvault_schema.sql');
checkFileExists('supabase/functions/validate-transaction/index.ts');
checkFileExists('supabase/functions/sync-reconcile/index.ts');

// 5. Governance & Rule Trigger Alignment
console.log('\n--- 5. Governance & Rules Realignment ---');
checkFileContains('.agents/rules/01-financial-ledger-safety.md', /glob\(["']\*\*\/\{supabase,packages,apps\}\/\*\*["']\)/, 'trigger matches supabase/packages/apps');
checkFileNotContains('.agents/rules/01-financial-ledger-safety.md', /NUMERIC\(19,4\)/, 'does not allow NUMERIC(19,4) float loophole');
checkFileContains('.agents/rules/01-financial-ledger-safety.md', /BIGINT/, 'strictly enforces BIGINT minor units');

checkFileContains('.agents/rules/02-frontend-mobile-standards.md', /glob\(["']\*\*\/\{apps\/web,apps\/mobile,packages\/ui\}\/\*\*["']\)/, 'trigger matches web/mobile/ui apps');
checkFileContains('.agents/rules/02-frontend-mobile-standards.md', /#040A0A/, 'enforces Obsidian Carbon');
checkFileContains('.agents/rules/02-frontend-mobile-standards.md', /180ms/, 'enforces <= 180ms transitions');

// 6. Skills Alignment
console.log('\n--- 6. Skills Alignment ---');
checkFileContains('.agents/skills/db-migration-and-sync/SKILL.md', /supabase\/migrations/, 'references Supabase SQL migrations');
checkFileNotContains('.agents/skills/db-migration-and-sync/SKILL.md', /1\.\s+Generate an Alembic migration/, 'does not specify Alembic as step 1');

checkFileContains('.agents/skills/verify-and-record/SKILL.md', /Vitest/i, 'references Vitest');
checkFileContains('.agents/skills/verify-and-record/SKILL.md', /fast-check/i, 'references fast-check');
checkFileNotContains('.agents/skills/verify-and-record/SKILL.md', /1\.\s+Run `pytest`/, 'does not specify pytest as step 1');

// 7. Docs Stale Reference Elimination
console.log('\n--- 7. Documentation Cleanliness ---');
checkFileNotContains('docs/05-SECURITY-AND-COMPLIANCE.md', /Local desktop API secured via local bearer token auth/i, 'does not have obsolete local auth as Phase 1');
checkFileContains('docs/05-SECURITY-AND-COMPLIANCE.md', /Google OAuth/i, 'documents Google OAuth in Phase 1');
checkFileContains('docs/05-SECURITY-AND-COMPLIANCE.md', /Row Level Security|RLS/i, 'documents Row Level Security');

checkFileNotContains('docs/06-TESTING-AND-QA.md', /Use `Pytest` and `Hypothesis`/i, 'does not specify Pytest/Hypothesis as Phase 1 test runner');
checkFileContains('docs/06-TESTING-AND-QA.md', /Vitest/i, 'specifies Vitest');
checkFileContains('docs/06-TESTING-AND-QA.md', /fast-check/i, 'specifies fast-check');

checkFileNotContains('docs/07-DEPLOYMENT-AND-OBSERVABILITY.md', /1\.\s+Local Development Stack: Started via `docker compose up -d`/i, 'does not specify Docker Compose as Phase 1 dev stack');
checkFileContains('docs/07-DEPLOYMENT-AND-OBSERVABILITY.md', /Supabase/i, 'specifies Supabase for Phase 1');

checkFileNotContains('docs/08-STANDARDS-AND-CHANGELOG.md', /Pydantic v2 validation on FastAPI backend/i, 'does not specify Pydantic on FastAPI as Phase 1 backend');

// 8. Double-Entry Deferred Trigger Verification in Schema
console.log('\n--- 8. Double-Entry Trigger & Schema Invariants ---');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /verify_transaction_balance/, 'contains verify_transaction_balance function');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /RAISE EXCEPTION/, 'raises explicit check violation exception');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /DEFERRABLE INITIALLY DEFERRED/, 'binds deferred constraint trigger');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /COALESCE\(NEW\.transaction_id,\s*OLD\.transaction_id\)/, 'handles DELETE via COALESCE');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /update_account_balance/, 'contains balance maintenance trigger');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /handle_new_user_provisioning/, 'contains user provisioning trigger');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /post_transaction/, 'contains atomic transaction RPC');
checkFileContains('docs/04-DATABASE-SCHEMA.md', /sync_queue/, 'contains SQLite mutation outbox queue');

// 9. Design System Tokens & Types Invariants
console.log('\n--- 9. Types & Design Tokens Invariants ---');
checkFileContains('packages/db-types/src/index.ts', /balance_minor:\s*bigint/, 'Account uses bigint balance_minor');
checkFileContains('packages/db-types/src/index.ts', /amount_minor:\s*bigint/, 'JournalEntry uses bigint amount_minor');
checkFileContains('packages/db-types/src/index.ts', /principal_minor:\s*bigint/, 'IOURecord uses bigint principal_minor');

checkFileContains('packages/ui/src/tokens.ts', /#040A0A/, 'tokens include obsidianCarbon');
checkFileContains('packages/ui/src/tokens.ts', /#DEEEDA/, 'tokens include softMint');
checkFileContains('packages/ui/src/tokens.ts', /#C7E0BA/, 'tokens include sagePistachio');
checkFileContains('packages/ui/src/tokens.ts', /#7AAA4A/, 'tokens include botanicalGreen');
checkFileContains('packages/ui/src/tokens.ts', /#90A999/, 'tokens include mutedSage');
checkFileContains('packages/ui/src/tokens.ts', /#38424C/, 'tokens include charcoalSlate');
checkFileContains('packages/ui/src/tokens.ts', /transitionDurationMs:\s*1[0-8][0-9]|transitionDurationMs:\s*[1-9][0-9]/, 'tokens enforce transition <= 180ms');

console.log('\n====================================================');
console.log(`Results: ${passedChecks}/${totalChecks} passed (${failedChecks} failed)`);
console.log('====================================================');

if (failedChecks > 0) {
  process.exitCode = 1;
}
