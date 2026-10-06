import { createHash } from "node:crypto";
import { buildKnowledgePageId, hashProcessingContent } from "./knowledgePageProcessingCore.ts";
import { isKnowledgeDocumentRetrievable } from "./knowledgeContracts.ts";
import {
  MAX_CANDIDATE_DOCUMENTS, MAX_CANDIDATE_PAGES, MAX_RETURNED_PAGES,
  MAX_EXCERPT_LENGTH, MAX_REASONING_EVIDENCE_LENGTH, RELEVANCE_CATEGORIES,
  type RetrievalCandidate, type RetrievalCitation, type RetrievalQuery,
  type RetrievalResult, type ScoredPage, type RelevanceTuple,
} from "./knowledgeRetrievalContracts.ts";

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = (value: unknown): value is string => typeof value === "string" && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const STOP = new Set(["the", "and", "for", "with", "this", "that", "page", "manual", "vehicle", "technical", "document", "please", "check"]);
const label = (value: unknown): string => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") : "";
const tokens = (value: string): string[] => [...new Set(label(value).split(" ").filter(t => t.length >= 3 && !STOP.has(t)))].sort();
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const overlap = (a: string[], b: string[]): number => a.filter(t => b.includes(t)).length;

export function validateRetrievalCandidate(company: string, candidate: RetrievalCandidate): boolean {
  const d = candidate?.document, p = candidate?.page;
  if (!d || !p || !validId(company) || d.companyId !== company || !validId(d.documentId)) return false;
  if (!isKnowledgeDocumentRetrievable({ processingStatus: d.processingStatus, approvalStatus: d.approvalStatus } as Parameters<typeof isKnowledgeDocumentRetrievable>[0])) return false;
  if (!validHash(d.contentHash) || typeof d.title !== "string" || typeof d.originalFilename !== "string") return false;
  if (!Number.isSafeInteger(p.pageIndex) || p.pageIndex < 0 || p.pageIndex >= 2000) return false;
  if (p.documentId !== d.documentId || p.pageId !== buildKnowledgePageId(p.pageIndex) || p.displayPageNumber !== String(p.pageIndex + 1)) return false;
  if (typeof p.extractedText !== "string" || !validHash(p.textContentHash) || hashProcessingContent(p.extractedText) !== p.textContentHash) return false;
  return validId(d.publishedProcessingAttemptId) && validId(d.publishedProcessingInvocationId) &&
    p.processingAttemptId === d.publishedProcessingAttemptId && p.processingInvocationId === d.publishedProcessingInvocationId;
}

export function scoreRetrievalCandidate(candidate: RetrievalCandidate, query: RetrievalQuery): ScoredPage | null {
  const d = candidate.document, p = candidate.page;
  const vehicleKeys = ["manufacturer", "vehicleMake", "vehicleModel", "vehicleSeries"] as const;
  if (vehicleKeys.some(k => label(d[k]) && label(query[k]) && label(d[k]) !== label(query[k]))) return null;
  const vehicle = vehicleKeys.filter(k => label(d[k]) && label(d[k]) === label(query[k])).length;
  const system = (["system", "subsystem", "component"] as const).filter(k => label(d[k]) && label(d[k]) === label(query[k])).length;
  const pageTokens = tokens(p.extractedText);
  const questionTokens = tokens(query.question || "");
  const contextTokens = tokens([query.question, query.complaint, ...(query.technicianFindings || [])].filter(Boolean).join(" "));
  const metadata = tokens([d.title, d.description || ""].join(" "));
  const faultMatches = [...new Set((query.faultCodes || []).map(c => c.trim().toUpperCase()).filter(c => /^[A-Z0-9-]{2,64}$/.test(c) && /[A-Z]/.test(c) && /[0-9]/.test(c)))].sort()
    .flatMap(code => {
      const match = new RegExp(`(^|[^A-Z0-9-])${code}([^A-Z0-9-]|$)`, "i").exec(p.extractedText);
      return match ? [{ code, offset: match.index + match[1].length }] : [];
    });
  const titleMatches = overlap(contextTokens, metadata), questionMatches = overlap(questionTokens, pageTokens), textMatches = overlap(contextTokens, pageTokens);
  // At least two distinct technical tokens avoid generic single-word automatic hits.
  if (!faultMatches.length && !system && titleMatches < 2 && textMatches < 2) return null;
  const relevance: RelevanceTuple = [faultMatches.length, vehicle, system, titleMatches, questionMatches, textMatches];
  const reasons = RELEVANCE_CATEGORIES.flatMap((category, index) => relevance[index] ? [`${category}:${relevance[index]}`] : []);
  let anchor = faultMatches.length ? Math.min(...faultMatches.map(match => match.offset)) : -1;
  if (anchor < 0) {
    const matched = [...questionTokens, ...contextTokens].filter(t => pageTokens.includes(t));
    const offsets = matched.map(t => p.extractedText.toLowerCase().indexOf(t)).filter(n => n >= 0);
    anchor = offsets.length ? Math.min(...offsets) : 0;
  }
  return { candidate, relevance, reasons, anchor };
}

export function excerptFromPage(text: string, anchor = 0): string {
  if (!text.trim()) return "";
  const start = Math.max(0, Math.min(Math.floor(anchor), text.length) - 200);
  return text.slice(start, start + MAX_EXCERPT_LENGTH);
}

export function evidenceReferenceFor(candidate: RetrievalCandidate): string {
  if (!validateRetrievalCandidate(candidate.document.companyId, candidate)) throw new Error("INVALID_TECHNICAL_EVIDENCE");
  const d = candidate.document, p = candidate.page;
  // Fixed-order JSON identity; tenant stays internal and Storage paths are never inputs.
  const identity = [d.companyId, d.documentId, d.contentHash, p.pageId, p.pageIndex,
    p.textContentHash, p.processingAttemptId, p.processingInvocationId];
  return `TECHNICAL_DOCUMENT_${createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex")}`;
}

