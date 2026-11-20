# Newstart managed alerts — deployment

1. Run `PAL_NEWSTART_MANAGED_ALERTS.sql` in the existing Supabase project's SQL Editor. Required for persistence.
2. Upload the contents of this ZIP to the existing GitHub repository, commit, and deploy on Render.
3. Sign in as Newstart manager; open Document Uploads → Permanent Records → Alerts (Newstart Management). Add a title and date.
4. At 6:00 AM America/Chicago on that date, the alert appears under Dashboard → Alerts. It stays until Complete is clicked there.
5. Trash icon in Permanent Records deletes the alert after confirmation. Completed alerts remain in management history.

Only Newstart files/routes were modified: `newstart-operations.js`, `public/newstart-ops.js`, a Newstart-only hook in `public/app.js`, and appended CSS. No BAA routes or bots changed.

The alert display uses the server-provided records and America/Chicago time. It does not send push notifications or emails. The Dashboard refreshes when opened/reopened; an already open page must be refreshed to see newly due alerts.
