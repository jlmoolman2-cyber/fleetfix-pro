export const MAX_CANDIDATE_DOCUMENTS = 50;
export const MAX_CANDIDATE_PAGES = 200;
export const MAX_RETURNED_PAGES = 5;
export const MAX_EXCERPT_LENGTH = 1200;
export const MAX_REASONING_EVIDENCE_LENGTH = 6000;
export const RELEVANCE_CATEGORIES = [
  "EXACT_FAULT_MATCH", "VEHICLE_APPLICABILITY_MATCH", "SYSTEM_COMPONENT_MATCH",
  "TITLE_METADATA_MATCH", "QUESTION_TEXT_MATCH", "PAGE_TEXT_MATCH",
] as const;
export type RelevanceTuple = [number, number, number, number, number, number];
export interface Applicability {
  manufacturer?: string; vehicleMake?: string; vehicleModel?: string; vehicleSeries?: string;
  system?: string; subsystem?: string; component?: string;
}
export interface RetrievalDocument extends Applicability {
  companyId: string; documentId: string; title: string; description?: string;
  originalFilename: string; contentHash: string;
  processingStatus?: string; approvalStatus?: string;
  publishedProcessingAttemptId: string; publishedProcessingInvocationId: string;
}
export interface RetrievalPage {
  documentId: string; pageId: string; pageIndex: number; displayPageNumber: string;
  extractedText: string; textContentHash: string;
  processingAttemptId: string; processingInvocationId: string;
}
export interface RetrievalCandidate { document: RetrievalDocument; page: RetrievalPage }
export interface RetrievalQuery extends Applicability {
  faultCodes?: string[]; complaint?: string; technicianFindings?: string[]; question?: string;
}
export interface SupportingPageReference { documentId: string; pageId: string }
export interface RetrievalCitation {
  evidenceReference: string; documentId: string; documentTitle: string; documentContentHash: string;
  pageId: string; pageIndex: number; displayPageNumber: string; textContentHash: string;
  originalFilename: string; processingAttemptId: string; processingInvocationId: string;
  excerpt: string; relevanceReasons: string[]; supportingPageReference: SupportingPageReference;
  evidenceCategory: "TECHNICAL_DOCUMENT";
}
export interface TechnicalRetrievalEvidence {
  category: "TECHNICAL_DOCUMENT"; reference: string; excerpt: string; citation: RetrievalCitation;
}
export interface ScoredPage { candidate: RetrievalCandidate; relevance: RelevanceTuple; reasons: string[]; anchor: number }
export interface RetrievalResult {
  results: Array<{ relevance: RelevanceTuple; citation: RetrievalCitation }>;
  evidence: TechnicalRetrievalEvidence[];
  coverage: {
    candidateDocumentsConsidered: number; candidatePagesConsidered: number; resultsReturned: number;
    truncated: boolean; coverageLimited: boolean; invalidCandidates: number;
    emptyTextPages: number; reasoningEvidenceLength: number;
  };
}
