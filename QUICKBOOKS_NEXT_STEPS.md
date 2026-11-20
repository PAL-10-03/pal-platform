# PAL QuickBooks connection page preparation

Added authenticated routes:
- `/quickbooks/connect`
- `/quickbooks/disconnect`

These routes **do not yet connect or disconnect QuickBooks**. They require a signed-in PAL owner or BAA manager and explicitly display that OAuth is not yet enabled. No QBO requests, tokens, or accounting writes were added. Newstart members cannot access them.

Do not submit these as fully operational production connect/disconnect workflows yet. Next implement and verify Intuit OAuth authorization and callback, encrypted tenant-specific credential storage, authorization state/CSRF validation, refresh/revocation, and management UI. Test cross-tenant isolation and read-only backend behavior before authorizing BAA production access.

Existing PAL routes, Clerk authentication, legal pages, bots, and website assets otherwise unchanged.
