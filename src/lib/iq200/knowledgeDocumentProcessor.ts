import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { parsePdf } from "./knowledgePdfParser";
import { renderPdfPageToPng } from "./knowledgePdfRenderer";
import {
  createKnowledgeProcessingAdapters,
  processClaimedKnowledgeDocumentCore,
  type ClaimedKnowledgeDocument,
  type ProcessingAssetStore,
  type ProcessingStateStore,
  type ProcessingTransaction,
} from "./knowledgePageProcessingCore";

function documentReference(claim: ClaimedKnowledgeDocument) {
  return adminDb.doc(`companies/${claim.companyId}/iq200_documents/${claim.documentId}`);
}

const stateStore: ProcessingStateStore = {
  serverTimestamp: () => FieldValue.serverTimestamp(),
  runTransaction: (work) => adminDb.runTransaction(async (firebaseTransaction) => {
    const transaction: ProcessingTransaction = {
      async getDocument(claim) {
        const snapshot = await firebaseTransaction.get(documentReference(claim));
        return snapshot.exists ? snapshot.data() : undefined;
      },
      async getPage(claim, pageId) {
        const snapshot = await firebaseTransaction.get(documentReference(claim).collection("pages").doc(pageId));
        return snapshot.exists ? snapshot.data() as Awaited<ReturnType<ProcessingTransaction["getPage"]>> : undefined;
      },
      setPage(claim, pageId, record) {
        firebaseTransaction.set(documentReference(claim).collection("pages").doc(pageId), record);
      },
      deletePage(claim, pageId) {
        firebaseTransaction.delete(documentReference(claim).collection("pages").doc(pageId));
      },
      updateDocument(claim, fields) {
        firebaseTransaction.update(documentReference(claim), fields);
      },
    };
    return work(transaction);
  }),
};

const assetStore: ProcessingAssetStore = {
  async download(path) {
    const [buffer] = await adminStorage.bucket().file(path).download();
    // Copy into a fresh ArrayBuffer to avoid retaining the Node.js Buffer's
    // backing store, which can cause DataCloneError in pdfjs-dist's fake
    // worker structured-clone boundary on Node.js 24+.
    const bytes = new Uint8Array(buffer.length);
    bytes.set(buffer);
    return bytes;
  },
  async save(path, bytes, metadata) {
    await adminStorage.bucket().file(path).save(Buffer.from(bytes), {
      resumable: false,
      contentType: "image/png",
      metadata: { metadata },
    });
  },
  async delete(path) {
    await adminStorage.bucket().file(path).delete({ ignoreNotFound: true });
  },
};

const adapters = createKnowledgeProcessingAdapters(stateStore, assetStore);

export async function processClaimedKnowledgeDocument(claim: ClaimedKnowledgeDocument) {
  const invocation = { ...claim, processingInvocationId: randomUUID() };
  return processClaimedKnowledgeDocumentCore(invocation, {
    ...adapters,
    parse: parsePdf,
    renderPage: renderPdfPageToPng,
  });
}
