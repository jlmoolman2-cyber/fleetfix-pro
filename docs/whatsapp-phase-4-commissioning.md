# WhatsApp Phase 4 commissioning gate

Phase 4 is inbound-only and non-production. Outbound sending is hard-disabled in code. No registration, subscription, deployment, secret creation, or production data update is performed by this work.

## Server configuration

Secret Manager references are fixed to `metaAppSecret`, `metaWhatsappAccessToken`, and `metaWebhookVerifyToken`; their runtime environment variables are `META_APP_SECRET`, `META_WHATSAPP_ACCESS_TOKEN`, and `META_WEBHOOK_VERIFY_TOKEN`. Secret values must never be stored in Firestore or exposed to the browser. Configure `WHATSAPP_WEBHOOK_PUBLIC_URL` only when an approved HTTPS deployment exists. Keep `WHATSAPP_ALLOW_META_READ_PROBE=false` except during an attended, read-only commissioning check.

The tenant `whatsappSettings/config` document must contain the enabled flag, Meta Business Account ID, WABA ID, Phone Number ID, E.164 display number, explicit supported Graph API version, default country code, and the three allow-listed secret references.

## Webhook registration readiness

The approved callback path is `/api/whatsapp/webhook`. Meta must be configured with the exact HTTPS URL and the matching verification token, and the app must subscribe to the WABA `messages` webhook field. Validate the GET challenge, then use a Meta test event before any live-number traffic. POST requests require `X-Hub-Signature-256`; invalid signatures are rejected. Confirm that Meta receives HTTP 200 promptly and that duplicate deliveries do not create duplicate messages.

## Coexistence stop gate

Do not use the standard API-only migration/registration flow for the existing WhatsApp Business App number. Eligibility for the specific number is currently **unconfirmed**. It must be checked in Meta's supported WhatsApp Business App onboarding/coexistence flow while an authorised business administrator is present. The flow must explicitly say that the Business App remains usable. Cancel immediately if it says the app account will be removed, disabled, migrated, or deregistered.

Before approval, record: Business Portfolio ID and verification state; app ID and app mode; WABA ID; Phone Number ID; number country and account age; Business App version; primary phone OS; linked-device count; two-step verification state; WABA restrictions/payment status; and whether Meta offers the coexistence option. After an approved read-only probe, `is_on_biz_app=true` is supporting evidence of active coexistence. Absence or failure of that field is not permission to migrate.

Back up the Business App chat history first. Screenshot every Meta warning and the coexistence confirmation screen. Reconfirm expected linked-device behavior in the actual flow because availability and limitations can differ by account and rollout.

## Controlled inbound validation

Use one authorised test handset/contact. Send, in order: text, image, PDF, audio, and one duplicate webhook replay. Confirm tenant resolution, conversation linking, unread count, message ordering, media state, Storage path, audit events, and the 24-hour `serviceWindowExpiresAt`. Do not reply from FleetFix. Confirm media downloads require an authenticated FleetFix user with `View conversations`.

Run `GET /api/whatsapp/diagnostics` as a user with `Manage WhatsApp settings`. Only after explicit commissioning approval may the temporary read-only probe flag be enabled and `?liveProbe=true` called. Return the flag to false immediately afterward.

## Durable media worker

Media webhook records create a deterministic `whatsappMediaJobs/{messageId}` job in the same transaction as the message. An authenticated scheduler invokes `POST /api/whatsapp/media-worker` with the `whatsappMediaWorkerSecret` bearer token. The worker leases one job, downloads and validates media, and records `stored`, `retryable`, or terminal `failed`. Expired processing leases are recoverable and deterministic storage paths prevent duplicate objects.

`WHATSAPP_MEDIA_RETENTION_DAYS=0` means retain indefinitely. Suggested later choices are 30, 90, 180, or 365 days depending on customer agreements and job-record requirements. No automatic deletion is implemented or enabled.

## Index verification—no deployment in Phase 4

1. Review `firestore.indexes.json` and `firebase.json`.
2. Run the Firebase emulator/rules suite; this validates local configuration parsing.
3. Compare the declared indexes with Firebase Console index requirements for the intended project.
4. Obtain explicit production deployment approval.
5. Only then run `npx -y firebase-tools@latest deploy --only firestore:indexes --project <approved-project-id>`.
6. Wait for every index to report `Enabled` before connecting traffic.

No index deployment command was run during Phase 4.

## Phone-index backfill plan

Export/backup affected customer and contact records, run the existing backfill without `--apply`, review invalid and shared numbers, sample known customers, and obtain written approval. Apply in small tenant-scoped batches only after production-data approval, then rerun dry-run expecting zero changes. Phase 4 validates the dry-run mechanism only; it does not update production.
