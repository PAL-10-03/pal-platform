# PAL Newstart — deployable application package

This package is the full PAL Node/Express application, not a patch or separate app. It includes the original BAA modules unchanged plus isolated Newstart operational modules. It does not include bots, bot changes, Walmart automation, or live QuickBooks Desktop integration.

## Required deployment sequence
1. Retain the November 8 original ZIP and a Supabase backup for rollback.
2. In the Supabase SQL Editor for the existing PAL project, run `PAL_NEWSTART_OPERATIONS.sql` **once before deploying**. This script creates only `pal_ns_*` tables/functions; review it before execution. No BAA tables are targeted.
3. Deploy this ZIP's application contents to the existing Render service using your normal GitHub deployment workflow. Keep all existing Render environment variables and Clerk configuration unchanged.
4. Optionally set `PAL_NEWSTART_MONTHLY_CHECKLISTS=true` to create the ten monthly maintenance jobs automatically; without it, the manager can create them from Newstart. This is application scheduling, not a bot.
5. Sign in with the existing Clerk login and verify Newstart maintenance, directory, payroll audit, shopping, reports and exports. Check BAA portal after deployment.

## Boundaries
- No new logins, no Grok bots, no QuickBooks Online or BAA configuration changes.
- QuickBooks Desktop file export, automatic PDF storage/email, automated menus, Walmart carts, and allergy screening are **not implemented**. Do not represent them as working.
- TaskMaster Pro timecard audit currently accepts CSV with Employee ID/Employee Name and Hours. The actual export format may require mapping.
- State report closure stores a database snapshot; browser printing is supported. A permanently stored PDF in Reports is not implemented.
- PIN `6751` should not be used as the sole authorization mechanism; existing Clerk/role checks still apply.

## Verification
The baseline BAA-specific source files were compared byte-for-byte to the original ZIP and were unchanged. Three shared files have narrow changes to load/register Newstart code. Local syntax checks and the existing five consolidated tests passed. Live Render/Clerk/Supabase end-to-end behavior cannot be guaranteed from a local package alone.
