# PAL QuickBooks security patch — November 2, 2026

## Changes
- Added strict same-origin validation to both state-changing QuickBooks forms.
- Bound the OAuth callback to the original signed-in Clerk user and rechecked BAA management permission.
- Added baseline security headers (nosniff, referrer, anti-framing, permissions policy, HSTS on HTTPS).
- Preserved all other PAL application files and QuickBooks read-only accounting behavior.

## Before deployment
1. Back up the currently deployed PAL release and database.
2. Verify the Supabase `PAL_QBO_MIGRATION.sql` has been applied.
3. Deploy via your existing GitHub/Render workflow; no new secret is included in this archive.
4. Test Clerk sign-in, both tenant dashboards, terms/privacy, QuickBooks connect/disconnect pages.
5. Test POST origin validation and OAuth callback authorization with a test company before using BAA production credentials.

## Outstanding before Intuit security certification
This is a targeted code patch, **not a full security audit**. Verify live RLS/privileges, token rotation/revocation, cross-tenant API isolation, dependency vulnerabilities, incident response, and Intuit's full security checklist. A full Content-Security-Policy requires inventory of Clerk/third-party scripts. Do not certify compliance solely on this patch.
