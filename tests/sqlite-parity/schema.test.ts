/**
 * Canonical test bridge for Client SQLite Schema Parity Suite
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const targetTest = path.join(projectRoot, 'packages/sync-engine/tests/client-schema.test.ts');

const result = spawnSync(process.execPath, ['--test', targetTest], {
  stdio: 'inherit',
  cwd: projectRoot,
});

process.exit(result.status ?? 0);
