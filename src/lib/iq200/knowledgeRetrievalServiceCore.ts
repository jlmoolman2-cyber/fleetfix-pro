import { ServerAccessError } from "../serverAuthCore.ts";
import { effectivePermissions } from "../permissions.ts";
import { canUseIQ200 } from "./permissions.ts";
import { retrieveKnowledgePages, validateRetrievalCandidate, validateRetrievalCitation } from "./knowledgeRetrievalCore.ts";
import { MAX_CANDIDATE_DOCUMENTS, MAX_CANDIDATE_PAGES, type RetrievalCandidate, type RetrievalDocument, type RetrievalPage, type RetrievalQuery, type RetrievalResult } from "./knowledgeRetrievalContracts.ts";

export const PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES = 16 * 1024 * 1024;
export const IMAGE_HEADERS = { "content-type": "image/png", "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const REFERENCE = /^TECHNICAL_DOCUMENT_[a-f0-9]{64}$/;
export interface KnowledgeAccessContext { companyId: string; companyUser: unknown }
export interface SearchInput { question: string; cursor?: string }
export interface PageInput extends SearchInput { evidenceReference: string }
export interface ServicePage extends RetrievalPage { imageStorageRef: string; imageWidth?: number; imageHeight?: number }
export interface AssetMetadata { size: number; contentType: string; generation: string }
export interface KnowledgeReadDependencies {
  authorizeJob(context: KnowledgeAccessContext, jobId: string): Promise<RetrievalQuery>;
  documents(companyId: string, cursor: string | undefined, limit: number): Promise<RetrievalDocument[]>;
  pages(companyId: string, documentId: string, limit: number): Promise<ServicePage[]>;
  currentPage(companyId: string, documentId: string, pageId: string): Promise<{ document: RetrievalDocument; page: ServicePage } | null>;
  assetMetadata(path: string): Promise<AssetMetadata | null>;
  imageBytes(path: string, generation: string, maximum: number): Promise<Uint8Array>;
}
export type KnowledgeSearchDependencies = Pick<KnowledgeReadDependencies, "documents" | "pages">;
export interface KnowledgeSearchResponse extends RetrievalResult { continuationCursor: string | null }
function invalid(): never { throw new ServerAccessError("INVALID_INPUT", "Technical knowledge request is invalid.", 400); }
function unavailable(): never { throw new ServerAccessError("NOT_FOUND", "Supporting technical evidence is unavailable.", 404); }
export function safeKnowledgeId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) invalid();
  return value;
}
export function parseKnowledgeInput(value: unknown, page = false): SearchInput | PageInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const body = value as Record<string, unknown>;
  const allowed = page ? ["question", "cursor", "evidenceReference"] : ["question", "cursor"];
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid();
  if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000) invalid();
  const question = body.question.trim().replace(/\s+/g, " ");
  const cursor = body.cursor === undefined ? undefined : safeKnowledgeId(body.cursor);
  if (page && (typeof body.evidenceReference !== "string" || !REFERENCE.test(body.evidenceReference))) invalid();
  return page ? { question, ...(cursor ? { cursor } : {}), evidenceReference: body.evidenceReference as string } : { question, ...(cursor ? { cursor } : {}) };
}
function authorizeContext(context: KnowledgeAccessContext): void {
  safeKnowledgeId(context.companyId);
  if (!context.companyUser || typeof context.companyUser !== "object" || (context.companyUser as { active?: boolean }).active === false || !canUseIQ200(context.companyUser)) {
    throw new ServerAccessError("FORBIDDEN", "IQ200 Technician Assist access is required.", 403);
  }
}
function authorizeCommissioningContext(context: KnowledgeAccessContext): void {
  safeKnowledgeId(context.companyId);
  if (!context.companyUser || typeof context.companyUser !== "object" || (context.companyUser as { active?: boolean }).active === false) {
    throw new ServerAccessError("FORBIDDEN", "An active company membership is required.", 403);
  }
  const permissions = effectivePermissions(context.companyUser);
  if (permissions["Use IQ200 Technician Assist"] !== true || permissions["View IQ200 Knowledge"] !== true) {
    throw new ServerAccessError("FORBIDDEN", "IQ200 Knowledge commissioning access is required.", 403);
  }
}
async function searchKnowledgePages(companyId: string, parsed: SearchInput, query: RetrievalQuery, deps: KnowledgeSearchDependencies): Promise<KnowledgeSearchResponse> {
  const window = await deps.documents(companyId, parsed.cursor, MAX_CANDIDATE_DOCUMENTS + 1);
  if (window.length > MAX_CANDIDATE_DOCUMENTS + 1) throw new ServerAccessError("INTERNAL", "Technical knowledge read bound exceeded.", 500);
  let previous = parsed.cursor || "";
  for (const document of window) {
    safeKnowledgeId(document.documentId);
    if (document.companyId !== companyId || document.documentId <= previous) unavailable();
    previous = document.documentId;
  }
  const docs = window.slice(0, MAX_CANDIDATE_DOCUMENTS);
  let limited = window.length > MAX_CANDIDATE_DOCUMENTS;
  const candidates: RetrievalCandidate[] = [];
  let remaining = MAX_CANDIDATE_PAGES;
  for (const document of docs) {
    if (document.processingStatus !== "READY" || document.approvalStatus !== "APPROVED") continue;
    if (!remaining) { limited = true; break; }
    const pages = await deps.pages(companyId, document.documentId, remaining + 1);
    if (pages.length > remaining + 1) throw new ServerAccessError("INTERNAL", "Technical knowledge read bound exceeded.", 500);
    if (pages.length > remaining) limited = true;
    candidates.push(...pages.slice(0, remaining).map(page => ({ document, page })));
    remaining -= Math.min(pages.length, remaining);
  }
  const result = retrieveKnowledgePages(companyId, candidates, query, limited);
  // B3 counts documents represented by pages; B4 also reports scanned ineligible/empty documents.
  result.coverage.candidateDocumentsConsidered = docs.length;
  return { ...result, continuationCursor: window.length > MAX_CANDIDATE_DOCUMENTS ? docs.at(-1)!.documentId : null };
}
export async function searchTechnicalKnowledge(context: KnowledgeAccessContext, jobId: string, input: unknown, deps: KnowledgeReadDependencies): Promise<KnowledgeSearchResponse> {
  authorizeContext(context); safeKnowledgeId(jobId);
  const parsed = parseKnowledgeInput(input);
  const jobQuery = await deps.authorizeJob(context, jobId);
  return searchKnowledgePages(context.companyId, parsed, { ...jobQuery, question: parsed.question }, deps);
}
export async function searchCommissioningKnowledge(context: KnowledgeAccessContext, input: unknown, deps: KnowledgeSearchDependencies): Promise<KnowledgeSearchResponse> {
  authorizeCommissioningContext(context);
  const parsed = parseKnowledgeInput(input);
  return searchKnowledgePages(context.companyId, parsed, { question: parsed.question }, deps);
}
export function ownedPageAssetPath(companyId: string, candidate: { document: RetrievalDocument; page: ServicePage }): string {
  const d = candidate.document, p = candidate.page;
  const expected = `companies/${companyId}/iq200/documents/${d.documentId}/processing/${p.processingAttemptId}/${p.processingInvocationId}/pages/${p.pageId}.png`;
  if (p.imageStorageRef !== expected) unavailable();
  return expected;
}
export function validateProtectedPngMetadata(metadata: AssetMetadata | null): AssetMetadata {
  if (!metadata || metadata.contentType !== "image/png" || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || typeof metadata.generation !== "string" || !/^\d+$/.test(metadata.generation)) unavailable();
  if (metadata.size > PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES) throw new ServerAccessError("IMAGE_TOO_LARGE", "Supporting page exceeds the protected delivery limit.", 413);
  return metadata;
}
async function resolveCurrentPage(context: KnowledgeAccessContext, jobId: string | null, documentId: string, pageId: string, input: unknown, deps: KnowledgeReadDependencies) {
  safeKnowledgeId(documentId); safeKnowledgeId(pageId);
  const parsed = parseKnowledgeInput(input, true) as PageInput;
  const { evidenceReference, ...searchInput } = parsed;
  const result = jobId === null
    ? await searchCommissioningKnowledge(context, searchInput, deps)
    : await searchTechnicalKnowledge(context, jobId, searchInput, deps);
  const citation = result.results.find(entry => entry.citation.documentId === documentId && entry.citation.pageId === pageId && entry.citation.evidenceReference === evidenceReference)?.citation;
  if (!citation) unavailable();
  const current = await deps.currentPage(context.companyId, documentId, pageId);
  if (!current || current.document.documentId !== documentId || current.page.pageId !== pageId || !validateRetrievalCandidate(context.companyId, current)) unavailable();
  const query = jobId === null
    ? { question: parsed.question }
    : { ...await deps.authorizeJob(context, jobId), question: parsed.question };
  if (!validateRetrievalCitation(context.companyId, current, query, citation)) unavailable();
  for (const dimension of [current.page.imageWidth, current.page.imageHeight]) {
    if (dimension !== undefined && (!Number.isSafeInteger(dimension) || dimension <= 0 || dimension > 10000)) unavailable();
  }
  if (current.page.imageWidth !== undefined && current.page.imageHeight !== undefined && current.page.imageWidth * current.page.imageHeight > 50000000) unavailable();
  const path = ownedPageAssetPath(context.companyId, current);
  return { citation, page: current.page, path };
}
export async function resolveTechnicalPage(context: KnowledgeAccessContext, jobId: string, documentId: string, pageId: string, input: unknown, deps: KnowledgeReadDependencies) {
  const resolved = await resolveCurrentPage(context, jobId, documentId, pageId, input, deps);
  validateProtectedPngMetadata(await deps.assetMetadata(resolved.path));
  return { citation: resolved.citation, imageWidth: resolved.page.imageWidth ?? null, imageHeight: resolved.page.imageHeight ?? null };
}
export async function resolveCommissioningPage(context: KnowledgeAccessContext, documentId: string, pageId: string, input: unknown, deps: KnowledgeReadDependencies) {
  const resolved = await resolveCurrentPage(context, null, documentId, pageId, input, deps);
  validateProtectedPngMetadata(await deps.assetMetadata(resolved.path));
  return { citation: resolved.citation, imageWidth: resolved.page.imageWidth ?? null, imageHeight: resolved.page.imageHeight ?? null };
}
export function validatePngBody(bytes: Uint8Array, metadata: AssetMetadata, page: ServicePage): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength !== metadata.size || bytes.byteLength > PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES || bytes.length < 33 || signature.some((b, i) => bytes[i] !== b)) unavailable();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") unavailable();
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 10000 || height > 10000 || width * height > 50000000) unavailable();
  if ((page.imageWidth !== undefined && page.imageWidth !== width) || (page.imageHeight !== undefined && page.imageHeight !== height)) unavailable();
}
export async function resolveTechnicalImage(context: KnowledgeAccessContext, jobId: string, documentId: string, pageId: string, input: unknown, deps: KnowledgeReadDependencies): Promise<Response> {
  const resolved = await resolveCurrentPage(context, jobId, documentId, pageId, input, deps);
  const metadata = validateProtectedPngMetadata(await deps.assetMetadata(resolved.path));
  const bytes = await deps.imageBytes(resolved.path, metadata.generation, PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES);
  validatePngBody(bytes, metadata, resolved.page);
  return new Response(new Uint8Array(bytes).buffer, { headers: IMAGE_HEADERS });
}
export async function resolveCommissioningImage(context: KnowledgeAccessContext, documentId: string, pageId: string, input: unknown, deps: KnowledgeReadDependencies): Promise<Response> {
  const resolved = await resolveCurrentPage(context, null, documentId, pageId, input, deps);
  const metadata = validateProtectedPngMetadata(await deps.assetMetadata(resolved.path));
  const bytes = await deps.imageBytes(resolved.path, metadata.generation, PROTECTED_IMAGE_MAX_ENCODED_PNG_BYTES);
  validatePngBody(bytes, metadata, resolved.page);
  return new Response(new Uint8Array(bytes).buffer, { headers: IMAGE_HEADERS });
}
export type KnowledgeOperation = "search" | "page" | "image";
export async function handleKnowledgeRequest(request: Request, params: { jobId: string; documentId?: string; pageId?: string }, operation: KnowledgeOperation, authenticate: (request: Request) => Promise<KnowledgeAccessContext>, dependencies: (context: KnowledgeAccessContext) => KnowledgeReadDependencies, errorResponse: (error: unknown) => Response): Promise<Response> {
  try {
    const context = await authenticate(request);
    // A bounded JSON body prevents unbounded parsing before schema validation.
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16384)) invalid();
    const reader = request.body?.getReader(); let length = 0; const chunks: Uint8Array[] = [];
    if (!reader) invalid();
    try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 16384) invalid(); chunks.push(value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input: unknown; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { invalid(); }
    const deps = dependencies(context);
    if (operation === "image") return await resolveTechnicalImage(context, params.jobId, safeKnowledgeId(params.documentId), safeKnowledgeId(params.pageId), input, deps);
    const result = operation === "search" ? await searchTechnicalKnowledge(context, params.jobId, input, deps) : await resolveTechnicalPage(context, params.jobId, safeKnowledgeId(params.documentId), safeKnowledgeId(params.pageId), input, deps);
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function handleCommissioningKnowledgeRequest(
  request: Request,
  params: { documentId?: string; pageId?: string },
  operation: KnowledgeOperation,
  authenticate: (request: Request) => Promise<KnowledgeAccessContext>,
  dependencies: (context: KnowledgeAccessContext) => KnowledgeReadDependencies,
  errorResponse: (error: unknown) => Response,
): Promise<Response> {
  try {
    const context = await authenticate(request);
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16384)) invalid();
    const reader = request.body?.getReader(); let length = 0; const chunks: Uint8Array[] = [];
    if (!reader) invalid();
    try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 16384) invalid(); chunks.push(value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input: unknown; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { invalid(); }
    const deps = dependencies(context);
    if (operation === "search") {
      return Response.json(await searchCommissioningKnowledge(context, input, deps), { headers: { "cache-control": "private, no-store" } });
    }
    const documentId = safeKnowledgeId(params.documentId);
    const pageId = safeKnowledgeId(params.pageId);
    const result = operation === "image"
      ? await resolveCommissioningImage(context, documentId, pageId, input, deps)
      : Response.json(await resolveCommissioningPage(context, documentId, pageId, input, deps), { headers: { "cache-control": "private, no-store" } });
    return result;
  } catch (error) { return errorResponse(error); }
}
