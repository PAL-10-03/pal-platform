# PAL Complete Release — Automatic CEO Daily Check-in

This ZIP contains the full PAL application, not a patch. Existing bot instructions and Rule 001 are retained; the CEO Daily Check-in rule is appended. The exact customer email subject is **Daily Check-in**. Owner copy subject: **Sent to Born Again Air — Daily Check-in** (or tenant name). The owner copy body begins `Sent to Born Again Air`.

## What is actually implemented
- `automation/daily-checkin.js` builds a **status-only** check-in from PAL automation queue information, not QuickBooks financial balances. It does not need customer document uploads.
- `automation/routes.js` invokes the check-in automatically on an authenticated scheduler tick at or after 6:00 AM America/Chicago for each enabled tenant with an explicitly configured recipient. A stable per-day dispatch key prevents ordinary duplicate sends.
- `automation/ceo-email.js` uses Resend, separately logs customer and owner copy acceptance, and does not require per-message owner confirmation when called by the scheduler.
- `automation/baa-instructions.js` and `BAA_Grok_Seven_Bot_Master_Instructions.md` retain existing rules and add the CEO instruction. `CEO_DAILY_CHECKIN_BOT_ADDENDUM.txt` is ready to copy into existing bot configurations (append only).

## Before deploying / enabling real automatic sends
1. Apply `PAL_ACCOUNTING_RULE_001.sql` in Supabase if not yet applied. It creates the tenant-isolated accounting rule and CEO email dispatch tables. Do not re-create or delete existing data.
2. Configure Render: `RESEND_API_KEY`, `PAL_EMAIL_FROM` (sender address verified in Resend), `PAL_OWNER_REPORT_EMAIL`, `PAL_CUSTOMER_REPORT_RECIPIENTS_JSON` (JSON map of tenant ID to authorized customer email), and `PAL_CEO_EMAIL_ENABLED=true`. Keep `XAI_API_KEY` for Grok. Do not share secrets in chat. For BAA only, set `PAL_CUSTOMER_REPORT_RECIPIENTS_JSON={"born-again-air":"AUTHORIZED_BAA_EMAIL@example.com"}` with the real approved recipient. **Do not configure Newstart until it is a real customer and has approved recipients.**
3. Deploy full ZIP contents to GitHub/Render. Existing automation database setup and RPCs must be present. Ensure Born Again Air automation is enabled through PAL's owner-only API (the existing `/api/owner/automation/enabled` endpoint), and Newstart is paused.
4. **Critical: configure a real external cron trigger.** The application does NOT run a reliable built-in 6 AM timer. Use a Render Cron Job or trusted scheduler to POST `https://palbiz.app/api/internal/scheduler/tick` with `x-pal-scheduler-token: <PAL_SCHEDULER_TOKEN>` at least every 5–15 minutes, and configure the same `PAL_SCHEDULER_TOKEN` in Render. Use UTC schedule or a frequent interval so DST doesn't change Central 6 AM delivery. Cron jobs require deployment and an actual run test; without a cron trigger, no automatic emails go out.
5. Run an authorized email test with a consented mailbox, confirm customer and owner receive the right subjects, and inspect the `pal_ceo_email_dispatch` table. Resend acceptance is not proof of delivery. Confirm the scheduler executes and `dailyCheckins` reports `provider-accepted`.

## Important boundaries
- **No automatic QuickBooks posting or financial report generation is activated by this release.** Existing unimplemented worker jobs remain held. The check-in does not claim QuickBooks was checked or accounts reconciled.
- The check-in contains no confidential customer financial records. Customer recipient mappings are isolated by tenant; the owner receives a separate copy.
- Current application has a static allowlist for BAA and Newstart. Future customers require backend tenant registration and a recipient mapping; names are not automatically inferred.
- Email delivery and exact 6:00 AM timing depend on scheduler cadence and provider availability; this is a catch-up scheduler, not a guaranteed-to-the-minute service.
