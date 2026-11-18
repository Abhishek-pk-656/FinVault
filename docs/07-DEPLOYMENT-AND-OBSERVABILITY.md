# Deployment & Observability — FinVault

## 1. Cloud Infrastructure & Platform (Active Baseline: Milestones 1–6)
* **Monorepo Build & Task Runner:** Turborepo with `pnpm` workspaces (`pnpm turbo build`, `pnpm turbo typecheck`, `pnpm turbo test`).
* **Cloud Database & Auth:** Managed Supabase Platform (PostgreSQL 16 + pgvector + Supabase Auth + PostgREST).
* **Web Cockpit Hosting:** Next.js 14+ App Router deployed on Vercel or Node.js runtime with `@supabase/ssr` and lossless `BigInt` RSC serialization.
* **Mobile Client Distribution:** Expo EAS (Expo Application Services) building Android APK / AAB bundles with `ExpoSQLiteAdapter` for offline-first local SQLite and hardware biometrics.
* **Edge Functions:** Supabase Edge Functions (Deno / TypeScript) serving `validate-transaction` and `sync-reconcile` endpoints.
* **Phase 3 Reserved Scope:** Python FastAPI services and Alembic are strictly reserved for Phase 3 AI/ML sidecars (categorization, OCR, embedding pipelines). Never introduce Python deployments into Phase 1–2 ledger or web/mobile infrastructure.

## 2. Local Development Environment
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

## 3. Observability, Logging & Diagnostics
* **Database & API Metrics:** Supabase Studio dashboard monitors active connections, query latencies, and PostgREST throughput.
* **Client-Side Sync Diagnostics:** `packages/sync-engine` provides a structured logger capturing sync cycle states, queue lengths, HTTP retry counts, and latency, strictly omitting sensitive financial PII.
* **Edge Function Logging:** Deno structured console logs streamed to Supabase log drains.

## 4. Backups & Data Sovereignty
* **Cloud Backups:** Supabase automated daily backups and point-in-time recovery (PITR).
* **Client Snapshots:** One-click encrypted `.finvault` portable export generated from client SQLite store.

---

## 5. Future Scope: Self-Hosted Docker Deployment
* **Container Stack:** Multi-container `docker-compose.yml` deploying PostgreSQL 16, pgvector, and Python FastAPI backend for air-gapped environments.
* **Diagnostics:** Structured JSON logging using Python `Loguru` for local backend request tracing.
* **Local Wi-Fi Sync:** mDNS local network peer discovery for air-gapped offline synchronization.
