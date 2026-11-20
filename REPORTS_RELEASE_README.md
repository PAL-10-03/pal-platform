# Shared Reports Tab — Born Again Air and Newstart

This package adds tenant-separated private PDF report archives to the existing BAA and Newstart Reports tabs. Both have View, Download and Delete, protected by the existing Clerk manager/owner role and each tenant's existing manager PIN. The original BAA routes and CEO check-in are unchanged.

## Setup

Use the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), `PAL_SUPABASE_BUCKET`, `PAL_BAA_MANAGER_PIN`, and `PAL_NEWSTART_MANAGER_PIN`. Storage bucket must be **private**. Set a new high-entropy `PAL_REPORT_INGEST_TOKEN` environment variable in Render for future server-to-server PDF publication. Never put this token in the browser, a bot prompt, or a customer-facing setting.

## Server-to-server publication

Trusted PAL backend workers can POST a PDF to `/api/internal/reports/baa` or `/api/internal/reports/newstart`, using `Content-Type: application/pdf`, `x-pal-report-token`, `x-pal-report-name`, and `x-pal-report-period`. The PDF and metadata are stored separately under `born-again-air/reports/` and `newstart/reports/` in the private bucket.

## Limits / not yet connected

This implements the portal and private archive API, **not** the end-to-end report generator or automatic Gmail PDF attachment delivery. Those integrations require further code. No Newstart bot is activated. Do not assume this ZIP is the final BAA accounting automation release; its prior accounting integration gaps remain.
