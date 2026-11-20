# PAL Intuit API error-handling release — November 2, 2026

Based on PAL_Complete_Contact_Support_Release_2026-11-02.zip. Complete application package, not a partial patch.

## Changes
- Kept small gray Contact Support mailto link to admin@palbiz.app in the PAL workspace and public legal pages.
- Added `intuit_tid` extraction from Intuit API and OAuth error responses, with strict allowlisting.
- Added minimal, server-side, persistent troubleshooting records for failed API calls: tenant, error category, HTTP status, Intuit transaction ID, timestamp. Never store request bodies, tokens, credentials, customer data, or raw API responses in these records.
- Categorize HTTP 400/422 as validation errors, 404 as API syntax/endpoint errors, and other unsuccessful QBO responses as query errors. Existing OAuth retry/reconnect logic retained.
- New Supabase `pal_qbo_error_logs` table, RLS enabled, direct anon/authenticated privileges revoked. This migration MUST be run before deploying the updated application. Migration is idempotent and does not modify QBO transactions.

## Test results
- 16 static security/behavior assertions: passed.
- All JavaScript files: node --check passed.
- No actual Intuit API syntax/validation error calls performed, because Intuit credentials and live QBO connection are not configured.
- No live Supabase logging insertion performed; production database migration and deployment remain user actions.
- Mailbox receipt of Contact Support email has not been independently verified.

## Steps
1. In Supabase SQL Editor, run `PAL_QBO_MIGRATION.sql` (full file). Existing connection tables are preserved; new error log table is created.
2. Deploy the contents of this complete ZIP through the existing GitHub/Render workflow.
3. Verify Contact Support opens an email addressed to admin@palbiz.app, and confirm the mailbox actually receives a test email.
4. Once Intuit production credentials are released, test an actual QBO API validation error and check that the row includes the `intuit_tid` when Intuit provides one.

## Intuit questionnaire integrity
Q1 (Have you tested API syntax and validation errors?): NO until actual API or realistic mocked HTTP behavior tests have been performed. These static checks do not substantiate a YES.
Q2 (Capture intuit_tid?): implemented in this release; verify on actual error response after connection.
Q3 (Store error information for troubleshooting?): implemented using Supabase; requires migration and live verification.
Q4 (Support contact in app?): YES once the link is deployed and working and the support mailbox is monitored.
