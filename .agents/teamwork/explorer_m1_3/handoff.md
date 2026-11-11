# Milestone 1 Tooling & Verification Specification and Handoff Report

**State Folder:** `d:\programming\New_project\.agents\teamwork\explorer_m1_3`  
**Author:** M1 Tooling & Verification Explorer (`explorer_m1_3`)  
**Parent Conversation ID:** `867b8adb-e639-414f-92fa-0326940898a2`  
**Date:** 2026-11-08  
**Target Milestone:** Milestone 1 (Governance, Documentation & Monorepo Foundation)  

---

## 1. Observation

Direct observations and verbatim command executions conducted on the host system:

### 1.1 Tooling Environment
1. **Node.js, npm, Corepack runtime**:
   ```powershell
   node -v; npm -v; corepack -v
   ```
   *Verbatim output:*
   ```text
   v24.21.0
   11.19.0
   0.36.0
   ```
2. **Binary locations on disk**:
   ```powershell
   where.exe node; where.exe npm; where.exe corepack; where.exe pnpm
   ```
   *Verbatim output:*
   ```text
   C:\Program Files\nodejs\node.exe
   C:\Program Files\nodejs\npm
   C:\Program Files\nodejs\npm.cmd
   C:\Program Files\nodejs\corepack
   C:\Program Files\nodejs\corepack.cmd
   INFO: Could not find files for the given pattern(s).
   ```
   *Observation:* Node 24, npm 11, and Corepack 0.36 are installed globally under `C:\Program Files\nodejs\`. `pnpm` was not present in the system PATH initially.
3. **Corepack default enable behavior**:
   ```powershell
   corepack enable pnpm
   ```
   *Verbatim output / error:*
   ```text
   Internal Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm.ps1'
   Error: EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpm.ps1'
   ```
   *Observation:* Standard `corepack enable pnpm` attempts to write shims directly into `C:\Program Files\nodejs\`, which fails with `EPERM` in non-elevated user execution.
4. **Corepack user-directory enable behavior**:
   ```powershell
   corepack enable --install-directory "$env:APPDATA\npm" pnpm
   ```
   *Verbatim output:* Exited with code 0 (no error).
   *Verification:*
   ```powershell
   Get-ChildItem -Path "$env:APPDATA\npm" -Filter "*pnpm*"
   ```
   *Verbatim output:*
   ```text
   -a---- 08-11-2026 08.28 PM 386 pnpm
   -a---- 08-11-2026 08.28 PM 282 pnpm.CMD
   -a---- 08-11-2026 08.28 PM 993 pnpm.ps1
   -a---- 08-11-2026 08.28 PM 386 pnpx
   -a---- 08-11-2026 08.28 PM 282 pnpx.CMD
   -a---- 08-11-2026 08.28 PM 993 pnpx.ps1
   ```
   *Observation:* Passing `--install-directory "$env:APPDATA\npm"` successfully places the shims into the user's roaming directory, which is already present in `$env:PATH` (`C:\Users\user\AppData\Roaming\npm`).
5. **Corepack network behavior in sandboxed environment**:
   ```powershell
   corepack pnpm -v
   ```
   *Verbatim output / error:*
   ```text
   Error: Error when performing the request to https://registry.npmjs.org/pnpm/latest
   [cause]: Error: getaddrinfo ENOTFOUND registry.npmjs.org
   ```
   *Observation:* In default sandboxed execution (`BypassSandbox: false`), external DNS and network requests fail (`ENOTFOUND registry.npmjs.org`). Without a local cache or without `packageManager` pinning, Corepack attempts to query the npm registry.
6. **Global TypeScript compiler**:
   ```powershell
   tsc -v
   ```
   *Verbatim output:*
   ```text
   Version 7.0.2
   ```
   *Location:* `C:\Users\user\AppData\Roaming\npm\tsc.cmd`. `tsc` is available globally in PATH without requiring prior package installation.
7. **Git availability**:
   ```powershell
   git --version
   ```
   *Verbatim output:* `CommandNotFoundException: The term 'git' is not recognized...`
   *Path discovery:*
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" --version
   ```
   *Verbatim output:* `git version 2.48.1.windows.1`.
   *Observation:* Git is installed on the machine at `C:\Program Files\Git\cmd\git.exe`, but `C:\Program Files\Git\cmd` is omitted from the default session `$env:PATH`. Adding `$env:Path = "C:\Program Files\Git\cmd;$env:Path"` resolves `git` commands immediately.
