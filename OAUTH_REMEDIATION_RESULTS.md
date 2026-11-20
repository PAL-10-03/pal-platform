# PAL QuickBooks OAuth remediation — 2026-11-02

Full application release, based on PAL_Intuit_Security_Full_Release_2026-11-02.zip.

## Implemented
- Retry transient HTTP 429 and 5xx and network failures with bounded backoff (maximum three attempts).
- Refresh access tokens before expiry and once on a 401 response from the read-only accounting endpoint.
- Detect expired refresh tokens and `invalid_grant` and return a reconnect instruction to the authorized BAA manager.
- Do not retry permanent token authorization failures.
- Preserve tenant authorization, encrypted token storage, callback state validation, and read-only accounting test.

## Verification
- `node security-smoke-test.js`: 19 passed, 0 failed, **mocked** (including 401 refresh/retry and invalid_grant reconnect).
- `node --check` across application JavaScript: passed.
- Not tested against a real Intuit sandbox or production company. No real connect/disconnect/reconnect cycle occurred.
- Intuit OAuth discovery document is not used by this release; endpoints remain explicit constants.
- Real authorization and production environment configuration remain unverified.

## Questionnaire guidance
1. End-to-end sandbox test: NO (not performed).
2. Refresh frequency: when access token has <2 minutes left, or on a 401 response during a read-only test.
3. Failed authorization/authentication retries: YES for transient network/429/5xx errors; NO for permanent 4xx authorization failures (intentional).
4. Reconnect prompt: YES for detected invalid_grant/expired refresh/unauthorized read-only API response; needs live confirmation.
5. Discovery document: NO.
6a. Expired access token: YES in code, simulated.
6b. Expired refresh token: YES in code, simulated error handling; no real Intuit test.
6c. Invalid grant: YES in code, simulated.
6d. CSRF: YES in code, simulated.
7. OAuth Playground reliance: NO.

This package is not an Intuit certification and does not justify representing that real end-to-end testing has occurred.
