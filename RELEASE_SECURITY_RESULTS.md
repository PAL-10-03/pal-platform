# PAL Business Solutions — Consolidated QuickBooks Security Release
Date: 2026-11-02

## Source and scope
Based on the user-provided `PAL_QuickBooks_OAuth_Integration(1).zip`, incorporating the prior security patch and tested QuickBooks OAuth changes. This is a **complete application ZIP**, not a partial patch. Existing PAL business features remain in the package.

## Verified locally
- JavaScript source files pass `node --check`.
- 14 mocked QuickBooks route/integration tests passed, 0 failed (`node security-smoke-test.js`).
- BAA manager/owner authorization checked; Newstart manager and employee rejected for QBO routes.
- QuickBooks connect and disconnect reject cross-origin requests.
- OAuth callback verifies same initiating Clerk user and current manager authorization, and consumes one-time state.
- Wrong QBO company realm is rejected.
- Stored tokens are AES-256-GCM encrypted; read-only vendor query test performs no QBO accounting writes.
- Browser security headers configured in server.js.
- User separately ran Supabase RLS/grant checks and reported both QBO tables RLS=true and anon/authenticated SELECT/INSERT=false.

## Not verified — do not claim full compliance yet
- Live Render deployment of this exact release and browser/Clerk flow.
- Live Supabase service-role access and cross-tenant isolation for all PAL application endpoints.
- Intuit OAuth end-to-end production connection (production credentials still locked).
- Complete vulnerability assessment, incident-response implementation, security policy review, and any Intuit-specific compliance conditions.

## Deployment
Deploy the entire ZIP only after backing up current working deployment. No database migration rerun needed for the two QBO tables already created and checked. QBO will remain unconfigured until QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_TOKEN_ENCRYPTION_KEY are configured securely in Render. Never send their values in chat.

**This report is not a security certification.**
