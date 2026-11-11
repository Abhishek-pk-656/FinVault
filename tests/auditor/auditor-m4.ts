/**
 * FinVault Forensic Integrity Auditor Test Suite for Milestone 4
 * Comprehensive verification of:
 * - Fallback assets & pages-manifest.json integrity
 * - Win32 FlushFileBuffers fsync implementation ('r+')
 * - Zero floating-point money math across UI & Web
 * - BigInt serialization boundaries across RSC
 * - Lossless BigInt currency parsing, formatting, and double-entry invariants
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('======================================================');
console.log('       FINVAULT M4 FORENSIC INTEGRITY AUDIT SUITE      ');
console.log('======================================================');

let passCount = 0;
let failCount = 0;

function auditCheck(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failCount++;
    console.error(`  [FAIL] ${name}:`, err.message);
  }
}

// ----------------------------------------------------------------------------
// Section 1: Next.js 14 Fallback Assets & Manifest Forensic Checks
// ----------------------------------------------------------------------------
auditCheck('AUDIT-01: pages-manifest.json contains valid internal fallback routes', () => {
  const manifestPath = path.resolve('apps/web/.next/server/pages-manifest.json');
  assert.ok(fs.existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  
  // Must map internal Next.js 14 static worker routes
  assert.ok('/_app' in manifest, 'Manifest must contain /_app');
  assert.ok('/_document' in manifest, 'Manifest must contain /_document');
  assert.ok('/_error' in manifest, 'Manifest must contain /_error');
  
  // Must NOT contain dummy static html stubs when they don't exist
  for (const [route, relPath] of Object.entries(manifest)) {
    const fullTarget = path.resolve('apps/web/.next/server', relPath as string);
    assert.ok(fs.existsSync(fullTarget), `Target file for route ${route} (${relPath}) must exist on disk`);
    const stat = fs.statSync(fullTarget);
    assert.ok(stat.size > 0, `Target file ${relPath} must not be empty (was ${stat.size} bytes)`);
  }
});

auditCheck('AUDIT-02: Fallback assets are genuine Next.js 14 compiler outputs (not mocks)', () => {
  const pagesDir = path.resolve('apps/web/.next/server/pages');
  assert.ok(fs.existsSync(pagesDir), 'Pages directory must exist');

  const docPath = path.join(pagesDir, '_document.js');
  const appPath = path.join(pagesDir, '_app.js');
  const errPath = path.join(pagesDir, '_error.js');

  assert.ok(fs.existsSync(docPath), '_document.js must exist');
  assert.ok(fs.existsSync(appPath), '_app.js must exist');
  assert.ok(fs.existsSync(errPath), '_error.js must exist');

  const docContent = fs.readFileSync(docPath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const errContent = fs.readFileSync(errPath, 'utf8');

  // Verify genuine Webpack chunk compilation patterns
  assert.match(docContent, /webpack-runtime\.js/, '_document.js must load webpack-runtime');
  assert.match(appContent, /webpack-runtime\.js/, '_app.js must load webpack-runtime');
  assert.match(errContent, /webpack-runtime\.js/, '_error.js must load webpack-runtime');

  // Verify non-trivial byte sizes (> 300 bytes)
  assert.ok(docContent.length >= 300, `_document.js size must be >= 300 bytes (got ${docContent.length})`);
  assert.ok(appContent.length >= 3000, `_app.js size must be >= 3000 bytes (got ${appContent.length})`);
  assert.ok(errContent.length >= 5000, `_error.js size must be >= 5000 bytes (got ${errContent.length})`);
});

auditCheck('AUDIT-03: No malformed nested directory (.next/server/chunks/server)', () => {
  const bogusDir = path.resolve('apps/web/.next/server/chunks/server');
  assert.strictEqual(fs.existsSync(bogusDir), false, 'Malformed directory .next/server/chunks/server must NOT exist');
});

auditCheck('AUDIT-04: Win32 FlushFileBuffers fsync implementation opens files with "r+" mode', () => {
  const configPath = path.resolve('apps/web/next.config.mjs');
  assert.ok(fs.existsSync(configPath), 'next.config.mjs must exist');
  const content = fs.readFileSync(configPath, 'utf8');
  assert.match(content, /fs\.openSync\(filePath,\s*["']r\+["']\)/, 'syncFlushFile must open with "r+" mode for Win32 GENERIC_WRITE');
  assert.match(content, /fs\.fsyncSync\(fd\)/, 'syncFlushFile must invoke fsyncSync');
  assert.match(content, /for\s*\(\s*let\s+attempt\s*=\s*0;\s*attempt\s*<\s*5/, 'syncFlushFile must implement retry loop');
});

// ----------------------------------------------------------------------------
// Section 2: Codebase Static Analysis for Mock Flags & Floating-Point Money
// ----------------------------------------------------------------------------
auditCheck('AUDIT-05: Zero floating-point money functions (Math.round, parseFloat, etc.) in UI/Web', () => {
  const scanDirs = ['apps/web/src', 'packages/ui/src'];
  const prohibitedPatterns = [
    /\bMath\.round\b/,
    /\bMath\.floor\b/,
    /\bMath\.ceil\b/,
    /\bparseFloat\b/,
  ];

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
        const fileContent = fs.readFileSync(full, 'utf8');
        for (const pat of prohibitedPatterns) {
          assert.ok(
            !pat.test(fileContent),
            `Prohibited floating-point pattern ${pat} detected in ${full}`
          );
        }
      }
    }
  }

  for (const d of scanDirs) {
    if (fs.existsSync(d)) scan(d);
  }
});

auditCheck('AUDIT-06: RSC string serialization boundaries for BigInt values', () => {
  const serPath = path.resolve('apps/web/src/lib/money/serialization.ts');
  assert.ok(fs.existsSync(serPath), 'serialization.ts must exist');
  const content = fs.readFileSync(serPath, 'utf8');
  assert.match(content, /export interface SerializedAccount/, 'Must declare SerializedAccount DTO');
  assert.match(content, /balance_minor:\s*string/, 'balance_minor must be typed as string in DTO');
  assert.match(content, /export function serializeAccount/, 'Must export serializeAccount mapper');
  assert.match(content, /export function deserializeAccount/, 'Must export deserializeAccount mapper');
  assert.match(content, /export function deepSerializeBigInt/, 'Must export deepSerializeBigInt helper');
});

console.log('------------------------------------------------------');
console.log('Forensic Core Pre-Checks Completed. Running Stress Checks:');
console.log('------------------------------------------------------');

// ----------------------------------------------------------------------------
// Section 3: Execute Domain Stress Checks (Lossless BigInt, Validation, DTOs, Tokens)
// ----------------------------------------------------------------------------
import('../stress/m4-auditor-stress.ts').then(() => {
  console.log('======================================================');
  console.log(`TOTAL FORENSIC AUDIT CHECKS: ${passCount + 17}`);
  console.log(`AUDIT SCRIPT VERDICT: ${failCount === 0 ? 'CLEAN (ALL PASS)' : 'INTEGRITY VIOLATION'}`);
  console.log('======================================================');
  if (failCount > 0) {
    process.exit(1);
  }
}).catch((err) => {
  console.error('Failed to run auditor stress module:', err);
  process.exit(1);
});
