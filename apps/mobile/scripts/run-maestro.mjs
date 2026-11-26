#!/usr/bin/env node
/**
 * Runs Maestro E2E flows with pinned Android driver port (`--driver-host-port 7001`)
 * and forwards E2E_TEST_EMAIL / E2E_TEST_PASSWORD from process.env or gitignored
 * `.env.test.local` files without ever storing credentials inside tracked YAML files.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MOBILE_DIR, '..', '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && value) {
      out[key] = value;
    }
  }
  return out;
}

const fallbackEnv = {
  ...loadEnvFile(path.join(REPO_ROOT, 'apps', 'web', '.env.test.local')),
  ...loadEnvFile(path.join(MOBILE_DIR, '.env.test.local')),
};

const email = (process.env.E2E_TEST_EMAIL || fallbackEnv.E2E_TEST_EMAIL || '').trim();
const password = (process.env.E2E_TEST_PASSWORD || fallbackEnv.E2E_TEST_PASSWORD || '').trim();

const args = ['test', '--driver-host-port', '7001'];
if (email && password) {
  args.push('-e', `E2E_TEST_EMAIL=${email}`, '-e', `E2E_TEST_PASSWORD=${password}`);
}
args.push('.maestro/');

const result = spawnSync('maestro', args, {
  cwd: MOBILE_DIR,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
