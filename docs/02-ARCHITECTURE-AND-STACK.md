# Architecture & Tech Stack — FinVault

## 1. System Topology & Cloud-Backend Architecture (Phase 1)
* **Frontend Web:** Next.js 14+ (App Router, Tailwind CSS, TypeScript strict) deployed on Vercel / local.
* **Mobile Client:** React Native / Expo (Android first, iOS ready) with offline-first local SQLite (`op-sqlite` / `SQLCipher`).
* **Backend & Database:** **Supabase (Managed PostgreSQL 16 + pgvector)**
  * **Authentication:** Supabase Auth with Google OAuth (Gmail sign-in) & session JWTs.
  * **Data Access:** Supabase PostgREST auto-generated REST API & `@supabase/supabase-js` client SDK.
  * **Business Logic & Validation:** PostgreSQL Database Functions & Triggers (Double-Entry enforcement) + Supabase Edge Functions (Deno / TypeScript).
  * **Security:** Row-Level Security (RLS) on all tables bound to `auth.uid()`.
* **Sync Protocol:**
  * Offline-first client writes to local SQLite first.
  * When online, bidirectional delta sync connects via HTTPS to Supabase REST endpoints.
  * Conflict resolution: Last-Write-Wins (LWW) with client-generated UUIDs and audit logs.
* **Future Scope (Self-Hosted Mode):**
  * Migration path to self-hosted Docker PostgreSQL 16 + Python FastAPI + local Wi-Fi LAN / mDNS sync is retained for users desiring 100% air-gapped deployments.

## 2. Monorepo Directory Layout
```
finvault/
├── apps/
│   ├── web/                    # Next.js 14+ Web Application
│   └── mobile/                 # React Native / Expo Android App
├── packages/
│   ├── ui/                     # Venzer Design System shared components
│   ├── sync-engine/            # Offline-first SQLite <-> Supabase delta sync
│   └── db-types/               # Generated database TypeScript types
├── supabase/
│   ├── migrations/             # SQL schema migrations & RLS policies
│   └── functions/              # Supabase Edge Functions (Deno)
├── docs/                       # Modular architecture & specifications
├── .agents/                    # Antigravity rules and operational skills
├── AGENTS.md                   # Operational constitution & router
├── TASKS.md                    # Live execution checklist
└── CHANGELOG.md                # Project evolution history
```

## 3. Technology Stack Summary

| Layer | Primary Tech | Role |
| :--- | :--- | :--- |
| **Monorepo** | Turborepo + pnpm | Workspace package orchestration |
| **Web** | Next.js 14+ / React 18+ | Responsive desktop financial cockpit |
| **Mobile** | React Native / Expo | Android mobile app with offline capture |
| **Client Storage** | SQLite / SQLCipher | Zero-latency local storage (<50ms) |
| **Cloud Database** | Supabase (PostgreSQL 16) | Free-tier managed DB, pgvector, auto-REST |
| **Auth** | Supabase Auth (Google OAuth) | Gmail login, JWT sessions, RLS integration |
| **Edge Compute** | Supabase Edge Functions | Deno TypeScript custom business logic |
| **Testing** | Vitest + fast-check | Property-based financial invariant tests |
