"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, History, Search, Send, ShieldCheck, Wrench } from "lucide-react";
import {
  iq200Api,
  IQ200ApiError,
  createSubmissionGuard,
  tryAcquireSubmissionGuard,
  releaseSubmissionGuard,
  createRequestCorrelation,
  isCurrentRequest,
  nextRequestToken,
  beginSubmission,
  applySubmissionSuccess,
  applySubmissionFailure,
  classifyIQ200Error,
  type IQ200ApiOptions,
} from "@/lib/iq200/client";

type Context = { job: { id: string; number: string; status: string; description: string; location: string; faultCodes: string[]; notes: Array<{ text: string; author: string; createdAt: string | null }>; diagnostics: Array<{ code: string; description: string; status: string; source: string; value: string | number | null; recordedAt: string | null }>; vehicle: { registrationNumber: string; fleetNumber: string; make: string; model: string; type: string; engineFamily: string } }; currentUser: { name: string } };
type Session = { id: string; initialQuestion?: string; state?: string; responseStatus?: string; createdAt?: string };
type HistoricalResult = { id: string; jobNumber: string; date: string | null; registration: string; fleetNumber: string; make: string; model: string; description: string; faultCodes: string[]; technicianFindings: string[]; repairPerformed: string[]; partsUsed: string[]; status: string; outcome: string; cancelled: boolean; incomplete: boolean; reopened: boolean; relevanceScore: number; relevanceReasons: string[] };
type KnownFix = { id: string; title: string; category: string; vehicleMake: string; vehicleModel: string; vehicleType: string; engineFamily: string; systemComponent: string; symptoms: string[]; faultCodes: string[]; diagnosticProcedure: string; expectedValues: string; findingsConditions: string; repairProcedure: string; requiredTools: string[]; partsComponents: string[]; safetyWarnings: string; technicalCautions: string; sourceReference: string; revision: number; relevanceScore: number; relevanceReasons: string[] };
type ReasoningResponse = { summary: string; observations: string[]; hypotheses: Array<{ title: string; explanation: string; confidence: "LOW" | "MEDIUM" | "HIGH"; evidenceReferences: string[]; contradictions: string[]; recommendedChecks: string[] }>; checks: Array<{ description: string; purpose: string; expectedResult: string; safetyNote: string; evidenceSource: string }>; safetyWarnings: string[]; missingInformation: string[]; evidenceUsed: Array<{ category: string; reference: string; detail: string }>; confidence: "LOW" | "MEDIUM" | "HIGH"; limitations: string[] };

