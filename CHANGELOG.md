# Changelog — FinVault

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-11-26
### Added & Changed
- **4-Layer Automated QA & Governance Upgrade**:
  - Upgraded `.agents/skills/scaffold-feature/SKILL.md` and `.agents/skills/verify-and-record/SKILL.md` to enforce 4-layer verification (Static/Unit/Adversarial + Web Playwright & Browser Subagent + Mobile Maestro/`mobile-mcp`/Logcat + Git Gate).
  - Updated `AGENTS.md`, `docs/06-TESTING-AND-QA.md`, and `docs/11-ENV-AND-MCP.md` documenting Playwright, Maestro, `mobile-mcp`, and Browser Subagent visual QA protocols.
  - Added `web-e2e` Playwright job to `.github/workflows/ci.yml` and uncached `"e2e"` task to `turbo.json`.
- **Web Playwright E2E Harness (`apps/web`)**:
  - Added `playwright.config.ts`, `e2e/fixtures.ts` (auto-failing on `pageerror`, `console.error`, and `>= 500` responses), `e2e/auth.setup.ts`, and `e2e/smoke.spec.ts` covering `/login`, `/`, `/cash-flow`, `/transactions` (`BalanceBadge` validation), and `/ious`.
  - Updated `.gitignore` to exclude `apps/web/.env.test.local`, `apps/web/playwright/.auth/`, `apps/web/playwright-report/`, and `apps/web/test-results/`.
- **Mobile QA, Biometric Guard & TypeScript Fix (`apps/mobile`)**:
  - Added `"noEmit": true` to `apps/mobile/tsconfig.json` resolving `TS5096`.
  - Added strictly dev-only biometric bypass (`canBypassBiometricAuth` guarded by `__DEV__ && EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC === 'true'`) with adversarial tests in `tests/mobile/biometric-bypass.test.ts`.
  - Instrumented mobile screens and navigation with semantic `testID` props, added baseline Maestro flows (`apps/mobile/.maestro/`), `scripts/ensure-emulator.mjs` (`qa:emulator-start`, `qa:emulator-stop`), and `scripts/check-logcat.mjs` (`qa:logcat-check`).
  - Fixed Android status bar top inset overlap in `TabNavigator.tsx` and `ErrorBoundary.tsx` via explicit `StatusBar.currentHeight` padding, hardened `check-logcat.mjs` against `uiautomator`/`UiAutomationService` harness noise, and enforced sequential Layer 3 QA (`qa:reset-uiautomator` + cooldown) in `verify-and-record`.
  - Added autonomous EAS APK build/download/install pipeline (`apps/mobile/scripts/sync-emulator-apk.mjs`, `qa:sync-apk`) with content-hash caching in gitignored `apps/mobile/.cache/`, wired into `verify-and-record` Layer 3, plus Botanical `apps/web/src/app/icon.svg` and `public/favicon.ico` eliminating `/login` favicon 404 errors.
  - Pinned Maestro Android driver port (`--driver-host-port 7001`) in `apps/mobile/package.json` and extended `qa:reset-uiautomator` to terminate resident `com.mobilenext.mobilecli.DeviceServer` (`UiAutomationService`) processes so all 3 Maestro flows pass deterministically on Android 16 (`emulator-5554`).
- **Mobile Supabase Auth, Biometric Gate & Cloud Sync (`apps/mobile`, `packages/sync-engine`)**:
  - Installed Expo SDK 51 auth packages (`expo-web-browser`, `expo-auth-session`, `expo-linking`, `expo-crypto`) and implemented Google OAuth PKCE (`finvault://auth/callback` via `WebBrowser.openAuthSessionAsync` + `exchangeCodeForSession`) plus email/password sign-in inside `apps/mobile/src/lib/auth/oauth.ts`.
  - Added Botanical Minimalist `LoginScreen.tsx` (`mobile-google-login-btn`), `AuthProvider.tsx`, and `resolveAuthGateScreen` (`auth-gate.ts`) gating unauthenticated launches to `LOGIN` (`__DEV__ === false` never bypasses) and enforcing `BiometricLockScreen` when restoring persisted sessions.
  - Wired `SyncProvider.tsx`, `DatabaseProvider.tsx`, and `packages/sync-engine` (`executeDeltaSync`, `OutboxQueueManager.getPendingCount`) to attach active Supabase session JWTs, generate RFC4122 UUID idempotency keys, display live `Synced` / `Pending offline (N)` status and Account/Sync modal (`Sync Now`, `Sign Out`) in `TabNavigator.tsx`.
  - Added adversarial & unit coverage in `tests/mobile/auth-gate.test.ts` and updated `01-launch-and-navigation.yaml`, `02-offline-transaction-flow.yaml`, and `scripts/run-maestro.mjs` (`3/3` Maestro flows passing on live EAS preview APK).

