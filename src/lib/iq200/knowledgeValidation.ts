// IQ200 Technical Knowledge Library — Pure runtime validation
// Phase 24C: Validation for contracts crossing future persistence/API boundaries.

import {
  isKnowledgeDocumentType,
  isKnowledgeProcessingStatus,
  isKnowledgeApprovalStatus,
  isKnowledgeTrustLabel,
  isKnowledgeVerificationState,
  KNOWLEDGE_EVIDENCE_CATEGORY,
  KNOWLEDGE_DOCUMENT_TYPES,
  KNOWLEDGE_PROCESSING_STATUSES,
  KNOWLEDGE_APPROVAL_STATUSES,
  type KnowledgeDocumentMetadata,
  type TechnicalCitation,
  type WiringEvidence,
  type PhysicalCheckPoint,
  type KnowledgePageIdentity,
} from "./knowledgeContracts.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

export const KNOWLEDGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const KNOWLEDGE_TITLE_MAX = 300;
export const KNOWLEDGE_DESCRIPTION_MAX = 2000;
export const KNOWLEDGE_STRING_FIELD_MAX = 200;
export const KNOWLEDGE_EXCERPT_MAX = 4000;
export const KNOWLEDGE_SOURCE_REF_MAX = 500;
export const KNOWLEDGE_FILE_NAME_MAX = 255;
export const KNOWLEDGE_MIME_TYPE_MAX = 100;
export const KNOWLEDGE_STORAGE_REF_MAX = 500;
export const KNOWLEDGE_HASH_MAX = 128;
export const KNOWLEDGE_DISPLAY_PAGE_MAX = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function invalid(reason: string): never {
  throw new Error(reason);
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") invalid(`INVALID_${field.toUpperCase()}`);
  const result = value.trim();
  if (!result) invalid(`INVALID_${field.toUpperCase()}`);
  if (result.length > max) invalid(`INVALID_${field.toUpperCase()}`);
  return result;
}

function requireOptionalString(value: unknown, field: string, max: number): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string") invalid(`INVALID_${field.toUpperCase()}`);
  const result = value.trim();
  if (result.length > max) invalid(`INVALID_${field.toUpperCase()}`);
  return result;
}

// ─── Page Index Validation ───────────────────────────────────────────────────

export function validatePageIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid("INVALID_PAGE_INDEX");
  }
  return value;
}

// ─── Page Identity Validation ────────────────────────────────────────────────

export function validatePageIdentity(value: unknown): KnowledgePageIdentity {
  if (!value || typeof value !== "object") invalid("INVALID_PAGE_IDENTITY");
  const record = value as Record<string, unknown>;
  return {
    documentId: requireString(record.documentId, "documentId", 128),
    pageIndex: validatePageIndex(record.pageIndex),
    displayPageNumber: requireString(record.displayPageNumber, "displayPageNumber", KNOWLEDGE_DISPLAY_PAGE_MAX),
    contentHash: requireString(record.contentHash, "contentHash", KNOWLEDGE_HASH_MAX),
  };
}

// ─── Document Metadata Validation ────────────────────────────────────────────

export function validateKnowledgeDocumentMetadata(value: unknown): KnowledgeDocumentMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("INVALID_INPUT");
  const record = value as Record<string, unknown>;

  const documentType = record.documentType;
  if (!isKnowledgeDocumentType(documentType)) invalid("INVALID_DOCUMENT_TYPE");

  const processingStatus = record.processingStatus;
  if (!isKnowledgeProcessingStatus(processingStatus)) invalid("INVALID_PROCESSING_STATUS");

  const approvalStatus = record.approvalStatus;
  if (!isKnowledgeApprovalStatus(approvalStatus)) invalid("INVALID_APPROVAL_STATUS");

  return {
    title: requireString(record.title, "title", KNOWLEDGE_TITLE_MAX),
    description: requireOptionalString(record.description, "description", KNOWLEDGE_DESCRIPTION_MAX),
    manufacturer: requireOptionalString(record.manufacturer, "manufacturer", KNOWLEDGE_STRING_FIELD_MAX),
    vehicleMake: requireOptionalString(record.vehicleMake, "vehicleMake", KNOWLEDGE_STRING_FIELD_MAX),
    vehicleModel: requireOptionalString(record.vehicleModel, "vehicleModel", KNOWLEDGE_STRING_FIELD_MAX),
    vehicleSeries: requireOptionalString(record.vehicleSeries, "vehicleSeries", KNOWLEDGE_STRING_FIELD_MAX),
    system: requireOptionalString(record.system, "system", KNOWLEDGE_STRING_FIELD_MAX),
    subsystem: requireOptionalString(record.subsystem, "subsystem", KNOWLEDGE_STRING_FIELD_MAX),
    component: requireOptionalString(record.component, "component", KNOWLEDGE_STRING_FIELD_MAX),
    documentType,
    documentVersion: requireOptionalString(record.documentVersion, "documentVersion", KNOWLEDGE_STRING_FIELD_MAX),
    publicationNumber: requireOptionalString(record.publicationNumber, "publicationNumber", KNOWLEDGE_STRING_FIELD_MAX),
    referenceNumber: requireOptionalString(record.referenceNumber, "referenceNumber", KNOWLEDGE_STRING_FIELD_MAX),
    language: requireOptionalString(record.language, "language", 20),
    sourceFileName: requireString(record.sourceFileName, "sourceFileName", KNOWLEDGE_FILE_NAME_MAX),
    mimeType: requireString(record.mimeType, "mimeType", KNOWLEDGE_MIME_TYPE_MAX),
    fileSize: typeof record.fileSize === "number" && record.fileSize > 0 ? record.fileSize : invalid("INVALID_FILE_SIZE") as never,
    pageCount: typeof record.pageCount === "number" && Number.isInteger(record.pageCount) && record.pageCount >= 0 ? record.pageCount : invalid("INVALID_PAGE_COUNT") as never,
    approvalStatus,
    processingStatus,
    storageReference: requireString(record.storageReference, "storageReference", KNOWLEDGE_STORAGE_REF_MAX),
    contentHash: requireString(record.contentHash, "contentHash", KNOWLEDGE_HASH_MAX),
  };
}

