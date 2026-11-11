/**
 * Canonical test bridge for FinVault Sync Engine Invariants Suite
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const targetTest = path.join(projectRoot, 'packages/sync-engine/tests/sync-engine.test.ts');

const result = spawnSync(process.execPath, ['--test', targetTest], {
  stdio: 'inherit',
  cwd: projectRoot,
});

process.exit(result.status ?? 0);
