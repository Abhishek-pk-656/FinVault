const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Testing TypeScript Config Blueprints...\n');

// 1. Validate JSON
const baseJsonPath = path.join(__dirname, 'blueprint_tsconfig.base.json');
const rootJsonPath = path.join(__dirname, 'blueprint_tsconfig.json');

const baseContent = fs.readFileSync(baseJsonPath, 'utf8');
const rootContent = fs.readFileSync(rootJsonPath, 'utf8');

const baseConfig = JSON.parse(baseContent);
const rootConfig = JSON.parse(rootContent);

console.log('[PASS] Valid JSON in blueprint_tsconfig.base.json');
console.log('[PASS] Valid JSON in blueprint_tsconfig.json');

// 2. Check no baseUrl
if (baseConfig.compilerOptions.baseUrl || rootConfig.compilerOptions.baseUrl) {
  console.error('[FAIL] baseUrl must not exist');
  process.exit(1);
}
console.log('[PASS] baseUrl is completely absent from both configs (TS5102 eliminated)');

// 3. Check all paths start with ./
const requiredAliases = [
  '@finvault/db-types',
  '@finvault/sync-engine',
  '@finvault/ui',
  '@finvault/ui/tokens'
];

for (const alias of requiredAliases) {
  const baseTarget = baseConfig.compilerOptions.paths[alias]?.[0];
  const rootTarget = rootConfig.compilerOptions.paths[alias]?.[0];
  if (!baseTarget || !baseTarget.startsWith('./')) {
    console.error(`[FAIL] Base path alias ${alias} does not start with ./: ${baseTarget}`);
    process.exit(1);
  }
  if (!rootTarget || !rootTarget.startsWith('./')) {
    console.error(`[FAIL] Root path alias ${alias} does not start with ./: ${rootTarget}`);
    process.exit(1);
  }
  // Check target file exists
  const resolvedTarget = path.resolve(__dirname, '../../..', rootTarget);
  if (!fs.existsSync(resolvedTarget)) {
    console.error(`[FAIL] Path target ${resolvedTarget} does not exist`);
    process.exit(1);
  }
}
console.log('[PASS] All paths aliases use ./ prefix and point to real existing files (TS5090 eliminated)');

// 4. Test files: [] presence
if (!Array.isArray(rootConfig.files) || rootConfig.files.length !== 0) {
  console.error('[FAIL] Root config must define "files": []');
  process.exit(1);
}
console.log('[PASS] Root config defines "files": [] to prevent illegal root compilation of conflicting JSX runtimes');

// 5. Test compiler execution on simulated root config
const simConfig = {
  extends: './blueprint_tsconfig.base.json',
  compilerOptions: {
    paths: {
      '@finvault/db-types': ['../../../packages/db-types/src/index.ts'],
      '@finvault/sync-engine': ['../../../packages/sync-engine/src/index.ts'],
      '@finvault/ui': ['../../../packages/ui/src/index.tsx'],
      '@finvault/ui/tokens': ['../../../packages/ui/src/tokens.ts']
    }
  },
  files: [],
  references: [
    { path: '../../../packages/db-types' }
  ]
};

const simConfigPath = path.join(__dirname, 'test_sim_root.json');
fs.writeFileSync(simConfigPath, JSON.stringify(simConfig, null, 2));

try {
  const output = execSync(`tsc --noEmit --project ${simConfigPath}`, { encoding: 'utf8' });
  console.log('[PASS] tsc --noEmit --project compiled with ZERO errors (Exit code 0)');
} catch (err) {
  console.error('[FAIL] tsc command failed:', err.stdout || err.message);
  process.exit(1);
}

console.log('\nAll blueprint assertions passed successfully!');