// ─── Citation Validation ─────────────────────────────────────────────────────

export function validateTechnicalCitation(value: unknown): TechnicalCitation {
  if (!value || typeof value !== "object") invalid("INVALID_CITATION");
  const record = value as Record<string, unknown>;

  if (record.evidenceCategory !== KNOWLEDGE_EVIDENCE_CATEGORY) invalid("INVALID_EVIDENCE_CATEGORY");
  if (record.trustLabel !== "VERIFIED_SOURCE") invalid("INVALID_TRUST_LABEL");
  if (record.approvalStatus !== "APPROVED") invalid("INVALID_APPROVAL_STATUS");

  const documentId = requireString(record.documentId, "documentId", 128);
  if (!KNOWLEDGE_ID.test(documentId)) invalid("INVALID_DOCUMENT_ID");

  return {
    documentId,
    documentTitle: requireString(record.documentTitle, "documentTitle", KNOWLEDGE_TITLE_MAX),
    publicationNumber: requireOptionalString(record.publicationNumber, "publicationNumber", KNOWLEDGE_STRING_FIELD_MAX),
    documentVersion: requireOptionalString(record.documentVersion, "documentVersion", KNOWLEDGE_STRING_FIELD_MAX),
    manufacturer: requireOptionalString(record.manufacturer, "manufacturer", KNOWLEDGE_STRING_FIELD_MAX),
    pageIndex: validatePageIndex(record.pageIndex),
    displayPageNumber: requireString(record.displayPageNumber, "displayPageNumber", KNOWLEDGE_DISPLAY_PAGE_MAX),
    excerpt: requireString(record.excerpt, "excerpt", KNOWLEDGE_EXCERPT_MAX),
    sourceReference: requireString(record.sourceReference, "sourceReference", KNOWLEDGE_SOURCE_REF_MAX),
    evidenceCategory: KNOWLEDGE_EVIDENCE_CATEGORY,
    trustLabel: "VERIFIED_SOURCE",
    approvalStatus: "APPROVED",
  };
}

// ─── Wiring Evidence Validation ──────────────────────────────────────────────

export function validateWiringEvidence(value: unknown): WiringEvidence {
  if (!value || typeof value !== "object") invalid("INVALID_WIRING_EVIDENCE");
  const record = value as Record<string, unknown>;

  const sourceCitation = validateTechnicalCitation(record.sourceCitation);
  const verificationState = record.verificationState;
  if (!isKnowledgeVerificationState(verificationState)) invalid("INVALID_VERIFICATION_STATE");

  const result: WiringEvidence = { sourceCitation, verificationState };

  const optionalStringFields = [
    "component", "connector", "connectorPin", "wireCode", "wireColour",
    "fuse", "relay", "ground", "splice", "powerSupply", "signal", "continuationReference",
  ] as const;

  for (const field of optionalStringFields) {
    if (record[field] != null && record[field] !== "") {
      (result as unknown as Record<string, unknown>)[field] = requireString(record[field], field, 200);
    }
  }

  if (record.continuationPage != null) {
    if (typeof record.continuationPage !== "number" || !Number.isInteger(record.continuationPage) || record.continuationPage < 0) {
      invalid("INVALID_CONTINUATION_PAGE");
    }
    result.continuationPage = record.continuationPage;
  }

  return result;
}

// ─── Physical Check Point Validation ─────────────────────────────────────────

export function validatePhysicalCheckPoint(value: unknown): PhysicalCheckPoint {
  if (!value || typeof value !== "object") invalid("INVALID_CHECK_POINT");
  const record = value as Record<string, unknown>;

  const sourceCitation = validateTechnicalCitation(record.sourceCitation);
  const verificationState = record.verificationState;
  if (!isKnowledgeVerificationState(verificationState)) invalid("INVALID_VERIFICATION_STATE");

  const result: PhysicalCheckPoint = {
    checkDescription: requireString(record.checkDescription, "checkDescription", 1000),
    sourceCitation,
    verificationState,
  };

  const optionalStringFields = [
    "component", "location", "connector", "pin", "wireCode",
    "wireColour", "measurementType", "expectedValue", "conditions", "safetyNote",
  ] as const;

  for (const field of optionalStringFields) {
    if (record[field] != null && record[field] !== "") {
      (result as unknown as Record<string, unknown>)[field] = requireString(record[field], field, 500);
    }
  }

  return result;
}

