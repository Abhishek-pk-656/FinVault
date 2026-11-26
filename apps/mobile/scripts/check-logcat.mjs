#!/usr/bin/env node
/**
 * Cross-platform ADB crash-verification script for FinVault mobile (com.finvault.app).
 * Runs `adb logcat -d *:E`, filters for AndroidRuntime, ReactNativeJS, Expo, and com.finvault.app,
 * and exits non-zero if any fatal crash or unhandled JS exception occurred.
 */

import { execFileSync } from 'node:child_process';

const TARGET_PATTERN = /(AndroidRuntime|ReactNativeJS|Expo|com\.finvault\.app|om\.finvault\.app)/i;
const FATAL_PATTERN =
  /(FATAL EXCEPTION|JavascriptException|Invariant Violation|Uncaught|Unhandled|E\/AndroidRuntime|E\/ReactNativeJS|System\.err)/i;
const BENIGN_JDWP_PATTERN = /Not starting debugger since process cannot load the jdwp agent/i;

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

  const relevantLines = logcatOut
    .split(/\r?\n/)
    .filter((line) => TARGET_PATTERN.test(line) && !BENIGN_JDWP_PATTERN.test(line));

  const crashLines = relevantLines.filter((line) => FATAL_PATTERN.test(line));

  if (crashLines.length > 0) {
    console.error(`[qa:logcat-check] Detected ${crashLines.length} crash/exception log line(s):`);
    for (const line of crashLines) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  if (relevantLines.length > 0) {
    console.log(`[qa:logcat-check] Filtered ${relevantLines.length} non-fatal error line(s); zero crashes or unhandled JS exceptions.`);
  } else {
    console.log('[qa:logcat-check] Clean logcat (*:E) — zero crash or JS exception entries.');
  }
}

main();
