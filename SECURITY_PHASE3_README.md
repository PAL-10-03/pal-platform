# PAL Phase 3 — security hardening and Banker role package

Source: DND-PAL-10-30_0236.zip. This is a deployment candidate, not deployed or live-tested.

Changes:
- Removed temporary unauthenticated `/api/owner-diagnostic` endpoint.
- Required Clerk sign-in and company membership on both `/api/baa/reports/access` and `/api/newstart/reports/access`.
- Replaced legacy internal `reconciler` role with `banker` in job validation, dispatch, Reader classification and Grok instructions. `reporter` remains unchanged. No extra bot created.
- Fixed an undefined `tenant` variable in Born Again Air chart-of-accounts upload path (unrelated existing defect).

## IMPORTANT coordinated deployment
1. Keep automation disabled. Back up current GitHub/Render version and database.
2. During maintenance window, run `PAL_PHASE3_BANKER_ROLE.sql` in Supabase. If it errors, stop; do not deploy.
3. Immediately deploy this updated project ZIP to Render. Do not activate scheduler/Reader while database and backend versions differ.
4. Confirm /health, owner sign-in, tenant documents, manager PIN, and 401/403 cross-tenant access behavior with real authenticated sessions.
5. Verify server-only environment secrets and review all backend routes for tenant isolation before production financial automation.

Security scope: Static fixes and syntax checks only; no live Clerk/Supabase tests performed. RLS is enabled with no policies, but service-role access bypasses RLS; application authorization must be verified independently.