## [1.2.0] - 2026-11-18
### Changed
- **Agent Instruction Suite & Token Efficiency Realignment**: Streamlined root operational router [`AGENTS.md`](file:///d:/programming/New_project/AGENTS.md) and `.agents/rules/` (`00-living-plan-protocol.md`, `01-financial-ledger-safety.md`, `02-frontend-mobile-standards.md`, `03-sync-and-rls-parity.md`) to surgical, contract-first progressive disclosure pointers, optimizing token efficiency.
- **Architectural Documentation Synchronization**:
  - Synchronized [`docs/02-ARCHITECTURE-AND-STACK.md`](file:///d:/programming/New_project/docs/02-ARCHITECTURE-AND-STACK.md), [`docs/06-TESTING-AND-QA.md`](file:///d:/programming/New_project/docs/06-TESTING-AND-QA.md), and [`docs/07-DEPLOYMENT-AND-OBSERVABILITY.md`](file:///d:/programming/New_project/docs/07-DEPLOYMENT-AND-OBSERVABILITY.md) to reflect the active baseline: Turborepo + pnpm monorepo, Supabase Cloud PostgreSQL 16 with RLS, Google OAuth PKCE, Deno Edge Functions, `packages/sync-engine` LWW outbox, `packages/ui`, `apps/web` with BigInt RSC safety, `apps/mobile` with `ExpoSQLiteAdapter` (<0.3ms write latency) & biometrics, and the 5-tier 196-test suite.
  - Formally documented that Python FastAPI, Alembic, Pytest, and Hypothesis are reserved strictly for the Phase 3 AI/ML sidecar service (categorization, OCR, embedding pipelines) and are never used in Phase 1–2 ledger or web/mobile tasks.
- **Workspace Test Runner Harmonization**: Synchronized `@finvault/sync-engine` test script to native `node --test` harness matching Node.js SQLite integration, ensuring `pnpm turbo test` and `pnpm turbo typecheck` pass across all 5 workspace packages with zero errors and 196/196 test verification passing cleanly.
- **Automated Verification, Record & Push Gate**: Upgraded `.agents/skills/verify-and-record/SKILL.md` and `AGENTS.md` to automate Git conventional commit and push upon completion of the 5-tier verification suite.
- **Milestone 7 CI/CD & Deployment Readiness**:
  - Created GitHub Actions automated CI gate (`.github/workflows/ci.yml`) enforcing frozen lockfile, Turborepo typecheck, and full 196-test verification suite on push and PR to `main`.
  - Modernized CI workflow for Ubuntu 24.04 runners and Node.js 22 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` execution flags.
  - Resolved `apps/mobile` TypeScript `process.env` type resolution by introducing `apps/mobile/env.d.ts` and `@types/node`.
  - Audited Supabase Deno Edge Functions and added root convenience scripts (`supabase:link`, `supabase:push`, `supabase:deploy-functions`).
  - Configured Vercel web cockpit (`apps/web/vercel.json`) with Next.js framework preset and security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
  - Configured Expo EAS standalone Android APK profile (`apps/mobile/eas.json`), package identifier `com.finvault.app`, and biometric/sqlite plugins in `apps/mobile/app.json`.
  - Declared `fast-check` in root and mobile workspaces and configured `.npmrc` (`shamefully-hoist=true`) to guarantee clean ESM module resolution for root-level test runners during GitHub Actions CI.
  - **Vercel Cloud Deployment Hardening & 500 Error Remediation**:
    - Diagnosed Vercel runtime `500: Internal Server Error` caused by disabled `outputFileTracing` and unhandled session lookups on unauthenticated routes.
    - Environment-gated Windows NTFS asset flush plugins and `outputFileTracing: false` to local Windows non-Vercel runs (`process.platform === 'win32' && !process.env.VERCEL`), allowing Vercel serverless builds to perform standard client module tracing.
    - Hardened `apps/web/src/middleware.ts` with early exclusion of `/_next` data/asset requests, `try/catch` guard over Supabase auth calls, and support for demo session cookies.
    - Hardened all `apps/web` Server Components (`/`, `/cash-flow`, `/transactions`, `/ious`) with server-side `isAuthenticatedSession()` redirect guards so unauthenticated requests cleanly navigate to `/login` with zero 500 crashes.
    - Updated `apps/web/src/app/login/page.tsx` demo button to set `finvault-demo` cookie for local interactive testing.
  - **Linked Cloud CLI Capabilities Protocol**: Updated `.agents/skills/db-migration-and-sync/SKILL.md` and `docs/11-ENV-AND-MCP.md` documenting authenticated agent execution for `npx supabase db push --remote`, `npx supabase functions deploy`, `npx vercel env ls`, and `npx vercel logs`.
  - **Milestone 7.6 Expo EAS Android APK Configuration & Plugin Fix**:
    - Removed redundant `"expo-sqlite"` config plugin entry in `apps/mobile/app.json` (autolinked natively in Expo SDK 51) while preserving `ExpoSQLiteAdapter` in `package.json`.
    - Added `"cli": { "appVersionSource": "local" }` in `apps/mobile/eas.json` to resolve EAS CLI versioning warnings while keeping preview APK configuration.
    - Verified `apps/mobile` configuration with `expo config --json` and configured live Supabase project credentials in `apps/mobile/.env`.
    - Provisioned Botanical Minimalist launcher and adaptive icon PNG assets in `apps/mobile/assets/` to satisfy Android prebuild asset generation.
    - Configured Metro bundler `resolveRequest` hook in `apps/mobile/metro.config.js` to alias `node:sqlite` to `apps/mobile/src/shims/node-sqlite-shim.js`, allowing React Native / Hermes release bundling while preserving Node.js test runner compatibility.
    - Created Expo config plugin `apps/mobile/plugins/with-ipv4-gradle.js` and injected `GRADLE_OPTS` in `apps/mobile/eas.json` forcing IPv4 network stack (`preferIPv4Stack=true`, `preferIPv4Addresses=true`) to permanently resolve cloud runner IPv6 socket unreachable errors during native `:expo-sqlite:downloadSQLite` compilation.
    - Successfully built and validated standalone Android preview APK via EAS Build (`230a0043-99e1-49a5-8769-bcc70891c5be`) with direct artifact download generated at `https://expo.dev/artifacts/eas/hqelyEBFoNy55sUr6RRe0XRGa_4NlM9cEIB5kdMSLLs.apk`.
    - **Android Launch Crash Remediation (`"main" has not been registered`)**:
      - Captured emulator `logcat` crash revealing uncalled `AppRegistry.registerComponent("main")` due to missing root registration in `App.tsx`.
      - Created `apps/mobile/index.ts`, configured `"main": "index.ts"` in `apps/mobile/package.json`, and called `registerRootComponent(App)` in both entry paths.
      - Created Botanical Minimalist `ErrorBoundary` (`apps/mobile/src/components/ErrorBoundary.tsx`) wrapping the root component tree to catch unexpected exceptions, display stack traces, and provide interactive recovery rather than crashing the process.
      - Hardened `RootNavigator.tsx` with SQLite readiness spinner and error propagation to the boundary.
      - Provisioned `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `apps/mobile/eas.json` `env` for consistent cloud builds.
      - Bundled `sqlite-amalgamation-3450300.zip` into `apps/mobile/downloads/` and injected Gradle task hook copying the archive during `createNativeDepsDirectories.doLast` while skipping `downloadSQLite`, eliminating remote network dependence on `sqlite.org`.
      - Built standalone preview APK (`513a600a-31b0-4bd1-b61b-3de1985c097d` -> [9-EkUzMywTE-lQPjU7u_G7UZ6adWSt3kxQWXInta69I.apk](https://expo.dev/artifacts/eas/9-EkUzMywTE-lQPjU7u_G7UZ6adWSt3kxQWXInta69I.apk)).
      - Installed and verified live on Android Emulator `emulator-5554`: process stays open (PID 9631), Botanical navigation shell rendered, and offline SQLite ledger active with 0 crashes.
  - Added `ADR-011: Managed Cloud Deployment Topology (Supabase Cloud + Vercel + Expo EAS APK)` in `docs/10-ADR.md` and updated `docs/07-DEPLOYMENT-AND-OBSERVABILITY.md` with full deployment and rollback playbooks.

## [1.1.0] - 2026-11-11
### Added
- **Milestones 1–6 Core Platform Release**: Complete implementation and full verification of the FinVault privacy-first personal finance platform across Web and Android.
- **Monorepo Foundation & Governance (Milestone 1)**: Turborepo monorepo structure with pnpm workspaces, strict TypeScript bases, living plan protocols (`.agents/rules/`), and aligned architectural specifications (`docs/01`–`docs/11`).
- **Database Architecture & Ledger Invariants (Milestone 2)**:
  - Supabase PostgreSQL schema with `BIGINT` minor currency units (paise/cents), prohibiting floating-point money.
  - Server-side `DEFERRABLE INITIALLY DEFERRED` constraint trigger enforcing $\sum \text{debits} == \sum \text{credits}$.
  - Balance maintenance triggers with optimistic concurrency versioning, user signup bootstrap triggers, and atomic `post_transaction` RPC.
  - Strict Row Level Security (RLS) isolating user data by `auth.uid() = user_id`.
  - Client SQLite symmetrical schema parity and TypeScript definitions in `packages/db-types`.
- **Sync Engine & Cloud Functions (Milestone 3)**:
  - Offline-first delta sync engine in `packages/sync-engine` featuring mutation outbox queuing (`sync_queue`), push/pull reconciliation, and deterministic Last-Write-Wins (LWW) conflict resolution.
  - Supabase Edge Functions (`validate-transaction`, `sync-reconcile`) and Google OAuth PKCE auth flow.
- **Shared Design System & Web Cockpit (Milestone 4)**:
  - Botanical Minimalist UI component library (`packages/ui`) adhering to Venzer tokens, 24px container radius, 12px control radius, and <180ms transitions.
  - Lossless `BigInt` currency parsing/formatting and real-time sub-50ms `BalanceBadge`.
  - Next.js 14 Web Cockpit (`apps/web`) with safe RSC `BigInt` serialization, Server Actions, and 5 interactive views (Net Worth, Cash Flow, Multi-Split Transactions, IOU Contra Clearing, and Auth).
- **Mobile Application (Milestone 5)**:
  - React Native / Expo application (`apps/mobile`) for Android (iOS ready) featuring isomorphic UUID generation and hardware biometrics (`expo-local-authentication`).
  - High-performance `ExpoSQLiteAdapter` with sub-millisecond offline write latency (0.29ms mean, well below the 50ms SLA).
  - Background delta sync on AppState foregrounding and periodic intervals.
- **Master Test Verification Suite (Milestone 6)**:
  - 196/196 passing automated tests (100% pass rate) across Tiers 1–4 E2E suites and Tier 5 Backend/Frontend adversarial hardening suites.
- **Milestone 7 Initialization**: Pre-push git audit, comprehensive secret scanning, hardened `.gitignore`, synchronized `.env.example` templates, and deployment readiness.

## [1.0.0] - 2026-03-05
### Added
- Initial project blueprint and governance structure for Antigravity IDE.
- Progressive disclosure documentation suite (`docs/01` through `docs/11`).
- Living Plan & Propose-Approve-Propagate Protocol (`.agents/rules/00-living-plan-protocol.md`).
- FinVault Botanical Minimalist Design System with `<180ms` fluid micro-transitions (`ADR-007`).
- Double-Entry Lite financial ledger specification in `BIGINT` minor units (`ADR-001`).
