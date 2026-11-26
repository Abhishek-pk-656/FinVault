#!/usr/bin/env node
/**
 * Cross-platform ADB crash-verification script for FinVault mobile (com.finvault.app).
 * Runs `adb logcat -d *:E`, checks strictly for fatal exceptions or ReactNativeJS / Expo
 * errors originating from `com.finvault.app`, and ignores test-harness collisions from
 * `com.android.commands.uiautomator`, `UiAutomationService`, and `dev.mobile.maestro`.
 */

import { execFileSync } from 'node:child_process';

const APP_ID_PATTERN = /(Process:\s*com\.finvault\.app|com\.finvault\.app|om\.finvault\.app|ReactNativeJS|Expo)/i;
const HARNESS_NOISE_PATTERN =
  /(com\.android\.commands\.uiautomator|UiAutomationService|dev\.mobile\.maestro|Not starting debugger since process cannot load the jdwp agent)/i;
const FATAL_PATTERN =
  /(FATAL EXCEPTION|JavascriptException|Invariant Violation|Uncaught|Unhandled|E[\s/]+AndroidRuntime|E[\s/]+ReactNativeJS|System\.err)/i;
const LOGCAT_PID_RE = /^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+(\d+)\s+\d+\s+[VDIWEFS]\s+/;

function getActiveAppPids() {
  try {
    const out = execFileSync('adb', ['shell', 'pidof', 'com.finvault.app'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return new Set(out.split(/\s+/).filter(Boolean));
  } catch {
    return new Set();
  }
}

function main() {
  let devicesOut = '';
  try {
    devicesOut = execFileSync('adb', ['devices'], { encoding: 'utf8' });
  } catch (err) {
    console.error('[qa:logcat-check] Failed to execute `adb devices`:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const connectedDevices = devicesOut
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /\bdevice$/.test(line));

  if (connectedDevices.length === 0) {
    console.error('[qa:logcat-check] No connected Android device or emulator found.');
    process.exit(1);
  }

  let logcatOut = '';
  try {
    logcatOut = execFileSync('adb', ['logcat', '-d', '*:E'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    console.error('[qa:logcat-check] Failed to capture `adb logcat -d *:E`:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const activePids = getActiveAppPids();
  const lines = logcatOut.split(/\r?\n/);

  // Identify PIDs belonging to com.finvault.app vs Android instrumentation harnesses
  const appPids = new Set(activePids);
  const harnessPids = new Set();

  for (const line of lines) {
    const m = LOGCAT_PID_RE.exec(line);
    if (!m) continue;
    const pid = m[1];
    if (HARNESS_NOISE_PATTERN.test(line)) {
      harnessPids.add(pid);
    }
    if (/(Process:\s*com\.finvault\.app|com\.finvault\.app|om\.finvault\.app)/i.test(line)) {
      appPids.add(pid);
    }
  }

  const crashLines = lines.filter((line) => {
    if (!line.trim() || HARNESS_NOISE_PATTERN.test(line)) {
      return false;
    }
    const m = LOGCAT_PID_RE.exec(line);
    const pid = m?.[1];
    if (pid && harnessPids.has(pid)) {
      return false;
    }

    const fromAppPid = Boolean(pid && appPids.has(pid));
    const matchesAppOrJs = APP_ID_PATTERN.test(line);
    if (!fromAppPid && !matchesAppOrJs) {
      return false;
    }

    return FATAL_PATTERN.test(line);
  });

  if (crashLines.length > 0) {
    console.error(`[qa:logcat-check] Detected ${crashLines.length} com.finvault.app crash/exception log line(s):`);
    for (const line of crashLines) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  console.log('[qa:logcat-check] Clean logcat (*:E) — zero fatal exceptions or ReactNativeJS/Expo errors from com.finvault.app.');
}

main();
