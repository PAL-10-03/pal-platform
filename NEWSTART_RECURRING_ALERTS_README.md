# Newstart Alerts — deployment instructions

1. Open Supabase SQL Editor for the SAME project used by the deployed PAL application.
2. Run `PAL_NEWSTART_MANAGED_ALERTS.sql` in its entirety. This creates or upgrades Newstart-only alert storage.
3. Deploy this full application ZIP to GitHub / Render.
4. Sign in as a Newstart manager or PAL owner. In Newstart Permanent Records > Alerts, create a One Time, Weekly, or Monthly alert.
5. Test with today's date after 6 AM Central, then mark Complete on the dashboard. A recurring alert advances to its next scheduled occurrence, and a one-time alert stays completed.

If Add Alert fails, check the message displayed beneath the form and Render logs. Database writes are NOT performed in the browser. The server accesses `pal_ns_managed_alerts` with `tenant=eq.newstart` and checks Newstart membership.

Existing other Newstart data uses separate `pal_ns_*` tables. BAA routes and automation files were not edited. This is a code review, not a live security audit.
