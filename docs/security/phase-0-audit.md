# FleetFix Phase 0 Security Audit

## Scope

This audit covers the existing FleetFix foundation only. It does not add IQ200 collections, pages, AI services, document ingestion, or vector search.

## Firestore access map

FleetFix stores most operational data below `companies/{companyId}`. Active company members currently require access to jobs and their subcollections, customers and fleet records, vehicles, job locations, inventory and stock records, suppliers, quotes, invoices, purchase orders, queries, communications, notifications, forms, tasks, timers, photos, and attachments.

Administrative configuration includes statuses, job types, job forms, reason/instruction fields, terms, message templates, document settings, inventory settings, job-card output settings, photo templates, workflow, and company rates. These writes are restricted by the repository rules to privileged roles or the corresponding stored administrative permission.

The legacy root `users/{uid}` directory is still read by many client screens. It remains authenticated-readable for compatibility. Writes are restricted to authorised `comp_001` user administrators, except a small self-service field allowlist.

## Current compatibility boundary

Operational company collections allow writes by active company members because the existing UI performs many workflows directly in browser clients and role defaults are not guaranteed to be persisted on every legacy user document. Tightening every operational collection to a granular permission in one deployment could lock existing users out.

This is an intentional interim control, not the final authorization model. The safe follow-up is to migrate each business workflow behind a server authorization service or add tested collection-specific rules after verifying every production user has complete permission data.

## Administrative credential

The previous source-tree service account is no longer loaded or present under `src/lib`. Firebase Admin now uses Application Default Credentials from the App Hosting/Cloud Run runtime service account.

The owner must manually revoke service-account key ID `7ce07e781af11dfc41bc3e42cd209fcc226a863c` for service account `firebase-adminsdk-fbsvc@fleetfix-pro.iam.gserviceaccount.com`. No private-key material is recorded here.

## Firestore indexes

The audited source queries shown in this checkout primarily use single-field `where` or `orderBy` clauses, which use automatic Firestore indexes. The currently deployed composite indexes could not be retrieved from local source, and replacing them with an inferred empty index file could propose deletion of remote indexes. Therefore Phase 0 deliberately does not add a `firestore.indexes.json` file. Export the deployed index configuration before bringing indexes under repository management.

## Deployment safety

Rules were added to `firebase.json` but were not deployed. Before production deployment:

1. Verify every active FleetFix user has `companies/comp_001/users/{uid}` with `active != false`.
2. Export and review the currently deployed Firestore and Storage rules.
3. Test production-shaped seed data in the Emulator Suite.
4. Deploy rules in a controlled maintenance window with rollback copies.
5. Smoke-test login, jobs, job status, photos, attachments, inventory, invoices, purchases, notifications, and administration.
