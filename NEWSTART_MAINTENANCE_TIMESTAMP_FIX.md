Newstart-only maintenance and state-report correction.

Root cause: The generic PATCH /maintenance/:id route was registered before the dedicated maintenance route. It accepted status changes but did not set completed_at. The generic route is now skipped for maintenance; the dedicated route sets the completion timestamp on transition to Complete, retains it on subsequent saves, and clears it when reopened.

Previously completed jobs whose completed_at is NULL cannot have their actual completion time reconstructed. They remain visible in the state report with a dash instead of a fabricated time. To capture a real completion timestamp for an old test job, reopen it and then mark Complete again, which records the new completion time, not the historical one.

State Reports now offer Start Current Report when no open period exists; this initializes a period without ending an inspection and uses the oldest existing maintenance record date for initial historical inclusion. End Report remains manual, for unpredictable inspections. Existing closed reports are preserved. No SQL changes required.

No BAA-specific files or bot files were modified. Shared files from the source ZIP remain unchanged. Syntax checks and existing consolidated-tests.js (5/5) passed. Live database and Clerk checks are not performed here.
