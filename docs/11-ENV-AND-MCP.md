# Environment Variables & Tooling Config — FinVault

## 1. Environment Variables Template (`.env.example`)

```ini
# --- Supabase Configuration (Phase 1) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --- Google OAuth Configuration ---
# Configured directly in the Supabase Dashboard -> Authentication -> Providers -> Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# --- Client Storage ---
CLIENT_DATABASE_NAME=finvault_local.db
SQLCIPHER_KEY_ITERATIONS=64000

# --- Phase 3 / Future Scope (Self-Hosted Fallback) ---
# DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/finvault
# OLLAMA_BASE_URL=http://localhost:11434
```

## 2. Linked Cloud CLI Capabilities

The workspace is linked to both Supabase Cloud and Vercel environments. The agent is authorized to execute cloud inspection, migration, and deployment commands directly:

### Supabase Cloud CLI (`mphsbsdlfmsffdxrgupr`)
- **Database Migrations**: `npx supabase db push --remote` (applies all pending SQL migrations to the cloud PostgreSQL 16 database).
- **Edge Functions**: `npx supabase functions deploy` (deploys Deno Edge Functions in `supabase/functions/`).
- **Project Link**: `npx supabase link --project-ref mphsbsdlfmsffdxrgupr`.

### Vercel CLI (`fin-vault-pied.vercel.app`)
- **Environment Inspection**: `npx vercel env ls` (inspects and verifies configured environment variables on Production and Preview).
- **Deployment Logs**: `npx vercel logs <deployment-or-domain>` (fetches runtime logs and diagnostic stack traces for rapid triage).
- **Production Deployment**: Automated upon verified push to `main` via Vercel GitHub integration.

## 3. Live E2E Auth, Visual QA & Mobile MCP Tooling

- **Web Playwright E2E (`apps/web/.env.test.local`):** Holds `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` (gitignored; documented in `apps/web/.env.example`) for `apps/web/e2e/auth.setup.ts`, saving authenticated `storageState` to `apps/web/playwright/.auth/user.json` (also gitignored).
- **Antigravity Browser Subagent (`/browser`):** Used in `verify-and-record` Layer 2 to visually inspect rendered Next.js routes on `http://localhost:3000` for layout clipping, Botanical Minimalist compliance, console errors, and 5xx network errors.
- **Mobile E2E & Biometric Test Guard (`apps/mobile`):**
  - Dev-only biometric bypass requires BOTH `__DEV__ === true` AND `EXPO_PUBLIC_E2E_BYPASS_BIOMETRIC === 'true'` (never enabled in `apps/mobile/eas.json` preview/production profiles).
  - Emulator lifecycle (`qa:emulator-start`, `qa:emulator-stop`), Maestro suites (`pnpm --filter @finvault/mobile test:maestro`), and ADB crash checks (`qa:logcat-check`).
- **`mobile-mcp` Server:** Connected MCP server providing device screen inspection (`mobile_list_elements_on_screen`, `mobile_take_screenshot`, `mobile_get_device_logs`) for Layer 3 live mobile QA on `emulator-5554`.