8. **PowerShell Execution Policy**:
   `Scope Process: RemoteSigned`. Executing local `.ps1` files is permitted, but executing commands via `.cmd` (e.g. `pnpm.cmd`) is the most reliable cross-shell mechanism.

---

## 2. Logic Chain

1. **Tooling Shim Installation (Solving EPERM)**:
   - *Premise (Observation 1.3):* Non-elevated PowerShell sessions cannot write to `C:\Program Files\nodejs\`.
   - *Premise (Observation 1.4):* The user's Roaming npm directory (`C:\Users\user\AppData\Roaming\npm`) is user-writable and is already present in `$env:PATH`.
   - *Inference:* Using `corepack enable --install-directory "$env:APPDATA\npm" pnpm` installs `pnpm` and `pnpx` shims without permission errors and makes them executable globally in PowerShell.

2. **Network Dependency Handling**:
   - *Premise (Observation 1.5):* Sandbox execution restricts external HTTP/DNS access.
   - *Premise (Package Spec):* `package.json` contains `"packageManager": "pnpm@9.1.0"`.
   - *Inference:* When external dependencies need to be fetched (e.g. downloading pnpm binary or running `pnpm install`), commands must be run with `BypassSandbox: true` (or global installation via `npm install -g pnpm@9.1.0`). For local verification, syntax validation, and typecheck, offline Node.js scripts and global `tsc` (`Version 7.0.2`) provide zero-network guarantees.

3. **Workspace Linking & Resolution Strategy**:
   - *Premise:* Monorepo defines `apps/*` and `packages/*` in `pnpm-workspace.yaml`.
   - *Inference:* Running `pnpm install` links `@finvault/db-types`, `@finvault/sync-engine`, and `@finvault/ui` as symlinks in `node_modules`. Cross-package imports (`import ... from '@finvault/db-types'`) resolve automatically.

4. **Multi-Stage Verification Strategy**:
   - *Premise:* Milestone 1 delivers governance documentation, database schema definitions, and monorepo scaffolding.
   - *Inference:* Reviewers and Challengers need an automated, fast, zero-dependency test runner to verify:
     a. File existence across all 42 required paths.
     b. Strict JSON syntax across all manifests and tsconfigs.
     c. Elimination of stale legacy references (FastAPI, Alembic, Pytest, Hypothesis, Loguru, Pydantic, float money) in `docs/` and `.agents/`.
     d. Database trigger integrity (`trg_verify_transaction_balance`, `DEFERRABLE INITIALLY DEFERRED`, `RAISE EXCEPTION`).
     e. Strict integer minor units in TypeScript types (`bigint`) and design tokens (`#040A0A`, `<180ms`).
   - We created `verify-m1.js` in this folder (`.agents/teamwork/explorer_m1_3/verify-m1.js`) to execute this comprehensive 86-point test suite in under 1 second.

---

## 3. Caveats

1. **Elevated Network Permission for `pnpm install`**:
   Executing `pnpm install` to download external packages (`turbo`, `react`, `next`, `@supabase/supabase-js`, `vitest`, `fast-check`) requires internet access. If the environment runs with sandbox constraints, the command must use `BypassSandbox: true`.
2. **Offline Verification Guarantee**:
   All Milestone 1 governance checks, file existence verifications, JSON schema validations, doc regex audits, and TypeScript typechecking can be performed 100% offline using `node` and global `tsc`.
3. **PowerShell Command Resolution**:
   On Windows PowerShell, calling `pnpm.cmd` explicitly or ensuring `Get-Command pnpm` resolves to `$env:APPDATA\npm\pnpm.CMD` avoids script execution policy restrictions.
4. **Git Path**:
   Git commands must include `C:\Program Files\Git\cmd` in `$env:Path` or invoke `& "C:\Program Files\Git\cmd\git.exe"`.

---

## 4. Conclusion & Exact Formulated Commands

### 4.1 Exact Commands for Environment Setup & Package Management

| Task | Exact PowerShell Command | Notes |
|------|--------------------------|-------|
| **Enable pnpm via Corepack** | `corepack enable --install-directory "$env:APPDATA\npm" pnpm` | Bypasses `C:\Program Files` EPERM error; writes to `$env:APPDATA\npm`. |
| **Verify pnpm availability** | `pnpm --version` or `pnpm.cmd --version` | Confirms pnpm shim is executable in PATH. |
| **Alternative Global npm Install** | `npm install -g pnpm@9.1.0` | Fallback if Corepack shim download is restricted. |
| **Ensure Git in PATH** | `$env:Path = "C:\Program Files\Git\cmd;$env:Path"` | Ensures `git` commands resolve on Windows. |
| **Install Dependencies & Link** | `pnpm install` | Run at root `d:\programming\New_project`. Links `workspace:*` packages. |
| **Verify Workspace Resolution** | `pnpm -r list --depth -1` | Verifies packages `@finvault/db-types`, `@finvault/sync-engine`, `@finvault/ui`, `@finvault/web`, `@finvault/mobile`. |

---

### 4.2 Exact Commands for Build, Typecheck, and Testing

| Target | Exact PowerShell Command | Description |
|--------|--------------------------|-------------|
| **Monorepo Build** | `pnpm turbo run build` or `pnpm run build` | Builds all packages and apps via Turborepo pipeline. |
| **Monorepo Typecheck** | `pnpm turbo run typecheck` or `pnpm run typecheck` | Executes TypeScript typecheck across all workspaces. |
| **Zero-Dependency Typecheck (Offline)** | `tsc --noEmit --project packages/db-types/tsconfig.json` | Uses global `tsc` 7.0.2 to verify `@finvault/db-types` without node_modules. |
| **Monorepo Lint** | `pnpm turbo run lint` or `pnpm run lint` | Runs ESLint across workspaces. |
| **Monorepo Tests** | `pnpm turbo run test` or `pnpm run test` | Executes Vitest test suites. |

---

### 4.3 Automated Verification Suite for Milestone 1 Reviewers & Challengers

We have authored and verified the automated verification script:
`d:\programming\New_project\.agents\teamwork\explorer_m1_3\verify-m1.js`

To run the verification suite:
```powershell
node .agents/teamwork/explorer_m1_3/verify-m1.js
```

#### What `verify-m1.js` Verifies (86 Discrete Invariant Checks):
1. **Monorepo Scaffolding (11 checks):**
   - Existence and JSON validity of `package.json`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`.
   - Existence of `pnpm-workspace.yaml`, `.gitignore`, `.env.example`.
2. **Shared Packages Scaffolding (15 checks):**
   - Existence and JSON validity of manifests for `packages/db-types`, `packages/sync-engine`, `packages/ui`.
   - Source entry points: `packages/db-types/src/index.ts`, `packages/sync-engine/src/index.ts`, `packages/ui/src/index.tsx`, `packages/ui/src/tokens.ts`.
3. **Application Cockpits Scaffolding (17 checks):**
   - Web: `apps/web/package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `src/app/layout.tsx`, `src/app/page.tsx`.
   - Mobile: `apps/mobile/package.json`, `tsconfig.json`, `app.json`, `metro.config.js`, `App.tsx`.
4. **Supabase Infrastructure (4 checks):**
   - `supabase/config.toml`.
   - `supabase/migrations/20261108000000_init_finvault_schema.sql`.
   - Edge functions: `validate-transaction/index.ts`, `sync-reconcile/index.ts`.
5. **Governance & Rule Alignment (6 checks):**
   - Rule 01: glob matches `**/{supabase,packages,apps}/**` (no longer `**/backend/**`); prohibits `NUMERIC(19,4)`; strictly enforces `BIGINT`.
   - Rule 02: glob matches `**/{apps/web,apps/mobile,packages/ui}/**` (no longer `**/frontend/**`); enforces `#040A0A` and `<180ms`.
6. **Skills Alignment (5 checks):**
   - `db-migration-and-sync`: references `supabase/migrations/`; removes `Alembic` from primary workflow.
   - `verify-and-record`: references `Vitest` and `fast-check`; removes `pytest` from primary workflow.
7. **Documentation Cleanliness (9 checks):**
   - `docs/05`: Google OAuth + RLS; no obsolete local bearer auth as Phase 1.
   - `docs/06`: Vitest + fast-check; no Pytest/Hypothesis as Phase 1 test runner.
   - `docs/07`: Supabase cloud/CLI; no Docker Compose as Phase 1 local stack.
   - `docs/08`: TypeScript + Zod; no Pydantic v2 on FastAPI as Phase 1 backend.
8. **Double-Entry Trigger & Database Invariants (8 checks):**
   - `docs/04-DATABASE-SCHEMA.md`: `verify_transaction_balance`, `DEFERRABLE INITIALLY DEFERRED`, `RAISE EXCEPTION`, `COALESCE(NEW.transaction_id, OLD.transaction_id)`, `update_account_balance`, `handle_new_user_provisioning`, `post_transaction`, `sync_queue`.
9. **Types & Design Tokens (11 checks):**
   - `packages/db-types/src/index.ts`: `balance_minor: bigint`, `amount_minor: bigint`, `principal_minor: bigint`.
   - `packages/ui/src/tokens.ts`: `#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`, `transitionDurationMs <= 180`.

---

## 5. Verification Method

To independently verify all claims made in this report, execute the following commands in PowerShell from the project root `d:\programming\New_project`:

### Step 1: Verify Host Environment & Git PATH
```powershell
# Verify Node 24, npm 11, Corepack 0.36
node -v; npm -v; corepack -v

# Ensure Git is accessible
$env:Path = "C:\Program Files\Git\cmd;$env:Path"
git --version
```
*Expected Result:*
- Node `v24.21.0`, npm `11.19.0`, Corepack `0.36.0`.
- Git `git version 2.48.1.windows.1`.

---

### Step 2: Verify pnpm Enablement via User Directory
```powershell
corepack enable --install-directory "$env:APPDATA\npm" pnpm
Test-Path "$env:APPDATA\npm\pnpm.CMD"
```
*Expected Result:* Exits with code 0; `Test-Path` returns `True`.

---

### Step 3: Run the Automated Milestone 1 Verification Suite
```powershell
node .agents/teamwork/explorer_m1_3/verify-m1.js
```
*Expected Result:*
- Displays test execution breakdown across all 9 categories (86 checks).
- Upon Worker completion of Milestone 1 scaffolding and documentation realignments: exits with code 0 (`Results: 86/86 passed (0 failed)`).

---

### Step 4: Verify Monorepo Workspace Manifests & JSON Validity
```powershell
Get-ChildItem -Path "package.json", "turbo.json", "tsconfig.json", "packages/*/package.json", "apps/*/package.json" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    try {
        $null = [System.Text.Json.JsonDocument]::Parse($content)
        Write-Host "VALID: $($_.FullName)" -ForegroundColor Green
    } catch {
        Write-Host "INVALID: $($_.FullName) - $($_.Exception.Message)" -ForegroundColor Red
    }
}
```
*Expected Result:* All JSON files parse cleanly with `VALID`.

---

### Step 5: Verify Stale References Removal
```powershell
# Ensure docs/05, 06, 07, 08 contain zero unapproved legacy references
$stale = Select-String -Path "docs/05-SECURITY-AND-COMPLIANCE.md", "docs/06-TESTING-AND-QA.md", "docs/07-DEPLOYMENT-AND-OBSERVABILITY.md", "docs/08-STANDARDS-AND-CHANGELOG.md" -Pattern "FastAPI|Alembic|Pytest|Hypothesis|Loguru|Pydantic"
if ($stale) {
    Write-Host "FAILED: Found stale references:" -ForegroundColor Red
    $stale | ForEach-Object { Write-Host "$($_.Filename):$($_.LineNumber) $($_.Line)" }
} else {
    Write-Host "PASSED: All stale references eliminated from core spec files." -ForegroundColor Green
}
```
*Expected Result:* `PASSED: All stale references eliminated from core spec files.`

---

### Step 6: Verify Double-Entry Constraint Trigger & Integer Minor Units
```powershell
# Verify deferred constraint trigger in docs/04
Select-String -Path "docs/04-DATABASE-SCHEMA.md" -Pattern "DEFERRABLE INITIALLY DEFERRED", "RAISE EXCEPTION", "COALESCE\(NEW\.transaction_id"

# Verify BIGINT minor units in db-types
Select-String -Path "packages/db-types/src/index.ts" -Pattern "bigint"
```
*Expected Result:* Matches found for all deferred constraint triggers and `bigint` typing.

---

### Invalidation Conditions
This verification specification is invalidated if:
1. `corepack enable pnpm` is attempted without `--install-directory`, resulting in `EPERM` error on `C:\Program Files\nodejs\`.
2. Any monetary column is specified as `FLOAT`, `DOUBLE`, `REAL`, or `NUMERIC` with decimals, violating the `BIGINT` minor units invariant.
3. The double-entry trigger fails to defer validation to commit time via `DEFERRABLE INITIALLY DEFERRED`, aborting valid multi-leg transactions.
4. Outdated Python/FastAPI references remain in `docs/05`, `docs/06`, `docs/07`, or `docs/08` outside the designated "Future Scope" sections.
