# Deployment & Observability — FinVault

## 1. Cloud Infrastructure & Platform (Phase 1)
* **Cloud Database & Auth:** Managed Supabase Platform (PostgreSQL 16 + pgvector + Supabase Auth + PostgREST).
* **Web Cockpit Hosting:** Next.js 14+ App Router deployed on Vercel or Node.js container with `@supabase/ssr`.
* **Mobile Client Distribution:** Expo EAS (Expo Application Services) building Android APK / AAB bundles with local SQLite (`op-sqlite` / `SQLCipher`).

## 2. Local Development Environment
* **Workspace Orchestration:** Turborepo with `pnpm` (`pnpm dev`, `pnpm build`, `pnpm test`).
* **Supabase Local CLI:** Local backend development using the official Supabase CLI:
  ```bash
  supabase start          # Starts local PostgreSQL, PostgREST, Auth, and Studio
  supabase db reset       # Applies migrations from supabase/migrations/
  supabase functions serve # Serves Edge Functions locally
  ```

## 3. Observability, Logging & Diagnostics
* **Database & API Metrics:** Supabase Studio dashboard monitors active connections, query latencies, and PostgREST throughput.
* **Client-Side Sync Diagnostics:** `packages/sync-engine` provides a structured JSON logger capturing sync cycle states, queue lengths, HTTP retry counts, and latency, strictly omitting sensitive financial PII.
* **Edge Function Logging:** Deno structured console logs streamed to Supabase log drains.

## 4. Backups & Data Sovereignty
* **Cloud Backups:** Supabase automated daily backups and point-in-time recovery (PITR).
* **Client Snapshots:** One-click encrypted `.finvault` portable export generated from client SQLite store.

---

## 5. Future Scope: Self-Hosted Docker Deployment
* **Container Stack:** Multi-container `docker-compose.yml` deploying PostgreSQL 16, pgvector, and Python FastAPI backend.
* **Diagnostics:** Structured JSON logging using Python `Loguru` for local backend request tracing.
* **Local Wi-Fi Sync:** mDNS local network peer discovery for air-gapped offline synchronization.
