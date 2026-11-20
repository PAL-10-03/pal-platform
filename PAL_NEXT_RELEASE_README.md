# PAL next release — Rule 001 + CEO customer-copy channel

This is a **complete app ZIP**, not a patch. Built from PAL_Complete_Intuit_Error_Handling_Release_2026-11-02.zip.

## Preserved
All existing application files, QBO OAuth, security, Clerk, Supabase, BAA bot role instructions, automation scheduler and Reader implementation. No existing bot instructions removed. Existing master instructions are bundled with an ADDENDUM, not rewritten.

## Added
- Rule 001 appended to Reader, Bookkeeper, Banker, CEO and Report Grok system prompts; approved-rule table and owner-only approval/list API.
- CEO outbound email channel using Resend, with tenant-specific customer recipients and owner copy. Subject and body of owner copy begin `Sent to Born Again Air` or `Sent to Newstart`. Future tenants require explicit tenant registration and mapping; no automatic cross-tenant recipient guesses.
- Owner-only `POST /api/owner/automation/ceo-email/send` with `confirm: SEND_CUSTOMER_AND_OWNER_COPY`, `tenant`, `dispatchKey`, `subject`, `body`. Same dispatchKey suppresses repeat sends after database confirms them. It is a manual authorized delivery endpoint, not a working automatic report generator.
- `GET /api/owner/automation/email-status`, `GET /api/owner/automation/accounting-rules?tenant=born-again-air`, `POST /api/owner/automation/accounting-rules` (tenant, merchant_pattern, category, qbo_account_id, conditions).

## Before deploying
1. Run `PAL_ACCOUNTING_RULE_001.sql` in Supabase SQL Editor. No existing tables dropped.
2. Configure Render variables `XAI_API_KEY` (if missing), `RESEND_API_KEY`, `PAL_EMAIL_FROM` (verified sender), `PAL_OWNER_REPORT_EMAIL` (your own address), `PAL_CUSTOMER_REPORT_RECIPIENTS_JSON` (JSON mapping tenant IDs to explicitly approved customer email addresses), `PAL_CEO_EMAIL_ENABLED=true` only when ready for actual sends. Never paste secrets into chat or GitHub.
3. Deploy ZIP contents to GitHub/Render. Verify owner-only status and xAI-test routes.
4. Start with a **consented test customer mailbox**, not a real financial report. Customer sends are real when enabled. Resend account and verified domain are required.

## Current limitations — do not mistake for finished launch
- CEO daily report job in existing scheduler is still held by worker, not auto-sent; there is no verified report data pipeline. Existing Reader worker only processes uploaded docs when PAL_READER_EXECUTION=true and scheduler is actually triggered. Other bot executors and QBO financial writes remain unimplemented/disabled.
- The CEO manual email endpoint is functional when credentials/recipients are configured, but there is no automatic scheduler-to-email connection yet.
- Email provider acceptance is not proof of delivery; if a process crashes between provider acceptance and database write, manual reconciliation may be needed to prevent duplicate email.
- Rule 001 is present in Grok prompts and approved rules can be persisted, but the full auto-classification engine and QBO account validation/posting are not built.
- No customer emails are sent merely by deploying. Do not enable financial posting while books are under cleanup.
