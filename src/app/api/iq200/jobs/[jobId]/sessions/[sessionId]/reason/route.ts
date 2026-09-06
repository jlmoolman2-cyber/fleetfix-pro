import { reasonAboutIQ200Session } from "@/lib/iq200/reasoningService";
import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";

export async function POST(request:Request,{params}:{params:Promise<{jobId:string;sessionId:string}>}){try{const context=await authenticateServerRequest(request);const{jobId,sessionId}=await params;return Response.json(await reasonAboutIQ200Session(context,jobId,sessionId,await request.json()),{headers:{"cache-control":"no-store"}})}catch(error){return safeServerErrorResponse(error)}}
