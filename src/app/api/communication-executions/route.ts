import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { listCommunicationExecutions, prepareCommunicationExecution } from "@/lib/communicationExecutions/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return Response.json(await listCommunicationExecutions(await authenticateServerRequest(request)), { headers: { "cache-control": "no-store" } }); } catch (error) { return safeErrorResponse(error); } }
export async function POST(request: Request) { try { const context = await authenticateServerRequest(request); const body = await request.json(); return Response.json(await prepareCommunicationExecution(context, body, body?.dryRun === true), { status: body?.dryRun === true ? 200 : 201 }); } catch (error) { return safeErrorResponse(error); } }
