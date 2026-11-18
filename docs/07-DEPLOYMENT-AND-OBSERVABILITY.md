# Deployment & Observability — FinVault

## 1. Cloud Infrastructure & Platform (Active Baseline: Milestones 1–6)
* **Monorepo Build & Task Runner:** Turborepo with `pnpm` workspaces (`pnpm turbo build`, `pnpm turbo typecheck`, `pnpm turbo test`).
* **Cloud Database & Auth:** Managed Supabase Platform (PostgreSQL 16 + pgvector + Supabase Auth + PostgREST).
* **Web Cockpit Hosting:** Next.js 14+ App Router deployed on Vercel or Node.js runtime with `@supabase/ssr` and lossless `BigInt` RSC serialization.
* **Mobile Client Distribution:** Expo EAS (Expo Application Services) building Android APK / AAB bundles with `ExpoSQLiteAdapter` for offline-first local SQLite and hardware biometrics.
* **Edge Functions:** Supabase Edge Functions (Deno / TypeScript) serving `validate-transaction` and `sync-reconcile` endpoints.
* **Phase 3 Reserved Scope:** Python FastAPI services and Alembic are strictly reserved for Phase 3 AI/ML sidecars (categorization, OCR, embedding pipelines). Never introduce Python deployments into Phase 1–2 ledger or web/mobile infrastructure.

## 2. CI/CD & Automated Verification Pipeline
* **GitHub Actions Workflow (`.github/workflows/ci.yml`):**
  - Triggers automatically on `push` and `pull_request` targeting `main`.
  - Runs on `ubuntu-latest` with `pnpm/action-setup@v4` and Node.js 20.
  - Enforces `--frozen-lockfile` dependency verification.
  - Executes `pnpm turbo typecheck` (0 errors across 5 workspace packages).
  - Executes `pnpm turbo test` and the master 5-tier 196-test verification runner (`tests/e2e/runner.ts`, `tier5-backend-adversarial.ts`, `tier5-frontend-adversarial.ts`, mobile stress suites, sync-engine suites).
  - Acts as an unbypassable gate before any cloud or mobile deployment.

## 3. Production Deployment & Rollback Playbook

### A. Supabase Cloud Database & Edge Functions
1. **Link Project:** Link repository to Supabase Cloud project ref:
   ```bash
   pnpm supabase:link --project-ref <YOUR_SUPABASE_PROJECT_REF>
   ```
2. **Push Migrations:** Apply PostgreSQL schema, deferred constraint triggers, and RLS policies:
   ```bash
   pnpm supabase:push
   ```
3. **Deploy Edge Functions:** Deploy Deno TypeScript functions (`validate-transaction`, `sync-reconcile`):
   ```bash
   pnpm supabase:deploy-functions
   ```
4. **Rollback Procedure:**
   - Database migrations: Revert using timestamped down migration SQL via `supabase db push`.
   - Edge Functions: Re-deploy previous stable git tag/commit via `supabase functions deploy <name>`.

### B. Vercel Web Cockpit (`apps/web`)
1. **Deployment Setup:**
   - Connect GitHub repository `FinVault` to Vercel.
   - Set Root Directory to `apps/web`.
   - Vercel automatically detects Next.js framework via `apps/web/vercel.json`.
2. **Environment Variables:**
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel Project Settings.
3. **Security Headers:**
   - Handled via `apps/web/vercel.json` (`nosniff`, `DENY` framing, `strict-origin-when-cross-origin`).
4. **Rollback Procedure:**
   - Instant 1-click rollback to prior deployment hash directly in the Vercel Dashboard.

### C. Expo EAS Android Standalone APK (`apps/mobile`)
1. **Prerequisites & Login:**
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **Configure & Build APK:**
   - Run from `apps/mobile`:
   ```bash
   eas build --platform android --profile preview
   ```
   - Produces a direct, standalone `.apk` binary configured in `eas.json` (`buildType: "apk"`), ready for direct sideloading or internal tester distribution without Google Play Store review delay.
3. **Rollback Procedure:**
   - Re-distribute previous successful `.apk` build artifact from Expo EAS dashboard, or trigger new build from previous git commit tag.

## 4. Local Development Environment
* **Workspace Commands:**
  ```bash
  pnpm dev                # Runs web and mobile development servers
  pnpm turbo build        # Turborepo production build across all workspaces
  pnpm turbo typecheck    # Strict TypeScript checks across 5 workspaces
  pnpm turbo test         # Runs workspace unit & integration test suites
  ```
* **Supabase Local CLI:** Local backend development using the official Supabase CLI:
  ```bash
  supabase start          # Starts local PostgreSQL, PostgREST, Auth, and Studio
  supabase db reset       # Applies migrations from supabase/migrations/
  supabase functions serve # Serves Edge Functions locally
  ```

## 5. Observability, Logging & Diagnostics
* **Database & API Metrics:** Supabase Studio dashboard monitors active connections, query latencies, and PostgREST throughput.
* **Client-Side Sync Diagnostics:** `packages/sync-engine` provides a structured logger capturing sync cycle states, queue lengths, HTTP retry counts, and latency, strictly omitting sensitive financial PII.
* **Edge Function Logging:** Deno structured console logs streamed to Supabase log drains.

## 6. Backups & Data Sovereignty
* **Cloud Backups:** Supabase automated daily backups and point-in-time recovery (PITR).
* **Client Snapshots:** One-click encrypted `.finvault` portable export generated from client SQLite store.

---

## 7. Future Scope: Self-Hosted Docker Deployment
* **Container Stack:** Multi-container `docker-compose.yml` deploying PostgreSQL 16, pgvector, and Python FastAPI backend for air-gapped environments.
* **Diagnostics:** Structured JSON logging using Python `Loguru` for local backend request tracing.
* **Local Wi-Fi Sync:** mDNS local network peer discovery for air-gapped offline synchronization.
