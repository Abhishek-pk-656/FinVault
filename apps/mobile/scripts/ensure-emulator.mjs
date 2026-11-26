#!/usr/bin/env node
/**
 * Ensures an Android Emulator is running and fully booted for Layer 3 mobile QA.
 * - Exits 0 immediately if `adb devices` already lists a device in `device` state.
 * - Otherwise locates Android SDK `emulator`, picks ANDROID_AVD_NAME or first AVD,
 *   launches it detached with `-no-boot-anim`, and waits up to 120s for `sys.boot_completed=1`.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BOOT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConnectedDevices() {
  const out = execFileSync('adb', ['devices'], { encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /\bdevice$/.test(line));
}

function resolveEmulatorBinary() {
  const isWin = process.platform === 'win32';
  const locator = isWin ? 'where' : 'which';
  try {
    const found = execFileSync(locator, ['emulator'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {
    // Fall back to standard SDK paths below
  }

  const candidates = [];
  if (isWin && process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'emulator', 'emulator.exe'));
  }
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    candidates.push(path.join(sdkRoot, 'emulator', isWin ? 'emulator.exe' : 'emulator'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main() {
  try {
    const running = getConnectedDevices();
    if (running.length > 0) {
      console.log('Emulator already running');
      process.exit(0);
    }
  } catch (err) {
    console.error('[qa:emulator-start] Failed to execute `adb devices`:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const emulatorBin = resolveEmulatorBinary();
  if (!emulatorBin) {
    console.error(
      '[qa:emulator-start] Could not locate Android `emulator` binary in PATH or %LOCALAPPDATA%\\Android\\Sdk\\emulator\\emulator.exe.'
    );
    process.exit(1);
  }

  let avds = [];
  try {
    const avdOut = execFileSync(emulatorBin, ['-list-avds'], { encoding: 'utf8' });
    avds = avdOut
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error('[qa:emulator-start] Failed to list AVDs:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (avds.length === 0) {
    console.error('[qa:emulator-start] No Android Virtual Devices (AVDs) found. Create one in Android Studio Device Manager.');
    process.exit(1);
  }

  const requestedAvd = process.env.ANDROID_AVD_NAME?.trim();
  const avdName = requestedAvd || avds[0];
  if (requestedAvd && !avds.includes(requestedAvd)) {
    console.error(`[qa:emulator-start] Requested ANDROID_AVD_NAME="${requestedAvd}" not found. Available AVDs: ${avds.join(', ')}`);
    process.exit(1);
  }

  console.log(`[qa:emulator-start] Launching Android Emulator AVD "${avdName}"...`);
  const child = spawn(emulatorBin, ['-avd', avdName, '-no-boot-anim'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  try {
    execFileSync('adb', ['wait-for-device'], {
      timeout: BOOT_TIMEOUT_MS,
      stdio: 'ignore',
    });
  } catch {
    console.error(`[qa:emulator-start] Timed out after ${BOOT_TIMEOUT_MS / 1000}s waiting for ADB device attachment.`);
    process.exit(1);
  }

  while (Date.now() < deadline) {
    try {
      const bootCompleted = execFileSync('adb', ['shell', 'getprop', 'sys.boot_completed'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (bootCompleted === '1') {
        console.log(`[qa:emulator-start] Emulator "${avdName}" booted cleanly (sys.boot_completed=1).`);
        process.exit(0);
      }
    } catch {
      // ADB shell may still be initializing during early boot
    }
    await sleep(POLL_INTERVAL_MS);
  }

  console.error(`[qa:emulator-start] Timed out after ${BOOT_TIMEOUT_MS / 1000}s waiting for sys.boot_completed=1.`);
  process.exit(1);
}

main();
