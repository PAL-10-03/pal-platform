# PAL consolidated release — November 8, 2026

## Included and preserved
- Existing portal, tenant authentication, Gmail OAuth, CEO Daily Check-in, and QBO OAuth read-only implementation retained.
- Complete November 8 BAA master instructions bundled for traceability.
- Rule 003 policy enforced in advisory prompts; no money-movement API introduced.
- Mandatory Reader routing for invoices to Bookkeeper and statements/receipts to Banker.
- Reader statement metadata extraction validation; incomplete statements held for review.
- Daily Banker advisory job scheduled using existing PAL scheduler (requires existing enabled tenant, cron and advisory env flag).

## NOT READY FOR FINANCIAL PRODUCTION — critical missing functionality
- QBO invoice/bill/payment creation, document attachments, bank-feed matching, statement-line reconciliation and true posting/reconciliation APIs are NOT implemented in this package.
- Existing QBO OAuth implementation is read-only. Standard API does not guarantee access to For Review bank-feed items.
- Reader still cannot extract text from image-only uploads; PDF text, XLSX, CSV supported.
- Statement upload currently classifies/routes and validates metadata; it does NOT reconcile QBO.
- Pending Match and actual end-to-end finance execution still require code, SQL validation, sandbox tests, QBO credentials and authorization.
- Do not enable live financial posting. Deploying this release is not evidence that BAA is ready to go live.

## Test/deploy notes
Run `node --test consolidated-tests.js` and `npm run check` before deployment. Do not overwrite existing Render secrets. Existing Gmail functionality is unchanged.
