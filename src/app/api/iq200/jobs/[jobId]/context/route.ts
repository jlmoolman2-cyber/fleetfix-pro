import { getIQ200JobContext } from "@/lib/iq200/service";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { resolveServerFirebaseProject } from "@/lib/firebaseEnvironment";

export function commissioningSurfaceAvailableFor(environment: Record<string, string | undefined> = process.env): boolean {
  if (environment.FLEETFIX_ENVIRONMENT !== "staging") return false;
  const trustedEnvironment: Record<string, string> = { FLEETFIX_ENVIRONMENT: "staging" };
  if (environment.GOOGLE_CLOUD_PROJECT?.trim()) trustedEnvironment.GOOGLE_CLOUD_PROJECT = environment.GOOGLE_CLOUD_PROJECT;
  if (environment.GCLOUD_PROJECT?.trim()) trustedEnvironment.GCLOUD_PROJECT = environment.GCLOUD_PROJECT;
  if (environment.FIREBASE_CONFIG !== undefined) {
    try {
      const parsed: unknown = JSON.parse(environment.FIREBASE_CONFIG);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
      const projectId = (parsed as Record<string, unknown>).projectId;
      if (typeof projectId === "string" && projectId.trim()) {
        trustedEnvironment.FIREBASE_CONFIG = JSON.stringify({ projectId });
      }
    } catch {
      return false;
    }
  }
  if (Object.keys(trustedEnvironment).length === 1) return false;
  try {
    return resolveServerFirebaseProject(trustedEnvironment) === "fleetfix-pro-staging";
  } catch {
    return false;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const context = await authenticateServerRequest(request);
    const jobContext = await getIQ200JobContext(context, (await params).jobId);
    return Response.json({ ...jobContext, commissioningSurfaceAvailable: commissioningSurfaceAvailableFor() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return safeServerErrorResponse(error);
  }
}
