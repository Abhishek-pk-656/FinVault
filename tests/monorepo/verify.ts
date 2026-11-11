/**
 * Canonical test bridge for Explorer M1 Monorepo Verification Suite
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const targetScript = path.join(projectRoot, '.agents/teamwork/explorer_m1_3/verify-m1.js');

const result = spawnSync(process.execPath, [targetScript], {
  stdio: 'inherit',
  cwd: projectRoot,
});

process.exit(result.status ?? 0);
