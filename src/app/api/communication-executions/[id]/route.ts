import { authenticateServerRequest } from "@/lib/whatsapp/auth";
import { safeErrorResponse } from "@/lib/whatsapp/errors";
import { cancelCommunicationExecution, getCommunicationExecution } from "@/lib/communicationExecutions/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { return Response.json(await getCommunicationExecution(await authenticateServerRequest(request), (await params).id), { headers: { "cache-control": "no-store" } }); } catch (error) { return safeErrorResponse(error); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const auth = await authenticateServerRequest(request); const body = await request.json(); if (body?.action !== "cancel") return Response.json({ error: { message: "Only cancellation is supported." } }, { status: 400 }); return Response.json(await cancelCommunicationExecution(auth, (await params).id)); } catch (error) { return safeErrorResponse(error); } }
