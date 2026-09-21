// IQ200 Technical Knowledge Library — Pure security & data contracts
// Phase 24C: Foundation contracts only. No Firebase, no Storage, no API routes.

// ─── Document Types ──────────────────────────────────────────────────────────

export const KNOWLEDGE_DOCUMENT_TYPES = [
  "workshop_manual",
  "wiring_diagram",
  "electrical_manual",
  "fault_code_doc",
  "service_procedure",
  "technical_bulletin",
  "component_manual",
  "technical_reference",
] as const;

export type KnowledgeDocumentType = typeof KNOWLEDGE_DOCUMENT_TYPES[number];

export function isKnowledgeDocumentType(value: unknown): value is KnowledgeDocumentType {
  return typeof value === "string" && (KNOWLEDGE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

// ─── Processing State Machine ────────────────────────────────────────────────

export const KNOWLEDGE_PROCESSING_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;
export type KnowledgeProcessingStatus = typeof KNOWLEDGE_PROCESSING_STATUSES[number];

export function isKnowledgeProcessingStatus(value: unknown): value is KnowledgeProcessingStatus {
  return typeof value === "string" && (KNOWLEDGE_PROCESSING_STATUSES as readonly string[]).includes(value);
}

// ─── Approval State Machine ──────────────────────────────────────────────────

export const KNOWLEDGE_APPROVAL_STATUSES = ["DRAFT", "APPROVED", "REJECTED", "INACTIVE"] as const;
export type KnowledgeApprovalStatus = typeof KNOWLEDGE_APPROVAL_STATUSES[number];

export function isKnowledgeApprovalStatus(value: unknown): value is KnowledgeApprovalStatus {
  return typeof value === "string" && (KNOWLEDGE_APPROVAL_STATUSES as readonly string[]).includes(value);
}

// ─── Trust Labels ────────────────────────────────────────────────────────────

export const KNOWLEDGE_TRUST_LABELS = [
  "VERIFIED_SOURCE",
  "APPROVED_KNOWN_FIX",
  "HISTORICAL_JOB",
  "AI_INFERENCE",
  "NOT_VERIFIED",
] as const;

export type KnowledgeTrustLabel = typeof KNOWLEDGE_TRUST_LABELS[number];

export function isKnowledgeTrustLabel(value: unknown): value is KnowledgeTrustLabel {
  return typeof value === "string" && (KNOWLEDGE_TRUST_LABELS as readonly string[]).includes(value);
}

// ─── Verification State ──────────────────────────────────────────────────────

export const KNOWLEDGE_VERIFICATION_STATES = ["SOURCE_VERIFIED", "SOURCE_PARTIAL", "UNVERIFIED"] as const;
export type KnowledgeVerificationState = typeof KNOWLEDGE_VERIFICATION_STATES[number];

export function isKnowledgeVerificationState(value: unknown): value is KnowledgeVerificationState {
  return typeof value === "string" && (KNOWLEDGE_VERIFICATION_STATES as readonly string[]).includes(value);
}

// ─── Evidence Category ───────────────────────────────────────────────────────

export const KNOWLEDGE_EVIDENCE_CATEGORY = "TECHNICAL_DOCUMENT" as const;

// ─── Lifecycle Guards ────────────────────────────────────────────────────────

export interface KnowledgeDocumentState {
  processingStatus: KnowledgeProcessingStatus;
  approvalStatus: KnowledgeApprovalStatus;
}

export function canApproveKnowledgeDocument(document: KnowledgeDocumentState): boolean {
  return document.processingStatus === "READY" && document.approvalStatus === "DRAFT";
}

export function canInactivateKnowledgeDocument(document: KnowledgeDocumentState): boolean {
  return document.approvalStatus === "APPROVED";
}

export function canRejectKnowledgeDocument(document: KnowledgeDocumentState): boolean {
  return document.approvalStatus === "DRAFT";
}

export function isKnowledgeDocumentRetrievable(document: KnowledgeDocumentState): boolean {
  return document.processingStatus === "READY" && document.approvalStatus === "APPROVED";
}

// ─── Trust Label Mapping ─────────────────────────────────────────────────────

export function trustLabelForEvidenceCategory(
  category: string,
  approvalStatus?: string,
): KnowledgeTrustLabel {
  if (category === KNOWLEDGE_EVIDENCE_CATEGORY && approvalStatus === "APPROVED") {
    return "VERIFIED_SOURCE";
  }
  if (category === "KNOWN_FIX" && approvalStatus === "APPROVED") {
    return "APPROVED_KNOWN_FIX";
  }
  if (category === "RELATED_HISTORY" || category === "HISTORY") {
    return "HISTORICAL_JOB";
  }
  return "NOT_VERIFIED";
}

// ─── Page Identity ───────────────────────────────────────────────────────────

export interface KnowledgePageIdentity {
  documentId: string;
  pageIndex: number;
  displayPageNumber: string;
  contentHash: string;
}

// ─── Page Record ─────────────────────────────────────────────────────────────

export interface KnowledgePage {
  documentId: string;
  pageIndex: number;
  displayPageNumber: string;
  extractedText: string;
  textContentHash: string;
  searchIndex: string;
  imageStorageRef: string;
  thumbnailStorageRef: string;
  imageWidth: number;
  imageHeight: number;
  hasDiagrams: boolean;
}

// ─── Document Metadata ───────────────────────────────────────────────────────

export interface KnowledgeDocumentMetadata {
  title: string;
  description: string;
  manufacturer: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleSeries: string;
  system: string;
  subsystem: string;
  component: string;
  documentType: KnowledgeDocumentType;
  documentVersion: string;
  publicationNumber: string;
  referenceNumber: string;
  language: string;
  sourceFileName: string;
  mimeType: string;
  fileSize: number;
  pageCount: number;
  approvalStatus: KnowledgeApprovalStatus;
  processingStatus: KnowledgeProcessingStatus;
  storageReference: string;
  contentHash: string;
}

// ─── Technical Citation (no URLs — stable identity only) ─────────────────────

export interface TechnicalCitation {
  documentId: string;
  documentTitle: string;
  publicationNumber: string;
  documentVersion: string;
  manufacturer: string;
  pageIndex: number;
  displayPageNumber: string;
  excerpt: string;
  sourceReference: string;
  evidenceCategory: typeof KNOWLEDGE_EVIDENCE_CATEGORY;
  trustLabel: "VERIFIED_SOURCE";
  approvalStatus: "APPROVED";
}

// ─── Technical Document Evidence ─────────────────────────────────────────────

export interface TechnicalDocumentEvidence {
  documentId: string;
  pageId: string;
  pageNumber: string;
  documentTitle: string;
  manufacturer: string;
  referenceNumber: string;
  excerpt: string;
  sourceReference: string;
  approvalStatus: "APPROVED";
  evidenceCategory: typeof KNOWLEDGE_EVIDENCE_CATEGORY;
}

// ─── Wiring Evidence ─────────────────────────────────────────────────────────

export interface WiringEvidence {
  component?: string;
  connector?: string;
  connectorPin?: string;
  wireCode?: string;
  wireColour?: string;
  fuse?: string;
  relay?: string;
  ground?: string;
  splice?: string;
  powerSupply?: string;
  signal?: string;
  continuationReference?: string;
  continuationPage?: number;
  sourceCitation: TechnicalCitation;
  verificationState: KnowledgeVerificationState;
}

// ─── Physical Check Point ────────────────────────────────────────────────────

export interface PhysicalCheckPoint {
  checkDescription: string;
  component?: string;
  location?: string;
  connector?: string;
  pin?: string;
  wireCode?: string;
  wireColour?: string;
  measurementType?: string;
  expectedValue?: string;
  conditions?: string;
  safetyNote?: string;
  sourceCitation: TechnicalCitation;
  verificationState: KnowledgeVerificationState;
}

