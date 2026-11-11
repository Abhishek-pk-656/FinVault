# Forensic Audit Report: Milestone 4 Iteration 5
## Next.js 14 Web Cockpit NTFS Determinism & Architectural Integrity Audit

**Work Product**: `apps/web`, `packages/ui`, `apps/web/next.config.mjs`, `.next/server/` build artifacts  
**Profile**: General Project (Integrity Forensics)  
**Auditor**: Forensic Integrity Auditor (`auditor_m4_iter5`)  
**Verdict**: **CLEAN**  
**Date**: 2026-11-09T10:05:00Z  

---

## 1. Observation

### 1.1 Ground-Truth Constraints (`ORIGINAL_REQUEST.md`)
- `Integrity mode`: **development**
- Monetary representation: `BIGINT` minor units (paise/cents), strictly zero floating-point money.
- Double-entry ledger invariant: $\sum \text{debits} == \sum \text{credits}$ enforced across all transactions.
- Web Cockpit: Next.js 14+ App Router, Tailwind CSS, TypeScript, Venzer Botanical Minimalist design system (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`), transitions $\le 180$ms.

### 1.2 Examination of `apps/web/next.config.mjs`
Direct examination of `apps/web/next.config.mjs`:
1. **Win32 `FlushFileBuffers` fsync implementation (`syncFlushFile`, lines 27–49)**:
   - Uses `fs.openSync(filePath, "r+")` to request `GENERIC_WRITE` access required by Windows Win32 API `FlushFileBuffers`.
   - Wrapping `fs.fsyncSync(fd)` in `try...finally { fs.closeSync(fd); }` guarantees zero file descriptor leaks.
   - Retries up to 5 attempts with a 10ms synchronous backoff loop to overcome transient Windows NTFS file handle contention.
   - **Empirical test**: Executing `fs.openSync(path, 'r')` followed by `fs.fsyncSync(fd)` failed with `EPERM: operation not permitted, fsync`. Executing `fs.openSync(path, 'r+')` followed by `fs.fsyncSync(fd)` succeeded with exit code 0.
2. **Directory resolution (`resolveServerDir`, lines 81–99)**:
   - Slices `outputPath` at `.next` and appends `"server"`, guaranteeing that regardless of whether Webpack passes `.next`, `.next/server`, or `.next/server/chunks`, the target is always canonically resolved to `<appRoot>/.next/server`.
   - Filesystem verification confirmed: `Test-Path apps/web/.next/server/chunks/server` returns `False` (zero nested path corruption).
3. **Manifest handling (`ensureCleanManifests`, lines 107–172)**:
   - Maps internal Next.js 14 fallback routes:
     ```json
     {
       "/_app": "pages/_app.js",
       "/_error": "pages/_error.js",
       "/_document": "pages/_document.js"
     }
     ```
   - Automatically purges stale static HTML references (`404.html`, `500.html`) from `pages-manifest.json` since App Router serves error pages from `app/_not-found.html`.
4. **Compiler Lifecycle Hooks (lines 239–280)**:
   - Intercepts Webpack internal `outputFileSystem.mkdir` collisions on NTFS (`FixWindowsNtfsEpermPlugin`).
   - Recursively fsyncs all `.js`, `.json`, and `.html` files in `.next/server` on `afterEmit` and `done` hooks.

### 1.3 Inspection of Fallback Assets in `.next/server/pages/`
Inspection of `.next/server/pages/` confirmed:
- `_document.js`: 378 bytes. Contains genuine Next.js 14 compiled webpack runtime hook:
  `"use strict";(()=>{var e={};e.id=660,e.ids=[660]...var r=require("../webpack-runtime.js");r.C(e);var s=e=>r(r.s=e),t=r.X(0,[488],()=>s(2488));module.exports=t})();`
- `_app.js`: 3,293 bytes. Contains genuine Next.js 14 compiled `loadGetInitialProps` and `App` wrapper.
- `_error.js`: 8,621 bytes. Contains genuine Next.js 14 compiled `PagesRouteModule` and error component.
- All fallback assets are genuine Next.js compiler outputs, not test fakes or empty stubs.

### 1.4 Codebase Inspection of `apps/web/src/**` and `packages/ui/**`
1. **Zero Mock Flags / Test Bypasses**:
   - Grep for `isTest`, `isMock`, `fake`, `dummy`, `skipAuth` across `apps/web/src` and `packages/ui/src` returned zero occurrences in application logic.
   - The only occurrence in `apps/web/src/app/login/page.tsx:81` is a UI button for "Launch Local Cockpit Demo" (`window.location.href = '/'`) intended for offline local navigation without an active cloud OAuth connection.
2. **Zero Floating-Point Money Calculations**:
   - Grep for `Math.round`, `Math.floor`, `Math.ceil`, `parseFloat` across `apps/web/src` and `packages/ui/src` returned **0 occurrences**.
   - Grep for `Number(` across `apps/web/src` returned only 3 occurrences, each computing a display percentage for progress bars / UI gauges after exact BigInt division:
     - `CashFlowSummaryCard.tsx:27`: `Number(((netMinor) * 10000n) / inflowsBn) / 100` (savings rate %)
     - `ActiveIOUsListCard.tsx:69`: `Number((remaining * 100n) / principal)` (repayment progress bar width %)
     - `NetWorthHeroCard.tsx:29`: `Number((totalAssetsBn * 100n) / totalCombined)` (asset allocation ratio %)
   - Zero monetary values are computed or stored with floating-point arithmetic.
3. **RSC BigInt String Serialization Boundaries**:
   - `apps/web/src/lib/money/serialization.ts` strictly declares `SerializedAccount`, `SerializedTransaction`, `SerializedJournalEntry`, `SerializedIOURecord`, and `SerializedNetWorthSummary` with all monetary amounts as `string`.
   - `serializeAccount`, `serializeTransaction`, `serializeIOURecord`, and `deepSerializeBigInt` ensure no raw `BigInt` objects are passed directly across the React Server Component boundary, preventing Next.js RSC serialization crashes.
   - Client components reconstruct exact `BigInt` instances (`BigInt(str)`) for arithmetic and pass them to `formatMinorToDecimal`.

### 1.5 Empirical Behavioral Verification Checks

| Check | Command | Result | Details |
|---|---|:---:|---|
| Forensic Audit Script | `node --experimental-strip-types tests/auditor/auditor-m4.ts` | **PASS** | 23/23 checks passed (6 forensic checks + 17 stress checks) |
| Web Static Typecheck | `pnpm --filter @finvault/web typecheck` | **PASS** | `tsc --noEmit` exited with code 0 (0 errors) |
| Turborepo Monorepo Build | `pnpm build` | **PASS** | 4/4 packages built cleanly in Full Turbo |
| Master E2E Invariant Runner | `node --experimental-strip-types tests/e2e/runner.ts` | **PASS** | 63/63 test cases passed across all 4 Tiers |
| Challenger 1 UI Adversarial Suite | `node --experimental-strip-types tests/challenger/challenger-ui-m4.ts` | **PASS** | 85/85 tests passed |
| Challenger 2 Cockpit Stress Suite | `node --experimental-strip-types tests/challenger/challenger-cockpit-m4.ts` | **PASS** | 24/24 tests passed |
| Sync Engine Test Suite | `node --test packages/sync-engine/tests/sync-engine.test.ts` | **PASS** | 23/23 tests passed |
| SQLite Schema Parity Suite | `node --test packages/sync-engine/tests/client-schema.test.ts` | **PASS** | 10/10 tests passed |
| Explorer M1 Monorepo Suite | `node .agents/teamwork/explorer_m1_3/verify-m1.js` | **PASS** | 86/86 checks passed |

Total automated verification checks executed independently: **314 / 314 passed (100% success rate)**.

---

## 2. Logic Chain

1. **Step 1 (Root Cause & NTFS Fsync Verification)**:
   - In Iteration 4, asynchronous Webpack emission combined with NTFS cache buffering resulted in child worker processes attempting to require `webpack-runtime.js` before directory and file entries were committed.
   - Attempting `fs.fsyncSync(fd)` on a file opened with `"r"` fails under Windows NTFS with `EPERM` because Win32 `FlushFileBuffers` requires `GENERIC_WRITE`.
   - In Iteration 5, `syncFlushFile` opens files with `"r+"`, granting `GENERIC_WRITE` without truncating contents, and wraps calls in `try...finally` with a 5-attempt retry loop.
   - Empirical test verified `fs.openSync(..., "r+")` + `fs.fsyncSync()` succeeds without error on Windows NTFS.
2. **Step 2 (Directory Path Invariant)**:
   - `resolveServerDir` anchors resolution to `.next/server`, preventing Webpack sub-compiler chunk paths from concatenating into `.next/server/chunks/server`.
   - Filesystem verification confirmed zero occurrences of `chunks/server`.
3. **Step 3 (Manifest & Fallback Asset Authenticity)**:
   - `pages-manifest.json` maps `/_app`, `/_document`, and `/_error` to their respective `.next/server/pages/*.js` targets.
   - All three target files exist on disk, contain genuine Webpack module wrappers and Next.js runtime code, and exceed 370–8,600 bytes.
   - No mock stubs or facade return values exist.
4. **Step 4 (Financial & Serialization Invariants)**:
   - Static analysis confirmed zero floating-point operations on currency.
   - All monetary amounts use native `BigInt` minor units.
   - React Server Components serialize `BigInt` to `string` DTOs, preserving 64-bit precision without serialization exceptions.
5. **Step 5 (Empirical Re-execution)**:
   - All 314 automated checks across 9 separate test and build suites passed with exit code 0.

---

## 3. Caveats

- **Scope Boundary**: As defined in `PROJECT.md`, `apps/mobile` (React Native / Expo Android) is scheduled for Milestone 5.
- **Standalone Docker Mode**: `outputFileTracing: false` disables standalone bundle tracing (`.next/standalone`). This is in full alignment with Milestone 4 specifications; containerized self-hosted deployments are documented on the future roadmap.
- No other caveats.

---

## 4. Conclusion & Forensic Verdict

### Forensic Verdict: **CLEAN**

All forensic audit checks have passed unconditionally:
1. **Fallback Assets & Manifest Integrity**: PASS — Genuine Next.js 14 compiler outputs, valid manifest mappings, zero fake stubs.
2. **Win32 `FlushFileBuffers` Fsync Mode**: PASS — Legitimate `"r+"` (GENERIC_WRITE) file descriptor opening with retry backoff.
3. **Zero Floating-Point Money Calculations**: PASS — 100% strict `BIGINT` minor units.
4. **RSC Serialization Boundaries**: PASS — Strict string DTOs across server/client boundaries.
5. **No Facades or Cheating**: PASS — Real interactive components, real validation, and real server actions.
6. **Empirical Behavioral Verification**: PASS — 314 / 314 tests and builds passed deterministically.

Milestone 4 (Shared UI Library & Web Application Cockpit) is certified complete and approved for Milestone 5 progression.

---

## 5. Verification Method

To independently verify the forensic findings:

1. **Execute Forensic Auditor Suite**:
   ```bash
   node --experimental-strip-types tests/auditor/auditor-m4.ts
   ```
   *Expected Output*: `AUDIT SCRIPT VERDICT: CLEAN (ALL PASS)` (23/23 checks).

2. **Verify Static TypeScript Compliance**:
   ```bash
   pnpm --filter @finvault/web typecheck
   ```
   *Expected Output*: Exit code 0, 0 type errors.

3. **Verify Turborepo Monorepo Build**:
   ```bash
   pnpm build
   ```
   *Expected Output*: Exit code 0, 4 packages successful.

4. **Verify Master E2E & Invariant Test Suite**:
   ```bash
   node --experimental-strip-types tests/e2e/runner.ts
   ```
   *Expected Output*: `Total Test Cases: 63 (Passed: 63, Failed: 0)`, 100% success rate.

5. **Verify Challenger Stress Suites**:
   ```bash
   node --experimental-strip-types tests/challenger/challenger-ui-m4.ts
   node --experimental-strip-types tests/challenger/challenger-cockpit-m4.ts
   ```
   *Expected Output*: 85/85 and 24/24 PASS.

### Invalidation Conditions
This verdict is invalidated if:
1. Any build fails with `ENOENT`, `EPERM`, or `MODULE_NOT_FOUND`.
2. Any floating-point arithmetic is introduced into currency values.
3. Any of the 314 automated checks fail.
