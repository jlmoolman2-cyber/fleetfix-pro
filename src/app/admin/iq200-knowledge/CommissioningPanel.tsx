"use client";

import { useEffect, useRef, useState } from "react";
import {
    createCommissioningResultGeneration,
    createObjectUrlRegistry,
    fetchCommissioningKnowledge,
    resolveCommissioningKnowledgeImage,
    resolveCommissioningKnowledgePage,
    type JobKnowledgeCitation,
    type JobKnowledgePageResolution,
    type JobKnowledgeRequestResult,
} from "@/lib/iq200/client";

export default function CommissioningPanel() {
    const [question, setQuestion] = useState("");
    const [resultQuestion, setResultQuestion] = useState("");
    const [result, setResult] = useState<JobKnowledgeRequestResult | null>(null);
    const [resultCursor, setResultCursor] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [pageResults, setPageResults] = useState<Record<string, JobKnowledgePageResolution>>({});
    const [pageErrors, setPageErrors] = useState<Record<string, string>>({});
    const [pageLoading, setPageLoading] = useState<Record<string, boolean>>({});
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
    const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
    const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({});
    const [generation] = useState(() => createCommissioningResultGeneration());
    const [urlRegistry] = useState(() => createObjectUrlRegistry());
    const generationRef = useRef(generation);
    const urlRegistryRef = useRef(urlRegistry);
    const requestGeneration = useRef(0);
    const retrievalInFlight = useRef(false);
    const pageInFlight = useRef(new Set<string>());
    const imageInFlight = useRef(new Set<string>());

    useEffect(() => () => urlRegistryRef.current.revokeAll(), []);

    function clearResults() {
        requestGeneration.current += 1;
        generationRef.current.invalidate();
        urlRegistryRef.current.revokeAll();
        setResult(null);
        setResultCursor(undefined);
        setResultQuestion("");
        setPageResults({});
        setPageErrors({});
        setPageLoading({});
        setImageUrls({});
        setImageErrors({});
        setImageLoading({});
    }

    async function retrieve(event?: React.FormEvent, cursor?: string) {
        event?.preventDefault();
        const submittedQuestion = question.trim();
        if (!submittedQuestion || retrievalInFlight.current) return;
        retrievalInFlight.current = true;
        const currentGeneration = ++requestGeneration.current;
        generationRef.current.invalidate();
        urlRegistryRef.current.revokeAll();
        setResult(null);
        setResultCursor(cursor);
        setResultQuestion(submittedQuestion);
        setPageResults({});
        setPageErrors({});
        setImageUrls({});
        setImageErrors({});
        setLoading(true);
        setError("");
        try {
            const response = await fetchCommissioningKnowledge(submittedQuestion, cursor);
            if (requestGeneration.current !== currentGeneration) return;
            generationRef.current.activate(response.data.results.map(({ citation }) => citation.evidenceReference));
            setResult(response);
        } catch (reason) {
            if (requestGeneration.current === currentGeneration) setError(reason instanceof Error ? reason.message : "Knowledge retrieval failed.");
        } finally {
            retrievalInFlight.current = false;
            if (requestGeneration.current === currentGeneration) setLoading(false);
        }
    }

    async function resolvePage(citation: JobKnowledgeCitation) {
        const key = citation.evidenceReference;
        if (pageInFlight.current.has(key)) return;
        const activeCitation = generationRef.current.capture(key);
        if (!activeCitation) return;
        pageInFlight.current.add(key);
        setPageLoading((current) => ({ ...current, [key]: true }));
        setPageErrors((current) => ({ ...current, [key]: "" }));
        try {
            const resolved = await resolveCommissioningKnowledgePage(resultQuestion, citation, resultCursor);
            if (generationRef.current.isCurrent(activeCitation)) setPageResults((current) => ({ ...current, [key]: resolved }));
        } catch (reason) {
            if (generationRef.current.isCurrent(activeCitation)) setPageErrors((current) => ({ ...current, [key]: reason instanceof Error ? reason.message : "Citation resolution failed." }));
        } finally {
            pageInFlight.current.delete(key);
            if (generationRef.current.isCurrent(activeCitation)) setPageLoading((current) => ({ ...current, [key]: false }));
        }
    }

    async function resolveImage(citation: JobKnowledgeCitation) {
        const key = citation.evidenceReference;
        if (imageInFlight.current.has(key)) return;
        const activeCitation = generationRef.current.capture(key);
        if (!activeCitation) return;
        imageInFlight.current.add(key);
        setImageLoading((current) => ({ ...current, [key]: true }));
        setImageErrors((current) => ({ ...current, [key]: "" }));
        try {
            const blob = await resolveCommissioningKnowledgeImage(resultQuestion, citation, resultCursor);
            if (!generationRef.current.isCurrent(activeCitation)) return;
            const url = urlRegistryRef.current.create(key, blob);
            setImageUrls((current) => ({ ...current, [key]: url }));
        } catch (reason) {
            if (generationRef.current.isCurrent(activeCitation)) setImageErrors((current) => ({ ...current, [key]: reason instanceof Error ? reason.message : "Supporting image resolution failed." }));
        } finally {
            imageInFlight.current.delete(key);
            if (generationRef.current.isCurrent(activeCitation)) setImageLoading((current) => ({ ...current, [key]: false }));
        }
    }

    return (
        <section className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="staging-commissioning-title">
            <p className="text-xs font-black uppercase tracking-widest text-amber-900">STAGING COMMISSIONING</p>
            <h2 id="staging-commissioning-title" className="mt-1 text-xl font-black text-gray-950">Knowledge retrieval and citation checks</h2>
            <form onSubmit={(event) => void retrieve(event)} className="mt-4">
                <label className="block text-sm font-bold text-gray-800" htmlFor="commissioning-question">Question</label>
                <textarea
                    id="commissioning-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Ask a specific question about approved Knowledge"
                    className="mt-2 w-full rounded-lg border border-amber-400 bg-white p-3 text-sm"
                />
                <button type="submit" disabled={loading || !question.trim()} className="mt-3 min-h-10 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-50">
                    {loading ? "Retrieving…" : "Run Knowledge Retrieval Commissioning"}
                </button>
                {result && <button type="button" onClick={clearResults} className="ml-2 min-h-10 rounded-lg border border-gray-400 bg-white px-3 text-sm font-bold text-gray-800">Clear results</button>}
            </form>
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-800">{error}</p>}
            {result && (
                <div className="mt-5 space-y-4" aria-live="polite">
                    <p role="status" className="text-sm font-bold text-emerald-900">Retrieval completed · HTTP {result.httpStatus}</p>
                    {result.data.results.map(({ relevance, citation }) => {
                        const key = citation.evidenceReference;
                        return (
                            <article key={key} className="rounded-lg border border-amber-300 bg-white p-4">
                                <h3 className="font-bold text-gray-950">{citation.documentTitle}</h3>
                                <dl className="mt-2 grid gap-1 break-all text-xs text-gray-700 sm:grid-cols-2">
                                    <div>Document: <span className="font-mono">{citation.documentId}</span></div>
                                    <div>Page: {citation.displayPageNumber} <span className="font-mono">({citation.pageId})</span></div>
                                    <div>Text hash: <span className="font-mono">{citation.textContentHash}</span></div>
                                    <div>Evidence: <span className="font-mono">{key}</span></div>
                                    <div className="sm:col-span-2">Relevance: {relevance.join(" · ")}</div>
                                </dl>
                                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{citation.excerpt}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" onClick={() => void resolvePage(citation)} disabled={pageLoading[key] === true} className="min-h-9 rounded-lg border border-gray-300 px-3 text-xs font-bold text-gray-800 disabled:opacity-50">
                                        {pageLoading[key] ? "Verifying citation…" : "Verify supporting page"}
                                    </button>
                                    <button type="button" onClick={() => void resolveImage(citation)} disabled={imageLoading[key] === true} className="min-h-9 rounded-lg border border-gray-300 px-3 text-xs font-bold text-gray-800 disabled:opacity-50">
                                        {imageLoading[key] ? "Loading image…" : "View supporting image"}
                                    </button>
                                </div>
                                {pageErrors[key] && <p role="alert" className="mt-3 text-sm text-red-700">{pageErrors[key]}</p>}
                                {pageResults[key] && <p className="mt-3 text-sm font-semibold text-emerald-800">Citation verified against the current published page. Image dimensions: {pageResults[key].imageWidth ?? "unknown"} × {pageResults[key].imageHeight ?? "unknown"}.</p>}
                                {imageErrors[key] && <p role="alert" className="mt-3 text-sm text-red-700">{imageErrors[key]}</p>}
                                {imageUrls[key] && <img src={imageUrls[key]} alt={`Supporting page ${citation.displayPageNumber}`} className="mt-4 max-h-[70vh] max-w-full rounded-lg border border-gray-200 object-contain" />}
                            </article>
                        );
                    })}
                    {result.data.results.length === 0 && <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700">No relevant approved Knowledge evidence was returned.</p>}
                    <details className="rounded-lg border border-amber-300 bg-white p-4 text-sm">
                        <summary className="cursor-pointer font-bold">Coverage</summary>
                        <dl className="mt-3 grid gap-1 sm:grid-cols-2">
                            {Object.entries(result.data.coverage).map(([name, value]) => <div key={name}>{name}: {String(value)}</div>)}
                        </dl>
                    </details>
                    {result.data.continuationCursor && <button type="button" disabled={loading} onClick={() => void retrieve(undefined, result.data.continuationCursor!)} className="min-h-9 rounded-lg border border-gray-400 bg-white px-3 text-sm font-bold text-gray-800 disabled:opacity-50">Load next document page</button>}
                </div>
            )}
        </section>
    );
}