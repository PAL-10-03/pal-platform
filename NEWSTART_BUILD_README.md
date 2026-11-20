# PAL Newstart operations — staged release (November 8, 2026)

## Safety
- This release adds a Newstart-only module, its UI script, and isolated Supabase tables. No Born Again Air routes, bot files, accounting settings, report storage, or tenant records were intentionally changed.
- Existing shared `server.js`, `public/app.js`, and `public/style.css` were minimally modified to mount and display Newstart functionality. Verify BAA regression tests before deploying.
- Do NOT deploy to production before applying/reviewing SQL, staging testing with real Clerk roles, and confirming BAA portal regression behavior. There has been no live Supabase or Render integration test.

## Installation
1. Back up existing Supabase database and application.
2. Run `PAL_NEWSTART_OPERATIONS.sql` in the Supabase SQL editor after review. It creates only `pal_ns_*` tables and Newstart RPC functions. Review service-role privileges and RLS.
3. Keep the existing Clerk configuration and Render environment settings. Set `PAL_NEWSTART_MANAGER_PIN=6751` only if that prototype PIN is approved; never place the PIN in frontend source.
4. Deploy the code to a STAGING environment and test `/company/newstart` with existing Clerk owner and Newstart manager accounts.
5. Confirm `/company/born-again-air` and its documents, reports, accounting, and bot scheduling remain unchanged. Roll back if any regression occurs.

## Implemented in this staged prototype
- Newstart dashboard (live counts from Supabase).
- Newstart maintenance request submission, timestamps, per-house atomic numbering, status updates and completion notes; 10 houses plus Office.
- State Report period closing to an immutable database JSON snapshot and browser print; historical records remain in database. This is **not** yet a generated, archived PDF in Supabase Reports.
- Basic employee/client directories with CSV (Excel-compatible) export, name editing and initial creation.
- TaskMaster Pro file upload to existing Newstart private document storage with a separate upload register. **No payroll calculations or QBD writes.**
- Recipe entry, editable menu notes, editable shopping-list entries and inventory confirmation.
- No Newstart bots, automatic scheduling, Walmart cart actions, payroll submission, or financial transfers.

## Still needed before production or full demo scope
- Full in-app editing for all directory fields, recipes, menus and shopping items; actual XLSX exports rather than CSV.
- Full weekly menu planner, dietary safety checks, client-specific recipe association and restricted dietary data handling.
- Nurse approval permissions and stronger sign-off; current shopping approval is a prototype manager-only action.
- Monthly maintenance checklist template and automatic generation on the first, overdue alerts on the fourth.
- PDF generation and storage in Newstart Reports, state-report template, annual archive/export, authorized deletion controls.
- Payroll audit PDF and email, automatic reconciliation, Tuesday-night scheduling (bots later), QuickBooks Desktop integration.
- Utilities, food costs, lease alerts, notification center, and vendor/insurance integrations.
- Review tenant permissions, security testing, data retention, input validation and audit trails before real resident/employee data is entered.

## Validation performed
- `node --check` passed for changed JavaScript files.
- Existing `node consolidated-tests.js` passed (5 tests).
- No live database, browser end-to-end, or deployment validation was possible in this environment.
