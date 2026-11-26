#!/usr/bin/env node
/**
 * Autonomous APK Build, Download & Emulator Install Script (`qa:sync-apk`).
 * - Computes a deterministic hash across `apps/mobile`, `packages/ui`, `packages/sync-engine`,
 *   and `packages/db-types`. If unchanged (without `--force`) and `com.finvault.app` is installed
 *   on a connected emulator/device, exits 0 immediately to save EAS build quota.
 * - Otherwise triggers EAS preview APK build, downloads `.apk` to `apps/mobile/.cache/finvault-preview.apk`,
 *   ensures the emulator is booted, installs via `adb install -r`, and caches the installed hash.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MOBILE_DIR, '..', '..');
const CACHE_DIR = path.join(MOBILE_DIR, '.cache');
const HASH_FILE = path.join(CACHE_DIR, 'last-installed-hash.txt');
const APK_PATH = path.join(CACHE_DIR, 'finvault-preview.apk');

const HASH_TARGETS = [
  path.join(REPO_ROOT, 'apps', 'mobile'),
  path.join(REPO_ROOT, 'packages', 'ui'),
  path.join(REPO_ROOT, 'packages', 'sync-engine'),
  path.join(REPO_ROOT, 'packages', 'db-types'),
];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.cache',
  '.expo',
  '.turbo',
  '.maestro',
  'dist',
  'build',
  'android',
  'ios',
]);

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        collectFiles(fullPath, out);
      }
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.tsbuildinfo') || entry.name.endsWith('.log')) continue;
      out.push(fullPath);
    }
  }
  return out;
}

function computeWorkspaceHash() {
  const hash = crypto.createHash('sha256');
  const allFiles = [];
  for (const target of HASH_TARGETS) {
    collectFiles(target, allFiles);
  }
  allFiles.sort();
  for (const filePath of allFiles) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function isAppInstalledOnEmulator() {
  try {
    const devices = execFileSync('adb', ['devices'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const hasDevice = devices
      .split(/\r?\n/)
      .slice(1)
      .some((line) => /\bdevice$/.test(line.trim()));
    if (!hasDevice) return false;

    const pkgOut = execFileSync('adb', ['shell', 'pm', 'list', 'packages', 'com.finvault.app'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return pkgOut.includes('package:com.finvault.app');
  } catch {
    return false;
  }
}

function buildEasEnv() {
  const env = {
    ...process.env,
    EAS_NO_VCS: '1',
    EAS_PROJECT_ROOT: REPO_ROOT,
  };
  if (process.platform === 'win32') {
    const gitCmd = 'C:\\Program Files\\Git\\cmd';
    if (fs.existsSync(gitCmd) && !(env.PATH || '').includes(gitCmd)) {
      env.PATH = `${gitCmd};${env.PATH || ''}`;
    }
  }
  return env;
}

function parseJsonPayload(raw) {
  const idxArr = raw.indexOf('[');
  const idxObj = raw.indexOf('{');
  const candidates = [idxArr, idxObj].filter((i) => i >= 0);
  if (candidates.length === 0) {
    throw new Error('No JSON payload found in eas-cli output.');
  }
  const start = Math.min(...candidates);
  return JSON.parse(raw.slice(start));
}

function extractBuildUrl(payload) {
  if (Array.isArray(payload)) {
    return payload[0]?.artifacts?.buildUrl || payload[0]?.artifacts?.applicationArchiveUrl || null;
  }
  return payload?.artifacts?.buildUrl || payload?.artifacts?.applicationArchiveUrl || null;
}

function runEas(args, env) {
  const res = spawnSync('npx', ['eas-cli', ...args], {
    cwd: MOBILE_DIR,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  });
  return res;
}

async function downloadApk(url, destPath) {
  console.log(`[qa:sync-apk] Downloading APK from ${url}...`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`APK download failed with HTTP ${response.status} ${response.statusText}`);
  }
  const arrayBuf = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(arrayBuf));
  const sizeMb = (arrayBuf.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`[qa:sync-apk] Downloaded ${sizeMb} MB to ${path.relative(REPO_ROOT, destPath)}.`);
}

async function main() {
  const force = process.argv.includes('--force');
  const currentHash = computeWorkspaceHash();

  if (!force && fs.existsSync(HASH_FILE)) {
    const cachedHash = fs.readFileSync(HASH_FILE, 'utf8').trim();
    if (cachedHash === currentHash && isAppInstalledOnEmulator()) {
      console.log('APK already up to date on emulator');
      process.exit(0);
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const easEnv = buildEasEnv();

  console.log('[qa:sync-apk] Building Android preview APK via EAS Build (profile: preview)...');
  const buildRes = runEas(
    ['build', '--platform', 'android', '--profile', 'preview', '--non-interactive', '--wait', '--json'],
    easEnv
  );

  const combinedOut = `${buildRes.stdout || ''}\n${buildRes.stderr || ''}`;
  if (/not logged in|expired.*session|eas login/i.test(combinedOut)) {
    console.error('[qa:sync-apk] Expo/EAS authentication required or expired. Please run `npx eas-cli login`.');
    process.exit(1);
  }

  if (buildRes.status !== 0) {
    console.error('[qa:sync-apk] EAS build command failed:');
    console.error(combinedOut.trim());
    process.exit(buildRes.status || 1);
  }

  let buildUrl = null;
  try {
    const parsed = parseJsonPayload(buildRes.stdout || '');
    buildUrl = extractBuildUrl(parsed);
  } catch {
    buildUrl = null;
  }

  if (!buildUrl) {
    console.log('[qa:sync-apk] Falling back to `eas-cli build:list` to resolve latest finished preview APK URL...');
    const listRes = runEas(
      ['build:list', '--platform', 'android', '--profile', 'preview', '--status', 'finished', '--limit', '1', '--json', '--non-interactive'],
      easEnv
    );
    if (listRes.status !== 0) {
      console.error('[qa:sync-apk] Fallback `eas-cli build:list` failed:', `${listRes.stdout}\n${listRes.stderr}`);
      process.exit(1);
    }
    const listPayload = parseJsonPayload(listRes.stdout || '');
    buildUrl = extractBuildUrl(listPayload);
  }

  if (!buildUrl) {
    console.error('[qa:sync-apk] Unable to resolve `artifacts.buildUrl` from EAS output.');
    process.exit(1);
  }

  await downloadApk(buildUrl, APK_PATH);

  console.log('[qa:sync-apk] Ensuring Android Emulator is booted...');
  execFileSync('node', [path.join(__dirname, 'ensure-emulator.mjs')], {
    cwd: MOBILE_DIR,
    stdio: 'inherit',
  });

  console.log(`[qa:sync-apk] Installing ${path.relative(REPO_ROOT, APK_PATH)} onto emulator...`);
  const installOut = execFileSync('adb', ['install', '-r', APK_PATH], { encoding: 'utf8' });
  console.log(installOut.trim());
  if (!/Success/i.test(installOut)) {
    console.error('[qa:sync-apk] `adb install -r` did not report Success.');
    process.exit(1);
  }

  fs.writeFileSync(HASH_FILE, `${currentHash}\n`, 'utf8');
  console.log(`[qa:sync-apk] Installed APK hash ${currentHash} recorded cleanly.`);
}

main().catch((err) => {
  console.error('[qa:sync-apk] Unexpected failure:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
