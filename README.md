# PAL platform foundation

Approved first slice. Login, two companies, roles, and module visibility only. No compressor processing.

## Open it

1. Open a terminal in this folder.
2. Run `node server.js`.
3. Open http://localhost:3000

No install step.

## Prototype sign-in

These passwords are for this demo only.

- PAL Admin: admin@pal.local / pal-admin
- Born Again Air manager: manager@bornagainair.local / manager
- Born Again Air employee: employee@bornagainair.local / employee
- Second test customer: manager@northwind.local / manager

Born Again Air sees Core Processing. Northwind sees Invoice Processing and does not see Core Processing. A customer user cannot open PAL Admin.
