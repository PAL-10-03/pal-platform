# PAL Phase 2, Step 3 — safe Grok connection candidate

Based on `DND-PAL-10-28_1657(1).zip` (October 28). This is a **candidate**, not deployed or live-tested.

## Changes
- Added `automation/baa-instructions.js` containing the final seven BAA bot roles, including AR/AP, physical cash, morning dashboard and Bookkeeper's attachment/payment application exception.
- Updated `automation/xai.js` to load those BAA instructions. Existing internal DB roles `reconciler` and `reporter` are retained, with API aliases `banker` and `report`.
- Added owner-protected `POST /api/owner/automation/xai-test` with JSON `{ "tenant": "born-again-air" }` to test xAI without customer documents or accounting actions. This sends one small prompt and uses API credits.
- Did not change website pages, Clerk setup, Supabase tables, storage, warehouse workflows or scheduler settings.

## Important limitations
- This does NOT connect the seven saved bots from the Grok consumer interface to PAL. PAL uses the xAI API and its own copies of the role instructions.
- Only Reader currently has a guarded AI execution path. Other bot executors, task handoffs, CEO emails, reports, QuickBooks and cash count workflows are **not implemented** by this ZIP.
- Existing Reader still routes to legacy `reconciler` / `reporter` database roles, and its extraction supports text PDF, CSV and XLSX but not images. This is intentional to avoid changing live database contracts before SQL verification.
- The existing automation scheduler needs a separate verified trigger and is not enabled by this ZIP.
- Never enable `PAL_READER_EXECUTION` or live automation until Phase 4 tests and database schema verification.

## Before deploying
1. Back up current live GitHub commit/ZIP and verify Supabase database backups and **separate Storage object backups**. A ZIP cannot restore database/storage data.
2. Review code diff, deploy to staging if available, and check `node --check` and all normal website workflows.
3. Verify `XAI_API_KEY` exists in Render Environment (do not paste into chat). No additional environment variables are needed for this patch.
4. Use authenticated owner session to run test endpoint; confirm no sensitive info in response/logs.
5. Keep existing automation switches OFF and financial integrations disconnected.

## Rollback
Redeploy the previously known-good GitHub commit/ZIP. No database migration is included. Keep storage and DB backups separately.
