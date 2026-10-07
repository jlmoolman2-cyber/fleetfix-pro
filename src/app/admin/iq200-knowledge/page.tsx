"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    KnowledgeApiError,
    approveKnowledgeDocument,
    createKnowledgeIdempotencyKey,
    fetchKnowledgeLibrary,
    knowledgeSurfaceFor,
    uploadKnowledgePdf,
    validateKnowledgePdf,
    type KnowledgeCapabilities,
    type KnowledgeDocument,
    type KnowledgeUploadOutcome,
} from "@/lib/iq200/knowledgeClient";

type UploadState = "idle" | "ready" | "uploading" | "success" | "error";

const STATUS_STYLES: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-700",
    PROCESSING: "bg-blue-100 text-blue-700",
    READY: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
};

function StatusBadge({ value }: { value: string }) {
    return (
        <span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_STYLES[value] || "bg-gray-100 text-gray-500"}`}>
            {value || "UNKNOWN"}
        </span>
    );
}

function formatSize(bytes: number) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function KnowledgeLibraryPage() {
    const [capabilities, setCapabilities] = useState<KnowledgeCapabilities | null>(null);
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [uploadState, setUploadState] = useState<UploadState>("idle");
    const [uploadError, setUploadError] = useState("");
    const [outcome, setOutcome] = useState<KnowledgeUploadOutcome | null>(null);
    const [inputKey, setInputKey] = useState(0);
    const [approvingDocuments, setApprovingDocuments] = useState<Record<string, boolean>>({});
    const [approvalErrors, setApprovalErrors] = useState<Record<string, string>>({});

    const idempotencyKey = useRef<string | null>(null);
    const inFlight = useRef(false);
    const approvalInFlight = useRef(new Set<string>());

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const result = await fetchKnowledgeLibrary();
            setCapabilities(result.capabilities);
            setDocuments(result.documents);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Unable to load the Knowledge Library.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const surface = knowledgeSurfaceFor(capabilities);

    const selectFile = (selected: File | null) => {
        setOutcome(null);
        setFile(selected);
        idempotencyKey.current = null;
        if (!selected) {
            setUploadState("idle");
            setUploadError("");
            return;
        }
        const problem = validateKnowledgePdf(selected);
        if (problem) {
            setUploadState("error");
            setUploadError(problem);
            return;
        }
        idempotencyKey.current = createKnowledgeIdempotencyKey();
        setUploadError("");
        setUploadState("ready");
    };

    const reset = () => {
        setFile(null);
        setTitle("");
        setDescription("");
        setOutcome(null);
        setUploadError("");
        setUploadState("idle");
        idempotencyKey.current = null;
        setInputKey((value) => value + 1);
    };

    const submit = async () => {
        if (inFlight.current || !file || !idempotencyKey.current) return;
        const problem = validateKnowledgePdf(file);
        if (problem) {
            setUploadState("error");
            setUploadError(problem);
            return;
        }
        inFlight.current = true;
        setUploadState("uploading");
        setUploadError("");
        try {
            const result = await uploadKnowledgePdf({ file, title: title.trim(), description: description.trim() }, idempotencyKey.current);
            setOutcome(result);
            setUploadState("success");
        } catch (error) {
            setUploadError(
                error instanceof KnowledgeApiError ? `${error.code}: ${error.message}` : "The upload could not be completed.",
            );
            setUploadState("error");
        } finally {
            inFlight.current = false;
        }
    };

    const canSubmit = uploadState === "ready" || (uploadState === "error" && file !== null && idempotencyKey.current !== null);
    const approve = async (document: KnowledgeDocument) => {
        const { documentId } = document;
        if (
            capabilities?.approve !== true ||
            document.processingStatus !== "READY" ||
            document.approvalStatus !== "DRAFT" ||
            approvalInFlight.current.has(documentId)
        ) return;

        approvalInFlight.current.add(documentId);
        setApprovingDocuments((current) => ({ ...current, [documentId]: true }));
        setApprovalErrors((current) => ({ ...current, [documentId]: "" }));
        try {
            await approveKnowledgeDocument(documentId);
            await load();
        } catch (error) {
            setApprovalErrors((current) => ({
                ...current,
                [documentId]: error instanceof KnowledgeApiError
                    ? `${error.code}: ${error.message}`
                    : "Approval failed. Refresh the list and try again.",
            }));
        } finally {
            approvalInFlight.current.delete(documentId);
            setApprovingDocuments((current) => ({ ...current, [documentId]: false }));
        }
    };

    return (
        <div className="min-h-screen bg-[#f4f7fb] p-8">
            <div className="mb-8">
                <Link href="/admin" className="text-sm font-bold text-blue-600">
                    ← Admin
                </Link>
                <h1 className="mt-3 text-4xl font-black text-gray-900">IQ200 Knowledge Library</h1>
                <p className="mt-2 text-gray-500">Upload and monitor technical reference documents.</p>
            </div>

            {loading && !capabilities && <div className="text-lg font-bold text-gray-600">Loading…</div>}
            {loadError && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{loadError}</div>}

            {surface.showUpload && (
                <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-xl font-black text-gray-900">Upload PDF</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <input
                            key={inputKey}
                            type="file"
                            accept="application/pdf"
                            disabled={uploadState === "uploading" || uploadState === "success"}
                            onChange={(event) => selectFile(event.target.files?.[0] || null)}
                            className="rounded-xl border border-gray-300 bg-gray-50 p-3 md:col-span-2"
                        />
                        <input
                            value={title}
                            maxLength={300}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Title"
                            disabled={uploadState === "uploading" || uploadState === "success"}
                            className="h-12 rounded-xl border border-gray-300 px-4"
                        />
                        <input
                            value={description}
                            maxLength={2000}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Description"
                            disabled={uploadState === "uploading" || uploadState === "success"}
                            className="h-12 rounded-xl border border-gray-300 px-4"
                        />
                    </div>
                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => void submit()}
                            disabled={!canSubmit}
                            className="rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-40"
                        >
                            {uploadState === "uploading" ? "Uploading…" : uploadState === "error" && file ? "Retry upload" : "Upload"}
                        </button>
                        {(uploadState === "success" || uploadState === "error") && (
                            <button type="button" onClick={reset} className="rounded-xl border border-gray-300 px-6 py-3 font-black text-gray-700">
                                Upload another
                            </button>
                        )}
                    </div>
                    {uploadState === "error" && uploadError && (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
                    )}
                    {uploadState === "success" && outcome && (
                        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                            <div className="font-black">
                                {outcome.created ? "Document uploaded." : "Existing document returned (idempotent retry)."}
                            </div>
                            <dl className="mt-2 grid gap-1">
                                <div>Document ID: <span className="font-mono">{outcome.document.documentId}</span></div>
                                <div>File: {outcome.document.originalFilename}</div>
                                <div>Processing status: {outcome.document.processingStatus}</div>
                                <div>Approval status: {outcome.document.approvalStatus}</div>
                            </dl>
                        </div>
                    )}
                </section>
            )}

            {capabilities && surface.showNoViewMessage && (
                <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 text-gray-600">
                    You do not have permission to view Knowledge Library documents.
                </div>
            )}

            {surface.showList && (
                <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                        <h2 className="text-xl font-black text-gray-900">Documents</h2>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="rounded-xl border border-gray-300 px-5 py-2 font-bold text-gray-700 disabled:opacity-40"
                        >
                            {loading ? "Refreshing…" : "Refresh"}
                        </button>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase text-gray-400">
                            <tr>
                                <th className="px-6 py-3">Title</th>
                                <th className="px-6 py-3">File</th>
                                <th className="px-6 py-3">Size</th>
                                <th className="px-6 py-3">Uploaded</th>
                                <th className="px-6 py-3">Processing</th>
                                <th className="px-6 py-3">Approval</th>
                                <th className="px-6 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((item) => (
                                <tr key={item.documentId} className="border-t border-gray-100">
                                    <td className="px-6 py-3 font-bold">{item.title || "—"}</td>
                                    <td className="px-6 py-3">{item.originalFilename}</td>
                                    <td className="px-6 py-3">{formatSize(item.sizeBytes)}</td>
                                    <td className="px-6 py-3">{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : "—"}</td>
                                    <td className="px-6 py-3"><StatusBadge value={item.processingStatus} /></td>
                                    <td className="px-6 py-3"><StatusBadge value={item.approvalStatus} /></td>
                                    <td className="px-6 py-3">
                                        {capabilities?.approve === true && item.processingStatus === "READY" && item.approvalStatus === "DRAFT" ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void approve(item)}
                                                    disabled={approvingDocuments[item.documentId] === true}
                                                    className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    {approvingDocuments[item.documentId] ? "Approving…" : "Approve"}
                                                </button>
                                                {approvalErrors[item.documentId] && (
                                                    <p role="alert" className="mt-2 text-xs text-red-700">{approvalErrors[item.documentId]}</p>
                                                )}
                                            </>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                            {!documents.length && !loading && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">No documents yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
