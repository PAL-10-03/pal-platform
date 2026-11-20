# PAL QuickBooks Online OAuth integration — deployment checklist

## What this build includes
- `/quickbooks/connect` — authorized BAA manager/owner landing page with real OAuth start.
- `/quickbooks/callback` — Intuit redirect URI (register this exact URL in Intuit OAuth redirect settings).
- `/quickbooks/disconnect` — authorized disconnect page and POST revocation.
- `/api/baa/quickbooks/test` — read-only vendor query (no accounting writes).
- Supabase tables for single-use OAuth state and encrypted, tenant-specific tokens.
- BAA-only connection; Newstart is deliberately NOT enabled.

## Before deploying
1. Apply `PAL_QBO_MIGRATION.sql` to the existing PAL Supabase project. Use SQL editor; do not paste credentials into chat.
2. In Render add these environment variables (values never in GitHub):
   - `QBO_CLIENT_ID` — Intuit **production** Client ID
   - `QBO_CLIENT_SECRET` — Intuit **production** Client Secret
   - `QBO_TOKEN_ENCRYPTION_KEY` — 32 random bytes as **64 hexadecimal characters**, generated securely and kept backed up; losing this key makes stored tokens unreadable.
   - Existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` must remain configured.
3. In Intuit OAuth settings add **Redirect URI**: `https://palbiz.app/quickbooks/callback` (not the connect URL).
4. Intuit App Details URLs:
   - Host domain: `palbiz.app`
   - Launch URL: `https://palbiz.app/`
   - Connect/Reconnect URL: `https://palbiz.app/quickbooks/connect`
   - Disconnect URL: `https://palbiz.app/quickbooks/disconnect`
5. Deploy to Render using the project's existing GitHub deployment workflow.

## Testing
- Verify `/terms` and `/privacy` are still public.
- Verify unauthenticated users cannot use connect or disconnect.
- Verify a Newstart-only user cannot use BAA connection pages.
- Authorized BAA manager initiates OAuth and confirms the intended BAA company in Intuit.
- Visit `/api/baa/quickbooks/test` while signed in as an authorized manager. Expect `ok: true`, `readOnly: true`, and a vendor count.
- Verify no accounting transactions were created or changed.
- Do NOT enable any write actions or background accounting automation.

## Important limitations
- No guarantee of pending/For Review bank feed visibility through the standard Accounting API.
- This is a first read-only integration; it does not implement the seven bots' bookkeeping automation.
- The connection only handles the BAA tenant. Future tenants require expanding the server-side authorization and schema carefully, not reusing BAA tokens.
- No live Intuit or Supabase connection was tested during local preparation.
- Production credentials may remain unavailable until Intuit's app details and compliance requirements are satisfied. The connect page safely indicates not configured until credentials exist.
