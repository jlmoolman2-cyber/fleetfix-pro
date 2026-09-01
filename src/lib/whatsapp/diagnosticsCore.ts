export function validMetaId(value: string): boolean { return /^\d{5,30}$/.test(value); }
export function validGraphVersion(value: string): boolean { return /^v\d{1,2}\.0$/.test(value); }

export function localConfigurationChecks(input: { enabled: boolean; businessId: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string; graphVersion: string; appSecret: boolean; accessToken: boolean; verifyToken: boolean; webhookUrl: string }) {
  return [
    ["settings-enabled", input.enabled, "WhatsApp settings document is enabled"],
    ["business-id", validMetaId(input.businessId), "Meta Business Account ID is present and numeric"],
    ["waba-id", validMetaId(input.wabaId), "WhatsApp Business Account ID is present and numeric"],
    ["phone-number-id", validMetaId(input.phoneNumberId), "Phone Number ID is present and numeric"],
    ["display-number", /^\+\d{8,15}$/.test(input.displayPhoneNumber.replace(/\s/g, "")), "Display number is E.164-like"],
    ["graph-version", validGraphVersion(input.graphVersion), "Graph API version is explicit"],
    ["app-secret", input.appSecret, "App secret is available server-side"],
    ["access-token", input.accessToken, "Access token is available server-side"],
    ["verify-token", input.verifyToken, "Webhook verification token is available server-side"],
    ["webhook-url", /^https:\/\//.test(input.webhookUrl), "Public webhook URL uses HTTPS"],
    ["outbound-disabled", true, "Outbound WhatsApp sending is hard-disabled in Phase 4"],
  ].map(([id, passed, description]) => ({ id: String(id), passed: Boolean(passed), description: String(description) }));
}
