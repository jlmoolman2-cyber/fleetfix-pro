# WhatsApp Phase 1 foundation

Phase 1 adds server-only authentication, tenant resolution, permission checks,
phone validation, webhook verification, idempotency, rate-limit and audit
frameworks. It does not send messages or process conversation content.

## Runtime secrets

Create these with Firebase App Hosting secret management; never prefix them
with `NEXT_PUBLIC_` and never store their values in Firestore:

- `META_APP_SECRET`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WEBHOOK_VERIFY_TOKEN`

Non-secret runtime configuration:

- `META_WHATSAPP_PHONE_NUMBER_ID` (not needed until outbound sending is enabled)
- `META_GRAPH_API_VERSION`

For webhook tenant resolution, an enabled server-managed document at
`companies/{companyId}/whatsappSettings/config` must eventually contain its
unique `phoneNumberId`. Phase 1 does not create this document or modify data.

## Existing hard-coded tenant debt

The existing application still imports `COMPANY_ID` (`comp_001`) across client
pages, components, Firebase rules compatibility code, jobs, customers,
communications, notifications, inventory, purchasing and administration.
Phase 1 deliberately does not migrate those areas. All new modules under
`src/lib/whatsapp` resolve company membership or webhook phone-number ownership
server-side and do not import that constant.

## Phase 2 server-managed collections

The Admin SDK now manages `whatsappConversations`, `whatsappMessages`,
`whatsappWebhookEvents`, `whatsappDeliveryStatuses`, `whatsappSendRequests`,
`whatsappRateLimits`, `whatsappAuditLog`, and `whatsappSettings`. Browser writes
to these collections are denied by Firestore rules.

Rate-limit documents contain an `expiresAt` timestamp. Configure a Firestore
TTL policy specifically on the collection group `whatsappRateLimits` and field
`expiresAt`. Do not configure TTL on conversations, messages, audits, delivery
statuses, send requests, settings, or webhook receipts. TTL activation is an
explicit infrastructure operation and was not performed in development or
production by this phase.
