# Architecture & Tech Stack — FinVault

## 1. System Topology & Cloud-Backend Architecture (Active Baseline: Milestones 1–6)
* **Monorepo:** Turborepo + pnpm workspaces with strict unified `tsconfig.base.json`.
* **Frontend Web (`apps/web`):** Next.js 14+ App Router, Tailwind CSS with Venzer design tokens, `@supabase/ssr`, safe BigInt serialization across React Server Component boundaries, rendering 5 responsive views (Net Worth, Cash Flow, Multi-Split Transactions, IOU Contra Clearing, Login) conforming to $\le 3$ visual component groups.
* **Mobile Client (`apps/mobile`):** React Native / Expo (Android first, iOS ready) with `ExpoSQLiteAdapter` achieving sub-millisecond offline write latency (0.29ms mean, well within the <50ms SLA), hardware biometric gating (`expo-local-authentication`), and background delta sync (60s periodic + AppState foregrounding).
* **Backend & Database (`supabase/`):** **Supabase (Managed Cloud PostgreSQL 16 + pgvector)**
  * **Authentication:** Supabase Auth with Google OAuth (Gmail sign-in, PKCE flow) & session JWTs.
  * **Data Access:** Supabase PostgREST auto-generated REST API & `@supabase/supabase-js` client SDK.
  * **Business Logic & Validation:** PostgreSQL Database Functions & Triggers (server-side `DEFERRABLE INITIALLY DEFERRED` constraint trigger `trg_verify_transaction_balance` aborting non-balancing entries, balance maintenance trigger `trg_update_account_balance` with optimistic concurrency versioning, and atomic `post_transaction` / `settle_iou` RPCs) + Supabase Edge Functions (Deno / TypeScript).
  * **Security:** Row-Level Security (RLS) on all tables strictly isolating data by `auth.uid() = user_id`.
* **Shared Packages:**
  * `packages/db-types`: TypeScript domain interfaces with strict `bigint` minor currency units (paise/cents) and zero floating-point money.
  * `packages/sync-engine`: Offline-first SQLite adapter, mutation outbox queue (`sync_queue`), bidirectional push/pull delta sync protocol, and deterministic Last-Write-Wins (LWW) conflict resolution.
  * `packages/ui`: Venzer Botanical Minimalist design tokens (`#040A0A`, `#DEEEDA`, `#C7E0BA`, `#7AAA4A`, `#90A999`, `#38424C`, `#E06A55`), 24px container radius, 12px control radius, <180ms transitions, string-buffered `AmountInput`, and real-time sub-50ms `BalanceBadge`.
* **Phase 3 Reserved Scope:**
  * **Python FastAPI & pgvector ML Services:** Strictly reserved for Phase 3 AI/ML sidecar services (e.g., local LLM categorization, receipt OCR, embedding search). Never generate Python/Alembic code for Phase 1–2 ledger or web/mobile tasks.
* **Future Self-Hosted Mode:**
  * Migration path to self-hosted Docker PostgreSQL 16 + Python FastAPI + local Wi-Fi LAN / mDNS sync is preserved on the future roadmap for air-gapped deployments.

## 2. Monorepo Directory Layout
```
finvault/
├── apps/
│   ├── web/                    # Next.js 14+ Web Cockpit (5 views, BigInt RSC safe)
│   └── mobile/                 # React Native / Expo App (ExpoSQLiteAdapter, Biometrics)
├── packages/
│   ├── ui/                     # Venzer Design System shared components & BigInt money utils
│   ├── sync-engine/            # Offline-first SQLite <-> Supabase delta sync & LWW outbox
│   └── db-types/               # Generated database TypeScript types (native BigInt)
├── supabase/
│   ├── migrations/             # PostgreSQL DDL, deferred triggers, RPCs & RLS policies
│   └── functions/              # Supabase Edge Functions (Deno: validate-transaction, sync-reconcile)
├── tests/                      # 5-Tier 196-test master and adversarial verification suite
├── docs/                       # Modular architecture & specifications
├── .agents/                    # Antigravity rules and operational skills
├── AGENTS.md                   # Operational constitution & root router
├── TASKS.md                    # Live execution checklist
└── CHANGELOG.md                # Project evolution history
```

## 3. Technology Stack Summary

| Layer | Primary Tech | Role |
| :--- | :--- | :--- |
| **Monorepo** | Turborepo + pnpm | Workspace package orchestration (`tsconfig.base.json`) |
| **Web** | Next.js 14+ / React 18+ | Responsive desktop financial cockpit with BigInt RSC safety |
| **Mobile** | React Native / Expo | Android mobile app with `ExpoSQLiteAdapter` (<50ms SLA) & biometrics |
| **Client Storage** | SQLite / Expo SQLite | Zero-latency local storage (<0.3ms mean write) & `sync_queue` outbox |
| **Cloud Database** | Supabase (PostgreSQL 16) | Managed cloud DB, deferred double-entry triggers, atomic RPCs |
| **Auth** | Supabase Auth (Google OAuth) | Gmail login with PKCE, JWT sessions, RLS `auth.uid() = user_id` |
| **Edge Compute** | Supabase Edge Functions | Deno TypeScript validation (`validate-transaction`, `sync-reconcile`) |
| **Shared UI** | Botanical Minimalist | Tokens (`#040A0A`), 24px container, 12px control, <180ms transitions |
| **Data Contracts** | `packages/db-types` | Strict `BIGINT` minor units, zero floats |
| **Sync Protocol** | `packages/sync-engine` | LWW conflict resolution, mutation outbox queue, push/pull delta sync |
| **Testing** | 5-Tier 196-Test Suite | Property testing (`fast-check`), E2E runner, backend/frontend adversarial |
| **Phase 3 Reserved** | Python FastAPI + pgvector | AI/ML sidecar services only (categorization, OCR, embeddings) |