export function createRetrievalCitation(company: string, candidate: RetrievalCandidate, query: RetrievalQuery): RetrievalCitation | null {
  if (!validateRetrievalCandidate(company, candidate)) return null;
  const scored = scoreRetrievalCandidate(candidate, query);
  if (!scored) return null;
  const d = candidate.document, p = candidate.page;
  return {
    evidenceReference: evidenceReferenceFor(candidate), documentId: d.documentId,
    documentTitle: d.title, documentContentHash: d.contentHash, pageId: p.pageId,
    pageIndex: p.pageIndex, displayPageNumber: p.displayPageNumber, textContentHash: p.textContentHash,
    originalFilename: d.originalFilename, processingAttemptId: p.processingAttemptId,
    processingInvocationId: p.processingInvocationId, excerpt: excerptFromPage(p.extractedText, scored.anchor),
    relevanceReasons: scored.reasons, supportingPageReference: { documentId: d.documentId, pageId: p.pageId },
    evidenceCategory: "TECHNICAL_DOCUMENT",
  };
}

export function validateRetrievalCitation(company: string, candidate: RetrievalCandidate, query: RetrievalQuery, value: unknown): boolean {
  const expected = createRetrievalCitation(company, candidate, query);
  if (!expected || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const supplied = value as Record<string, unknown>;
  if (Object.keys(supplied).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(([key, field]) => {
    if (key === "supportingPageReference") {
      const ref = supplied[key] as Record<string, unknown> | undefined;
      return !!ref && Object.keys(ref).length === 2 && ref.documentId === expected.documentId && ref.pageId === expected.pageId;
    }
    if (Array.isArray(field)) {
      const values = supplied[key];
      return Array.isArray(values) && values.length === field.length && values.every((value, index) => value === field[index]);
    }
    return supplied[key] === field;
  });
}

// Fixed field order avoids dependence on caller object-property insertion order.
function candidateTieKey(candidate: RetrievalCandidate): string {
  const d = candidate.document, p = candidate.page;
  return JSON.stringify([d.companyId, d.contentHash, d.processingStatus, d.approvalStatus,
    d.publishedProcessingAttemptId, d.publishedProcessingInvocationId, d.title, d.description,
    d.originalFilename, d.manufacturer, d.vehicleMake, d.vehicleModel, d.vehicleSeries,
    d.system, d.subsystem, d.component, p.documentId, p.displayPageNumber, p.extractedText,
    p.textContentHash, p.processingAttemptId, p.processingInvocationId]);
}

export function retrieveKnowledgePages(company: string, candidates: readonly RetrievalCandidate[], query: RetrievalQuery, upstreamCoverageLimited = false): RetrievalResult {
  // Sorting before selection makes bounds and duplicate winners independent of input order.
  const malformed = candidates.filter(c => !c?.document || !c?.page);
  const ordered = candidates.filter(c => c?.document && c?.page).sort((a, b) => compare(a.document.documentId, b.document.documentId) || a.page.pageIndex - b.page.pageIndex || compare(a.page.pageId, b.page.pageId) || compare(candidateTieKey(a), candidateTieKey(b)));
  const documents = new Set<string>();
  let pages = 0, invalid = malformed.length, empty = 0, limited = upstreamCoverageLimited;
  const scored: ScoredPage[] = [];
  for (const candidate of ordered) {
    if (!documents.has(candidate.document.documentId) && documents.size === MAX_CANDIDATE_DOCUMENTS) { limited = true; continue; }
    if (pages === MAX_CANDIDATE_PAGES) { limited = true; break; }
    documents.add(candidate.document.documentId); pages++;
    if (!validateRetrievalCandidate(company, candidate)) { invalid++; continue; }
    if (!candidate.page.extractedText.trim()) empty++;
    const score = scoreRetrievalCandidate(candidate, query);
    if (score) scored.push(score);
  }
  limited ||= documents.size === MAX_CANDIDATE_DOCUMENTS || pages === MAX_CANDIDATE_PAGES;
  scored.sort((a, b) => {
    for (let i = 0; i < RELEVANCE_CATEGORIES.length; i++) if (a.relevance[i] !== b.relevance[i]) return b.relevance[i] - a.relevance[i];
    return compare(a.candidate.document.documentId, b.candidate.document.documentId) || a.candidate.page.pageIndex - b.candidate.page.pageIndex || compare(a.candidate.page.pageId, b.candidate.page.pageId);
  });
  const seen = new Set<string>();
  const unique = scored.filter(s => { const key = `${s.candidate.document.contentHash}:${s.candidate.page.pageIndex}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const results: RetrievalResult["results"] = [];
  let evidenceLength = 0;
  for (const score of unique) {
    if (results.length === MAX_RETURNED_PAGES) { limited = true; break; }
    const citation = createRetrievalCitation(company, score.candidate, query)!;
    if (evidenceLength + citation.excerpt.length > MAX_REASONING_EVIDENCE_LENGTH) { limited = true; break; }
    evidenceLength += citation.excerpt.length;
    results.push({ relevance: score.relevance, citation });
  }
  return { results, evidence: results.map(({ citation }) => ({ category: "TECHNICAL_DOCUMENT", reference: citation.evidenceReference, excerpt: citation.excerpt, citation })),
    coverage: { candidateDocumentsConsidered: documents.size, candidatePagesConsidered: pages, resultsReturned: results.length, truncated: limited, coverageLimited: limited, invalidCandidates: invalid, emptyTextPages: empty, reasoningEvidenceLength: evidenceLength } };
}
