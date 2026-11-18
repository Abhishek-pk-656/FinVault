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
