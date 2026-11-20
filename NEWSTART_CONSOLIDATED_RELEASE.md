# PAL Newstart consolidated build — 2026-11-08

## Do not deploy directly to production
This package is a single consolidated Newstart development deliverable, but not a verified production release. Run the Newstart-only SQL migration in a staging Supabase project and test with Clerk/Render staging first. Never apply this to Born Again Air data. The unchanged BAA-specific source files are included solely because the original PAL app needs them to run; no BAA bot integration is created or scheduled.

## Working code included
- Existing Clerk and Supabase platform; Newstart-only `/api/newstart/ops` routes.
- 10 houses and Office, timestamped maintenance requests, atomic house-specific job numbers, three statuses and completion notes.
- Monthly Maintenance records for ten houses using an idempotent Newstart-only SQL function. Enable automatic server scheduling with `PAL_NEWSTART_MONTHLY_CHECKLISTS=true` after migration. This is ordinary application scheduling, NOT a bot.
- Active and closed state-report periods, completion snapshots and browser print/save-to-PDF. Inspection periods are not automatically deleted.
- Employee and client directories, in-app editing, real XLSX exports.
- TaskMaster Pro file uploads. A separate CSV hours audit supports Employee ID or Employee Name and Hours columns, totals hours, flags unknown/inactive employees, missing entries, below-expected hours, and >40 hours. Printable audit output. Other TMP export layouts need mapping after the meeting.
- Recipes, editable menu notes, shopping lists, inventory confirmation, named approval, utility usage records and contract/insurance renewal alerts.
- Newstart dashboard with monthly checklist overdue flags from the 4th and renewal alerts.
- Existing BAA code and bot instructions preserved.

## Not represented as finished
- A standardized state inspection template with full checklist item details and archived PDFs stored in the existing Reports system.
- Automatic Wednesday menu generation, allergy/texture checks, food-cost rollups, nurse-specific permissions and recurring SMS/email notifications.
- Automatically generated/stored/emailed payroll audit PDF and actual QuickBooks Desktop IIF export: correct format depends on Newstart's QuickBooks version and payroll configuration. No checks or payroll transmissions are created.
- Walmart cart automation and pricing comparisons; no Walmart authorization is configured.
- Fully editable detailed weekly menu grid and accounting code mapping by house.
- Newstart bots, bot schedules, money movement and new Clerk logins.

## Deployment steps
1. Back up the original app and database; do not overwrite the BAA production deployment.
2. Deploy this package to a separate staging Render service with staging Supabase and existing Clerk test credentials.
3. Review and run `PAL_NEWSTART_OPERATIONS.sql` in staging Supabase. The SQL adds `pal_ns_*` objects only.
4. Set `PAL_NEWSTART_MONTHLY_CHECKLISTS=true` only after the SQL migration is installed and reviewed. Verify it creates one monthly job per house without duplication.
5. Test Newstart house creation, maintenance workflow, closing inspection periods, directory export, CSV audit, and permissions.
6. Run all BAA regression checks, verify BAA portal appearance and all BAA routes with known data, then approve any production deployment separately.

## Validation
JavaScript syntax checks and original `consolidated-tests.js` passed locally. No live Supabase/Clerk/Render staging integration was available. This is not evidence of BAA runtime regression testing.
