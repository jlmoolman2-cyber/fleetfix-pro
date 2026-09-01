# Company ID Security Review

FleetFix currently uses the constant in `src/lib/company.ts`, which resolves to `comp_001`. Several active modules also embed the same string directly, including jobs, inventory, GRV, purchase orders, stock adjustments, suppliers, and some duplicated legacy files under `src/lib/app`.

This is acceptable only while FleetFix is intentionally a single-company deployment. A browser-supplied company ID must never be trusted for:

- Firebase Admin API calls
- user or permission management
- password changes
- future IQ200 job context
- document retrieval or download
- search, embeddings, or AI requests
- audit queries
- cross-company reports

## Server-side strategy for IQ200

1. Verify the Firebase ID token server-side.
2. Resolve company membership from a trusted server-side membership record or token claim.
3. Reject inactive or missing membership.
4. Check the requested resource path belongs to that resolved company.
5. Treat a route/body/query `companyId` only as a requested scope and compare it to authorized membership; never use it directly as authority.
6. Pass an immutable `{ uid, companyId, permissions }` security context into IQ200 services.

Full dynamic multi-tenancy remains outside Phase 0.
