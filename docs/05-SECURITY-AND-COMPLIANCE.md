# Security & Compliance Baseline — FinVault

## 1. Authentication & Session Security (Phase 1)
* **Identity Provider:** Supabase Auth with Google OAuth (Gmail sign-in) utilizing PKCE (Proof Key for Code Exchange) flow.
* **Token Management:** Standard JSON Web Tokens (JWT) issued by Supabase Auth with short-lived access tokens and secure refresh tokens.
* **Web Client Storage:** Secure, HTTP-only, SameSite cookies managed via `@supabase/ssr`.
* **Mobile Client Storage:** Session tokens and cryptographic master keys stored in device-native secure hardware storage (`expo-secure-store` on Android Keystore / iOS Keychain).
* **Biometric Guard:** Mobile application unlock optionally protected by device biometrics via `expo-local-authentication` (Fingerprint/FaceID) before exposing local SQLite data.

## 2. Multi-Tenant Data Isolation (Row Level Security)
* **RLS Mandate:** PostgreSQL Row Level Security (RLS) is enabled and enforced on 100% of tables containing user data (`accounts`, `transactions`, `journal_entries`, `iou_records`, `sinking_funds`, `audit_logs`).
* **Tenant Isolation Guarantee:** Every policy enforces `USING (auth.uid() = user_id)` and explicit `WITH CHECK (auth.uid() = user_id)`. Unauthenticated requests or cross-tenant query attempts return 0 rows or reject with HTTP 403 Forbidden.
* **Granular Operation Policies:** Granular `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies are defined per table to prevent cross-tenant parameter spoofing during mutations.
* **Append-Only Audit Logs:** `audit_logs` permits `SELECT` and `INSERT` only for `auth.uid() = user_id`, with `UPDATE` and `DELETE` strictly prohibited for immutability.
* **Foreign Key Isolation:** Composite unique constraints and foreign keys ensure accounts referenced in journal entries belong to the exact same `user_id` (`CONSTRAINT fk_journal_entries_account FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id)`).
* **Function Search Path Hardening:** All stored procedures and triggers enforce `SET search_path = public, pg_temp;` to prevent search-path injection vulnerabilities.

## 3. Secrets Management & API Posture
* **Public Client Anon Key:** The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is embedded in Web and Mobile builds and is strictly constrained by PostgreSQL RLS.
* **Privileged Service Role Key:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is strictly confined to secure administrative scripts and server environments; it is never included in client bundles.
* **Zero Telemetry:** The client applications transmit zero telemetry, tracking beacons, or analytical logs to third-party endpoints.

## 4. Future Scope: Self-Hosted Air-Gapped Security Baseline
* **Local Bearer Token Auth:** In self-hosted air-gapped mode, client applications authenticate directly with the local FastAPI backend using local Argon2id password hashes and local JWT bearer tokens.
* **Local LAN mDNS:** Network discovery and sync restricted to the user's encrypted local Wi-Fi network without cloud dependency.
