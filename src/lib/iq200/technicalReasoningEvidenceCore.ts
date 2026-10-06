import type { RetrievalCitation, TechnicalRetrievalEvidence } from "./knowledgeRetrievalContracts.ts";
import { MAX_EXCERPT_LENGTH, MAX_REASONING_EVIDENCE_LENGTH, MAX_RETURNED_PAGES } from "./knowledgeRetrievalContracts.ts";
import { buildKnowledgePageId } from "./knowledgePageProcessingCore.ts";
import { ProviderValidationError, REASONING_ARRAY_MAX, validateReasoningQuestion, type ReasoningEvidence, type ReasoningResponse } from "./reasoningCore.ts";

export const TECHNICAL_LIMITATIONS = {
  bounded: "Technical knowledge retrieval is bounded and is not an exhaustive review of the library or manual.",
  coverage: "Technical knowledge coverage was limited by retrieval bounds.",
  omitted: "Some retrieved technical evidence was omitted to satisfy the reasoning input limit.",
  zero: "No eligible technical pages were retrieved for this request.",
  uncited: "This response does not cite technical-document evidence.",
} as const;
export interface TechnicalCitationAdjunct {
  technicalCitations?: RetrievalCitation[];
  technicalRetrievalContext?: { question: string };
}
const REF = /^TECHNICAL_DOCUMENT_[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
function invalid(): never { throw new ProviderValidationError("EVIDENCE_UNKNOWN"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function safeString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum) invalid();
  return value;
}
export function validateTechnicalCitation(value: unknown): RetrievalCitation {
  const c = record(value);
  const keys = ["evidenceReference","documentId","documentTitle","documentContentHash","pageId","pageIndex","displayPageNumber","textContentHash","originalFilename","processingAttemptId","processingInvocationId","excerpt","relevanceReasons","supportingPageReference","evidenceCategory"];
  if (Object.keys(c).length !== keys.length || Object.keys(c).some(k => !keys.includes(k))) invalid();
  for (const k of ["documentId","processingAttemptId","processingInvocationId"]) if (!ID.test(safeString(c[k],128))) invalid();
  for (const k of ["documentContentHash","textContentHash"]) if (!HASH.test(safeString(c[k],64))) invalid();
  if (!REF.test(safeString(c.evidenceReference,100)) || c.evidenceCategory !== "TECHNICAL_DOCUMENT") invalid();
  if (typeof c.pageIndex !== "number" || !Number.isSafeInteger(c.pageIndex) || c.pageIndex < 0 || c.pageIndex >= 2000) invalid();
  if (c.pageId !== buildKnowledgePageId(c.pageIndex) || c.displayPageNumber !== String(c.pageIndex+1)) invalid();
  safeString(c.documentTitle,300); safeString(c.originalFilename,120); safeString(c.excerpt,MAX_EXCERPT_LENGTH);
  if (!Array.isArray(c.relevanceReasons) || c.relevanceReasons.length > 6 || c.relevanceReasons.some(r => typeof r !== "string" || !/^[A-Z_]+:\d+$/.test(r))) invalid();
  const page = record(c.supportingPageReference);
  if (Object.keys(page).length !== 2 || page.documentId !== c.documentId || page.pageId !== c.pageId) invalid();
  return c as unknown as RetrievalCitation;
}
export function validateTechnicalEvidence(evidence: ReasoningEvidence): void {
  if (evidence.technicalDocuments === undefined) {
    if (evidence.technicalRetrievalCoverage !== undefined || evidence.technicalEvidenceOmitted !== undefined) invalid();
    return;
  }
  const documents = evidence.technicalDocuments;
  if (!Array.isArray(documents) || documents.length > MAX_RETURNED_PAGES) invalid();
  const refs = new Set<string>(); let characters = 0;
  for (const item of documents) {
    if (!item || Object.keys(item).some(k => !["category","reference","excerpt","citation"].includes(k))) invalid();
    const citation = validateTechnicalCitation(item.citation);
    if (item.category !== "TECHNICAL_DOCUMENT" || item.reference !== citation.evidenceReference || item.excerpt !== citation.excerpt || refs.has(item.reference)) invalid();
    refs.add(item.reference); characters += item.excerpt.length;
  }
  if (characters > MAX_REASONING_EVIDENCE_LENGTH) invalid();
  const coverage = evidence.technicalRetrievalCoverage;
  if (!coverage || typeof coverage.coverageLimited !== "boolean" || typeof coverage.truncated !== "boolean") invalid();
  for (const k of ["candidateDocumentsConsidered","candidatePagesConsidered","resultsReturned","invalidCandidates","emptyTextPages","reasoningEvidenceLength"] as const) {
    if (!Number.isSafeInteger(coverage[k]) || coverage[k] < 0) invalid();
  }
  if (coverage.candidateDocumentsConsidered > 50 || coverage.candidatePagesConsidered > 200 || coverage.resultsReturned > 5 || coverage.reasoningEvidenceLength > 6000) invalid();
}
export function usedTechnicalReferences(response: ReasoningResponse): Set<string> {
  const all = [...response.evidenceUsed.map(e => e.reference), ...response.hypotheses.flatMap(h => h.evidenceReferences), ...response.checks.map(c => c.evidenceSource)];
  return new Set(all.filter(reference => reference.startsWith("TECHNICAL_DOCUMENT_")));
}
export function reconstructTechnicalCitations(evidence: ReasoningEvidence, response: ReasoningResponse): RetrievalCitation[] {
  validateTechnicalEvidence(evidence);
  const used = usedTechnicalReferences(response);
  const supplied = evidence.technicalDocuments || [];
  if ([...used].some(reference => !supplied.some(item => item.reference === reference))) invalid();
  return supplied.filter(item => used.has(item.reference)).map(item => structuredClone(item.citation));
}
export function technicalAdjunct(evidence: ReasoningEvidence, response: ReasoningResponse): TechnicalCitationAdjunct {
  const citations = reconstructTechnicalCitations(evidence,response);
  return evidence.technicalDocuments === undefined ? {} : {technicalCitations:citations,technicalRetrievalContext:{question:evidence.question}};
}
export function addTechnicalLimitations(response: ReasoningResponse, evidence: ReasoningEvidence): ReasoningResponse {
  if (evidence.technicalDocuments === undefined) return response;
  const required: string[] = [TECHNICAL_LIMITATIONS.bounded];
  if (evidence.technicalRetrievalCoverage?.coverageLimited) required.push(TECHNICAL_LIMITATIONS.coverage);
  if (evidence.technicalEvidenceOmitted) required.push(TECHNICAL_LIMITATIONS.omitted);
  if (evidence.technicalRetrievalCoverage?.resultsReturned === 0) required.push(TECHNICAL_LIMITATIONS.zero);
  if (!usedTechnicalReferences(response).size) required.push(TECHNICAL_LIMITATIONS.uncited);
  return {...response,limitations:[...required,...response.limitations.filter(value => !required.includes(value))].filter((value,index,all)=>all.indexOf(value)===index).slice(0,REASONING_ARRAY_MAX)};
}
export function selectTechnicalProviderSubset(evidence: ReasoningEvidence, maximum: number, project: (evidence: ReasoningEvidence)=>unknown): ReasoningEvidence {
  validateTechnicalEvidence(evidence);
  let selected = evidence;
  while (JSON.stringify(selected).length > maximum || JSON.stringify(project(selected)).length > maximum) {
    if (!selected.technicalDocuments?.length) throw new Error("COMPANY_LIMIT");
    selected = {...selected,technicalDocuments:selected.technicalDocuments.slice(0,-1),technicalEvidenceOmitted:true};
  }
  return selected;
}
function equalCitation(a: RetrievalCitation, b: RetrievalCitation): boolean {
  return Object.keys(a).every(k => {
    const key = k as keyof RetrievalCitation;
    if (key === "supportingPageReference") return a.supportingPageReference.documentId === b.supportingPageReference.documentId && a.supportingPageReference.pageId === b.supportingPageReference.pageId;
    return JSON.stringify(a[key]) === JSON.stringify(b[key]);
  });
}
export function revalidateTechnicalCitations(original: ReasoningEvidence, response: ReasoningResponse, fresh: ReasoningEvidence): void {
  const before = reconstructTechnicalCitations(original,response), current = reconstructTechnicalCitations(fresh,response);
  for (const citation of before) {
    const match = current.find(item => item.evidenceReference === citation.evidenceReference);
    if (!match || !equalCitation(citation,match)) invalid();
  }
}
export function validatePersistedTechnicalAdjunct(response: ReasoningResponse, expectedQuestion: unknown, value: TechnicalCitationAdjunct): TechnicalCitationAdjunct {
  const used = usedTechnicalReferences(response);
  if (value.technicalCitations === undefined && value.technicalRetrievalContext === undefined) {
    if (used.size) invalid();
    return {};
  }
  if (!Array.isArray(value.technicalCitations) || value.technicalCitations.length > 5) invalid();
  const context = record(value.technicalRetrievalContext);
  if (Object.keys(context).length !== 1 || !Object.hasOwn(context,"question")) invalid();
  let question: string;
  try { question = validateReasoningQuestion(context); } catch { invalid(); }
  if (question !== expectedQuestion) invalid();
  const citations = value.technicalCitations.map(validateTechnicalCitation);
  const refs = new Set(citations.map(c => c.evidenceReference));
  if (refs.size !== citations.length || refs.size !== used.size || [...used].some(r => !refs.has(r))) invalid();
  return {technicalCitations:citations.map(c=>structuredClone(c)),technicalRetrievalContext:{question}};
}
export function validateCachedTechnicalCitations(evidence: ReasoningEvidence, response: ReasoningResponse, value: TechnicalCitationAdjunct): void {
  const stored = validatePersistedTechnicalAdjunct(response,evidence.question,value);
  const expected = reconstructTechnicalCitations(evidence,response);
  for (const citation of expected) {
    const match = stored.technicalCitations?.find(item=>item.evidenceReference===citation.evidenceReference);
    if (!match || !equalCitation(citation,match)) invalid();
  }
}
export function technicalEvidenceFromRetrieval(result: {evidence:TechnicalRetrievalEvidence[];coverage:NonNullable<ReasoningEvidence["technicalRetrievalCoverage"]>}) {
  return {technicalDocuments:result.evidence,technicalRetrievalCoverage:result.coverage};
}
