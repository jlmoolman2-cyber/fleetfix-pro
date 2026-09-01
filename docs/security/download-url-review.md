# Persistent Firebase Download URL Review

The following modules call `getDownloadURL()` and persist or display token-bearing Firebase Storage URLs:

- `src/app/jobs/[id]/attachments/page.tsx` — job attachments
- `src/app/jobs/[id]/photos/page.tsx` — job photo albums
- `src/app/inventory/new/page.tsx` — new inventory images
- `src/app/inventory/[id]/page.tsx` — inventory images
- `src/app/purchase-orders/page.tsx` — purchase-order attachments
- `src/app/queries/new/page.tsx` — query attachments
- `src/app/messages/compose/page.tsx` — message attachments

## Security implications

Firebase download URLs contain a long-lived download token. Possession of the URL may allow access without re-evaluating FleetFix page permissions. Firestore and Storage membership rules reduce discovery and direct SDK access, but cannot retract a URL already copied outside the application unless the token is rotated or the object is removed.

## Recommended migration order

1. Purchase-order, query, message, and job attachments.
2. Customer-facing or personally identifiable job photographs.
3. Inventory photographs, where the sensitivity is lower.

Later protected delivery should store `storagePath`, not a permanent public URL, and stream or redirect through an authenticated server route after checking company membership and the appropriate module permission. IQ200 proprietary documents must use that protected model from their first implementation.