export default function IQ200JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [context, setContext] = useState<Context | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<HistoricalResult[]>([]);
  const [knownFixes, setKnownFixes] = useState<KnownFix[]>([]);
  const [assessment, setAssessment] = useState<ReasoningResponse | null>(null);
  const [reasoningMessage, setReasoningMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [vehicleOnly, setVehicleOnly] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState("");
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null);

  // Phase 13D-1: Synchronous guards and correlation
  const submissionGuardRef = useRef(createSubmissionGuard());
  const historyGuardRef = useRef(createSubmissionGuard());
  const submissionCorrelationRef = useRef(createRequestCorrelation());
  const historyCorrelationRef = useRef(createRequestCorrelation());
  const initialLoadAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const submissionAbortRef = useRef<AbortController | null>(null);
  const historyRequestKeyRef = useRef<string | null>(null);
  const activeJobIdRef = useRef(id);
  const jobGenerationRef = useRef(0);
  activeJobIdRef.current = id;

  async function loadHistory(filters: { q?: string; faultCode?: string; vehicleOnly?: boolean } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "10" });
    if (filters.q?.trim()) query.set("q", filters.q.trim());
    if (filters.faultCode?.trim()) query.set("faultCode", filters.faultCode.trim());
    if (filters.vehicleOnly) query.set("vehicleOnly", "true");
    const options: IQ200ApiOptions = signal ? { signal } : {};
    const result = await iq200Api<{ results: HistoricalResult[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/history?${query}`, options);
    return result.results;
  }

  async function refreshSessions(signal?: AbortSignal) {
    const options: IQ200ApiOptions = signal ? { signal } : {};
    const result = await iq200Api<{ sessions: Session[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`, options);
    return result.sessions;
  }

  useEffect(() => {
    initialLoadAbortRef.current?.abort();
    submissionAbortRef.current?.abort();
    historyAbortRef.current?.abort();
    nextRequestToken(submissionCorrelationRef.current);
    nextRequestToken(historyCorrelationRef.current);
    submissionGuardRef.current = createSubmissionGuard();
    historyGuardRef.current = createSubmissionGuard();
    historyRequestKeyRef.current = null;
    const generation = jobGenerationRef.current + 1;
    jobGenerationRef.current = generation;
    const abortController = new AbortController();
    initialLoadAbortRef.current = abortController;
    let active = true;
    setLoading(true);
    setLoadedJobId(null);
    setContext(null);
    setSessions([]);
    setHistory([]);
    setKnownFixes([]);
    setAssessment(null);
    setReasoningMessage("");
    setQuestion("");
    setSearch("");
    setFaultCode("");
    setVehicleOnly(false);
    setError("");
    setHistoryError("");
    setPermissionBlocked(false);
    setSaving(false);
    setSearching(false);
    setInitialLoadError("");
    const isCurrentJob = () => active && activeJobIdRef.current === id && jobGenerationRef.current === generation;

    (async () => {
      try {
        // Required: context + sessions
        const [jobContext, sessionResult] = await Promise.all([
          iq200Api<Context>(`/api/iq200/jobs/${encodeURIComponent(id)}/context`, { signal: abortController.signal }),
          iq200Api<{ sessions: Session[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`, { signal: abortController.signal }),
        ]);
        if (!isCurrentJob()) return;
        setContext(jobContext);
        setSessions(sessionResult.sessions);
        setLoadedJobId(id);

        // Optional: history + known-fixes (failures don't collapse the page)
        const [historyOutcome, knownFixOutcome] = await Promise.allSettled([
          loadHistory({}, abortController.signal),
          iq200Api<{ results: KnownFix[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/known-fixes?limit=10`, { signal: abortController.signal }),
        ]);
        if (!isCurrentJob()) return;
        if (historyOutcome.status === "fulfilled") {
          setHistory(historyOutcome.value);
        } else if (!(historyOutcome.reason instanceof IQ200ApiError && historyOutcome.reason.isAbort)) {
          setHistoryError(historyOutcome.reason instanceof Error ? historyOutcome.reason.message : "History could not be loaded.");
        }
        if (knownFixOutcome.status === "fulfilled") {
          setKnownFixes(knownFixOutcome.value.results);
        }
      } catch (reason) {
        if (!isCurrentJob()) return;
        if (reason instanceof IQ200ApiError && reason.isAbort) return;
        const classified = classifyIQ200Error(reason);
        if (classified.category === "permission") setPermissionBlocked(true);
        setInitialLoadError(classified.message);
        setError(classified.message);
      } finally {
        if (isCurrentJob()) setLoading(false);
      }
    })();

    return () => {
      active = false;
      abortController.abort();
      submissionAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      nextRequestToken(submissionCorrelationRef.current);
      nextRequestToken(historyCorrelationRef.current);
      if (jobGenerationRef.current === generation) jobGenerationRef.current += 1;
    };
  }, [id]);

  async function startSession(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    const guard = submissionGuardRef.current;
    if (!tryAcquireSubmissionGuard(guard)) return;

    const { token, cleared } = beginSubmission(submissionCorrelationRef.current);
    const requestJobId = id;
    const generation = jobGenerationRef.current;
    const isCurrentJob = () => activeJobIdRef.current === requestJobId && jobGenerationRef.current === generation;
    setAssessment(cleared.assessment as ReasoningResponse | null);
    setReasoningMessage(cleared.reasoningMessage);
    setError(cleared.submissionError);
    setSaving(true);

    if (submissionAbortRef.current) submissionAbortRef.current.abort();
    const abortController = new AbortController();
    submissionAbortRef.current = abortController;

    try {
      const submitted = question.trim();
      const result = await iq200Api<{ session: Session }>(
        `/api/iq200/jobs/${encodeURIComponent(id)}/sessions`,
        { method: "POST", body: JSON.stringify({ question: submitted }), signal: abortController.signal }
      );

      try {
        const reasoning = await iq200Api<{ featureState?: string; message: string; response: ReasoningResponse | null }>(
          `/api/iq200/jobs/${encodeURIComponent(id)}/sessions/${encodeURIComponent(result.session.id)}/reason`,
          { method: "POST", body: JSON.stringify({ question: submitted }), signal: abortController.signal }
        );

        const { stale, update } = applySubmissionSuccess(
          submissionCorrelationRef.current, token, reasoning.response, reasoning.featureState, reasoning.message
        );
        if (!stale && isCurrentJob()) {
          setAssessment(update.assessment as ReasoningResponse | null);
          setReasoningMessage(update.reasoningMessage);
          setError(update.submissionError);
          setQuestion("");
        }
      } catch (reasonError) {
        if (reasonError instanceof IQ200ApiError && reasonError.isAbort) return;
        const { stale, update } = applySubmissionFailure(submissionCorrelationRef.current, token, reasonError);
        if (!stale && isCurrentJob()) {
          setAssessment(update.assessment as ReasoningResponse | null);
          setReasoningMessage(update.reasoningMessage);
          setError(update.submissionError);
          if (update.permissionBlocked) setPermissionBlocked(update.permissionBlocked);
        }
      }

      // Refresh session list after reasoning (success or failure)
      try {
        const refreshed = await refreshSessions(abortController.signal);
        if (isCurrentJob() && isCurrentRequest(submissionCorrelationRef.current, token)) setSessions(refreshed);
      } catch (refreshError) {
        if (!(refreshError instanceof IQ200ApiError && refreshError.isAbort)) {
          // Keep UI safe - don't fabricate state
        }
      }
    } catch (reason) {
      if (reason instanceof IQ200ApiError && reason.isAbort) return;
      const { stale, update } = applySubmissionFailure(submissionCorrelationRef.current, token, reason);
      if (!stale && isCurrentJob()) {
        setAssessment(update.assessment as ReasoningResponse | null);
        setReasoningMessage(update.reasoningMessage);
        setError(update.submissionError);
        if (update.permissionBlocked) setPermissionBlocked(update.permissionBlocked);
      }
    } finally {
      releaseSubmissionGuard(guard);
      if (submissionAbortRef.current === abortController) submissionAbortRef.current = null;
      if (isCurrentJob()) setSaving(false);
    }
  }

  async function searchHistory(event: React.FormEvent) {
    event.preventDefault();
    const requestKey = JSON.stringify([search.trim(), faultCode.trim(), vehicleOnly]);
    if (historyGuardRef.current.inFlight && historyRequestKeyRef.current === requestKey) return;
    const token = beginSubmission(historyCorrelationRef.current).token;
    historyAbortRef.current?.abort();
    const guard = createSubmissionGuard();
    tryAcquireSubmissionGuard(guard);
    historyGuardRef.current = guard;
    historyRequestKeyRef.current = requestKey;
    const abortController = new AbortController();
    historyAbortRef.current = abortController;
    const requestJobId = id;
    const generation = jobGenerationRef.current;
    const isCurrentJob = () => activeJobIdRef.current === requestJobId && jobGenerationRef.current === generation;

    try {
      setSearching(true);
      setHistoryError("");
      const results = await loadHistory({ q: search, faultCode, vehicleOnly }, abortController.signal);

      if (isCurrentJob() && isCurrentRequest(historyCorrelationRef.current, token)) {
        setHistory(results);
      }
    } catch (reason) {
      if (reason instanceof IQ200ApiError && reason.isAbort) return;
      if (isCurrentJob() && isCurrentRequest(historyCorrelationRef.current, token)) {
        const classified = classifyIQ200Error(reason);
        setHistoryError(classified.message);
      }
    } finally {
      releaseSubmissionGuard(guard);
      if (isCurrentJob() && isCurrentRequest(historyCorrelationRef.current, token)) {
        if (historyAbortRef.current === abortController) historyAbortRef.current = null;
        historyRequestKeyRef.current = null;
        setSearching(false);
      }
    }
  }

  if (loading || (context && loadedJobId !== id)) return <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6"><div className="mx-auto max-w-6xl rounded-3xl border bg-white p-8">Loading secure IQ200 job context…</div></main>;
  if (!context) return (
    <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8">
        <h1 className="text-2xl font-black">IQ200 unavailable</h1>
        <p className="mt-3 text-red-700">{initialLoadError || error || "This job could not be accessed."}</p>
        <div className="mt-6 flex gap-3">
          <Link href={`/jobs/${id}`} className="inline-block font-bold text-blue-700">Return to job</Link>
          {initialLoadError && (
            <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700">
              Retry
            </button>
          )}
        </div>
      </div>
    </main>
  );
  const vehicle = [context.job.vehicle.registrationNumber, context.job.vehicle.fleetNumber, context.job.vehicle.make, context.job.vehicle.model].filter(Boolean).join(" · ") || "No vehicle details recorded";

  return <main className="min-h-screen bg-[#f5f7fb] p-3 sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><Link href={`/jobs/${context.job.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ChevronLeft size={17} />Back to job</Link><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-600 p-3 text-white"><Bot size={28} /></span><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Technician Assist</p><h1 className="text-3xl font-black text-slate-950">ASK IQ200</h1></div></div><p className="mt-4 text-sm text-slate-500">Review authorized technical evidence, record a question, and inspect structured advisory results. IQ200 guidance is not a diagnosis or authorization to repair. AI diagnosis is not enabled in Phase 1, Phase 2, or Phase 3.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><ShieldCheck size={16} />Company-scoped</span></div><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Hosted reasoning unavailable.</strong> Live provider execution and automatic FleetFix actions are disabled. Use the evidence below to verify the current fault.</div></header>
    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Current job</p><h2 className="mt-1 text-xl font-black">Authorized technical context</h2></div><EvidenceBadge reference="CURRENT_JOB" /></div><div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Job</p><p className="mt-2 text-xl font-black">{context.job.number}</p><p className="mt-1 text-sm text-slate-600">{context.job.status || "Status not recorded"}</p></div><div className="rounded-2xl bg-slate-50 p-4 md:col-span-2"><p className="text-xs font-black uppercase text-slate-400">Vehicle</p><p className="mt-2 font-black text-slate-900">{vehicle}</p><p className="mt-1 text-sm text-slate-600">{[context.job.vehicle.type, context.job.vehicle.engineFamily].filter(Boolean).join(" · ") || "Vehicle type and engine family not recorded"}</p></div><div className="rounded-2xl bg-slate-50 p-4 md:col-span-3"><p className="text-xs font-black uppercase text-slate-400">Complaint / job description</p><p className="mt-2 whitespace-pre-wrap text-slate-800">{context.job.description || "No reported problem recorded."}</p>{context.job.location && <p className="mt-3 text-sm text-slate-500">Location: {context.job.location}</p>}</div><div className="rounded-2xl bg-slate-50 p-4"><Summary label="Fault codes" values={context.job.faultCodes} />{!context.job.faultCodes.length && <p className="text-sm text-slate-500">No fault codes recorded.</p>}</div><div className="rounded-2xl bg-slate-50 p-4"><Summary label="Technician notes" values={context.job.notes.map(note => note.text).filter(Boolean)} />{!context.job.notes.length && <p className="text-sm text-slate-500">No technician notes recorded.</p>}</div><div className="rounded-2xl bg-slate-50 p-4"><Summary label="Recorded diagnostics" values={context.job.diagnostics.map(item => [item.code, item.description, item.value].filter(value => value !== null && value !== "").join(": ")).filter(Boolean)} />{!context.job.diagnostics.length && <p className="text-sm text-slate-500">No diagnostics recorded.</p>}</div></div></section>

    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3"><History className="text-blue-600" /><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Relevant history</p><h2 className="text-xl font-black">Related repair history</h2><p className="text-sm text-slate-500">Historical repairs are supporting evidence only. Confirm the current fault before replacing parts.</p></div></div>
      <form onSubmit={searchHistory} className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"><input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} placeholder="Symptom, component or repair keyword" className="min-h-11 rounded-xl border px-4 text-sm" /><input value={faultCode} onChange={(event) => setFaultCode(event.target.value)} maxLength={64} placeholder="Fault code" className="min-h-11 rounded-xl border px-4 text-sm" /><button type="submit" disabled={searching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50"><Search size={16} />{searching ? "Searching…" : "Search"}</button><label className="flex items-center gap-2 text-sm font-bold text-slate-700 md:col-span-3"><input type="checkbox" checked={vehicleOnly} onChange={(event) => setVehicleOnly(event.target.checked)} className="h-4 w-4" />Same vehicle only</label></form>
      {historyError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{historyError}</p>}
      <div className="mt-5 space-y-4">{history.map((item, index) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><EvidenceBadge reference={`HISTORY_${index+1}`} /><Link href={`/jobs/${item.id}`} className="mt-2 block text-lg font-black text-blue-700">Job {item.jobNumber}</Link><p className="text-sm font-bold text-slate-700">{[item.make, item.model, item.registration, item.fleetNumber].filter(Boolean).join(" · ") || "Vehicle details unavailable"}</p></div><div className="text-left text-xs font-bold text-slate-500 sm:text-right">{item.date ? new Date(item.date).toLocaleDateString("en-ZA") : "Date unavailable"}<div className="mt-1">Relevance {item.relevanceScore}</div></div></div><p className="mt-3 text-xs font-black uppercase text-slate-500">Why this may be relevant</p><div className="mt-2 flex flex-wrap gap-2">{item.relevanceReasons.map((reason) => <span key={reason} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{reason}</span>)}</div><div className="mt-4 grid gap-3 text-sm md:grid-cols-2">{item.description && <Summary label="Reported" values={[item.description]} />}<Summary label="Technician finding" values={item.technicianFindings} /><Summary label="Repair performed" values={item.repairPerformed} /><Summary label="Parts previously used" values={item.partsUsed} /></div><div className={`mt-4 rounded-xl p-3 text-sm ${item.cancelled || item.incomplete || item.reopened ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}><strong>{item.cancelled ? "Cancelled" : item.reopened ? "Reopened work" : item.incomplete ? "Diagnosis/work incomplete" : "Completed history"}:</strong> {item.outcome || item.status || "No completion outcome recorded."}</div></article>)}{!history.length && !historyError && <div className="rounded-2xl border border-dashed p-8 text-center text-sm font-semibold text-slate-500">No relevant historical repairs were found. Continue with current-job evidence and approved procedures.</div>}</div>
    </section>
    <KnownFixesSection fixes={knownFixes} />

    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><Wrench className="text-blue-600" /><div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Technician question</p><h2 className="text-xl font-black">Record what you need to verify</h2><p className="text-sm text-slate-500">IQ200 is advisory only. It cannot authorize repairs, change this job, contact customers, or order parts.</p></div></div><form onSubmit={startSession} className="mt-5"><label className="text-sm font-bold text-slate-700">What are you seeing on the vehicle?<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={5} placeholder="Example: Truck is cranking but not starting. Where should I test next?" className="mt-2 w-full resize-y rounded-2xl border border-slate-300 p-4 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><p className="mt-2 text-xs text-slate-500">Maximum 2,000 characters. Submission remains permission-controlled and company-scoped.</p>{error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<button type="submit" disabled={saving || !question.trim()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-40 sm:w-auto"><Send size={17} />{saving ? "Saving question…" : "Save question and check availability"}</button></form>{reasoningMessage && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{reasoningMessage}</div>}</section>
    {assessment ? <ReasoningAssessment response={assessment} /> : <section className="rounded-3xl border border-dashed bg-white p-6 text-center"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Structured assessment</p><h2 className="mt-2 text-lg font-black">No assessment available</h2><p className="mt-2 text-sm text-slate-600">Review current evidence and approved Known Fixes. Hosted reasoning is disabled and no answer will be fabricated.</p></section>}
    {sessions.length > 0 && <section className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-black">Job IQ200 sessions</h2><div className="mt-4 space-y-3">{sessions.map((session) => <article key={session.id} className="rounded-2xl border bg-slate-50 p-4"><p className="whitespace-pre-wrap font-semibold text-slate-800">{session.initialQuestion || "Session started"}</p><p className="mt-2 break-all font-mono text-xs text-slate-500">Session ID: {session.id}</p><p className="mt-2 text-xs font-bold uppercase text-slate-500">{session.state || "CREATED"} · {session.responseStatus || "PENDING"}</p>{session.responseStatus === "AI_NOT_ENABLED" && <p className="mt-2 text-sm text-amber-800">Hosted assessment unavailable. The question is retained for technician workflow only.</p>}</article>)}</div></section>}
  </div></main>;
}

function Summary({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return <div><p className="text-xs font-black uppercase text-slate-400">{label}</p>{values.slice(0, 4).map((value, index) => <p key={`${label}-${index}`} className="mt-1 whitespace-pre-wrap text-slate-700">{value}</p>)}</div>;
}

function EvidenceBadge({ reference }: { reference: string }) { return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-black text-slate-700" title="Assessment evidence reference">Evidence {reference}</span> }

function KnownFixesSection({ fixes }: { fixes: KnownFix[] }) {
  return <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><ShieldCheck className="text-emerald-600" /><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Approved Known Fixes</p><h2 className="text-xl font-black">Applicable technical knowledge</h2><p className="text-sm text-slate-500">Only approved, active guidance is shown. Applicability is evidence, not confirmation of the current fault.</p></div></div><div className="mt-5 space-y-4">{fixes.map((fix, index) => <article key={fix.id} className="rounded-2xl border border-emerald-200 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase text-emerald-700">Approved Known Fix · Revision {fix.revision}</p><EvidenceBadge reference={`KNOWN_FIX_${index+1}`} /></div>{fix.safetyWarnings && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>Safety warning:</strong> {fix.safetyWarnings}</div>}<h3 className="mt-3 text-lg font-black">{fix.title}</h3><p className="text-sm text-slate-600">{[fix.category, fix.systemComponent, fix.vehicleMake, fix.vehicleModel, fix.vehicleType, fix.engineFamily].filter(Boolean).join(" · ") || "Generic applicability"}</p><p className="mt-3 text-xs font-black uppercase text-slate-500">Why this may apply · Relevance {fix.relevanceScore}</p><div className="mt-2 flex flex-wrap gap-2">{fix.relevanceReasons.map(reason => <span key={reason} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{reason}</span>)}</div><div className="mt-4 grid gap-3 text-sm md:grid-cols-2"><Summary label="Symptoms" values={fix.symptoms} /><Summary label="Fault codes" values={fix.faultCodes} />{fix.findingsConditions && <Summary label="Conditions to confirm" values={[fix.findingsConditions]} />} {fix.diagnosticProcedure && <Summary label="Diagnostic procedure" values={[fix.diagnosticProcedure]} />} {fix.expectedValues && <Summary label="Expected values" values={[fix.expectedValues]} />}<Summary label="Required tools" values={fix.requiredTools} />{fix.repairProcedure && <Summary label="Approved repair procedure" values={[fix.repairProcedure]} />}<Summary label="Parts/components" values={fix.partsComponents} /></div>{fix.technicalCautions && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><strong>Technical caution:</strong> {fix.technicalCautions}</p>}{fix.sourceReference && <p className="mt-3 text-xs font-bold text-slate-500">Source: {fix.sourceReference}</p>}</article>)}{!fixes.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm font-semibold text-slate-500">No approved active Known Fixes match this job. Draft and inactive guidance is never shown here.</p>}</div></section>;
}

function ReasoningAssessment({ response }: { response: ReasoningResponse }) { return <section className="rounded-3xl border border-blue-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-black uppercase tracking-widest text-blue-600">IQ200 Assessment · Structured assessment</p><h2 className="mt-2 text-xl font-black">{response.summary}</h2><p className="mt-2 text-sm font-black">Overall confidence: {response.confidence}</p><p className="mt-2 text-sm text-slate-600">Advisory evidence only. Confirm the current fault and follow authorized workshop procedures before repair.</p><div className="mt-5 grid gap-5 md:grid-cols-2"><Summary label="Current observations" values={response.observations} /><Summary label="Missing information / Information still needed" values={response.missingInformation} /><Summary label="Safety warnings" values={response.safetyWarnings} /><Summary label="Limitations" values={response.limitations} /></div><div className="mt-5 space-y-3"><h3 className="font-black">Possible causes / hypotheses</h3>{response.hypotheses.map((item, index) => <article key={`${item.title}-${index}`} className="rounded-2xl bg-slate-50 p-4"><p className="font-black">{item.title} · {item.confidence}</p><p className="mt-1 text-sm">{item.explanation}</p><Summary label="Evidence references" values={item.evidenceReferences} /><Summary label="Contradictions" values={item.contradictions} /><Summary label="Recommended checks" values={item.recommendedChecks} /></article>)}</div><div className="mt-5 space-y-3"><h3 className="font-black">Recommended checks / Checks to perform next</h3>{response.checks.map((item, index) => <article key={`${item.description}-${index}`} className="rounded-2xl border p-4"><p className="font-bold">{item.description}</p><p className="mt-1 text-sm text-slate-600">{item.purpose}</p>{item.expectedResult && <p className="mt-2 text-sm"><strong>Expected result:</strong> {item.expectedResult}</p>}{item.safetyNote && <p className="mt-2 text-sm text-red-800"><strong>Safety note:</strong> {item.safetyNote}</p>}<p className="mt-2 text-xs font-bold text-slate-500">Evidence source: {item.evidenceSource}</p></article>)}</div><div className="mt-5"><h3 className="font-black">Evidence used</h3>{response.evidenceUsed.map((item, index) => <div key={`${item.reference}-${index}`} className="mt-3 rounded-xl border p-3 text-sm"><EvidenceBadge reference={item.reference} /><p className="mt-2"><strong>{item.category}:</strong> {item.detail}</p></div>)}</div></section> }
