# PAL Business Solutions — Intuit security remediation release (2026-11-02)

## Release contents
Full PAL application based on PAL_Complete_QuickBooks_Security_Release_2026-11-02.zip.

## Fixes
- OAuth callback responds with 302 to a clean `/quickbooks/result` URL on all paths, with no token/realmId/authorization code in the destination.
- QBO realmId stored AES-256-GCM encrypted in `encrypted_realm_id`; existing `realm_id` column remains nullable for schema compatibility, but no new plaintext realm IDs are written.
- Global no-store/no-cache headers and TRACE/TRACK denied.
- Existing OAuth state/user binding, manager authorization, encrypted tokens and read-only QBO API test retained.

## IMPORTANT DEPLOY ORDER
1. Supabase SQL Editor: execute `PAL_QBO_MIGRATION.sql` from THIS ZIP first. It is designed for an existing BAA database and adds `encrypted_realm_id` and removes the legacy plaintext realm_id NOT NULL constraint. It does not modify QuickBooks accounting transactions.
2. Deploy the FULL ZIP through existing GitHub/Render deployment process. Keep a rollback commit.
3. Verify home/login/QuickBooks pages, unauthenticated access, and server response headers.
4. Once Intuit production credentials are issued, configure QBO_CLIENT_ID, QBO_CLIENT_SECRET and QBO_TOKEN_ENCRYPTION_KEY (32-byte random hex key), then test live OAuth.

## Security checks actually performed
`node security-smoke-test.js`: 17 passed, 0 failed, using mocked Supabase/Intuit services. `node --check` on JavaScript files passed. ZIP integrity test passed.

## Not tested / not certified
Live Render/Clerk/Supabase integration, actual Intuit OAuth, TLS cipher suite, dependency vulnerabilities, secure cookie attributes, stored/reflected XSS across all app routes, SQL/XML injection across all app routes, data-sharing behavior of the AI integration, operational incident response, external vulnerability scan, and Intuit's review. Intuit Question 3 is a representation the developer must make based on actual compliance and a commitment to continuing compliance, not a certificate delivered by this ZIP.

## Legacy connections
This release assumes BAA has not yet connected QBO, as described by the user. Existing connections created with plaintext realm_id would require migration before using the new code; do not deploy this unmodified against a database with a live QBO connection.
