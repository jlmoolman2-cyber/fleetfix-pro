export type WhatsAppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "DUPLICATE"
  | "CONFIGURATION_ERROR"
  | "META_ERROR"
  | "SERVICE_WINDOW_CLOSED"
  | "INTERNAL_ERROR";

export class WhatsAppError extends Error {
  public readonly code: WhatsAppErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: WhatsAppErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WhatsAppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function safeErrorResponse(error: unknown): Response {
  if (error instanceof WhatsAppError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error("WhatsApp server request failed", error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "The WhatsApp request could not be completed." } },
    { status: 500 },
  );
}
