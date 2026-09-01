# WhatsApp phone indexing

Customer and contact forms maintain `normalizedPhoneNumbers`, an array of E.164-style values used by inbound conversation linking. Contacts also store `companyId`, allowing a tenant-constrained collection-group lookup. This replaces unbounded customer/contact scans.

Existing records can be reviewed with `npm run phones:backfill -- --company=<id>`. It is dry-run only unless `--apply` and `ALLOW_PHONE_BACKFILL=true` are both supplied. Review every proposed value before applying. This migration was added but was not run as part of Phase 3.

Development inbox data is available through `npm run seed:whatsapp:emulator`. The command refuses to run unless `FIRESTORE_EMULATOR_HOST` is set and the project ID starts with `demo-` or `emulator-`.
