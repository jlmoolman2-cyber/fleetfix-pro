import { authenticateServerRequest, safeServerErrorResponse } from "@/lib/serverAuth";
import { listKnowledgeDocuments, loadCompanyKnowledgeDocuments } from "@/lib/iq200/knowledgeListService";
import { effectivePermissions } from "@/lib/permissions";
import { stagingCommissioningAvailableFor } from "@/lib/iq200/stagingCommissioningGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    try {
        const context = await authenticateServerRequest(request);
        const result = await listKnowledgeDocuments(context, loadCompanyKnowledgeDocuments);
        const permissions = effectivePermissions(context.companyUser);
        const commissioningAvailable = stagingCommissioningAvailableFor()
            && context.companyUser.active !== false
            && permissions["Use IQ200 Technician Assist"] === true
            && permissions["View IQ200 Knowledge"] === true;
        return Response.json({ ...result, commissioningAvailable }, {
            headers: { "cache-control": "no-store" },
        });
    } catch (error) {
        const response = safeServerErrorResponse(error);
        response.headers.set("cache-control", "no-store");
        return response;
    }
}
