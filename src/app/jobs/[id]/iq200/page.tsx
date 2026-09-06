"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Bot, ChevronLeft, History, Search, Send, ShieldCheck, Wrench } from "lucide-react";
import { iq200Api } from "@/lib/iq200/client";

type Context = { companyId: string; job: { id: string; number: string; status: string; description: string; location: string; vehicle: { registrationNumber: string; fleetNumber: string; make: string; model: string; type: string } }; currentUser: { id: string; name: string } };
type Session = { id: string; initialQuestion?: string; state?: string; responseStatus?: string; createdAt?: string };
type HistoricalResult = { id: string; jobNumber: string; date: string | null; registration: string; fleetNumber: string; make: string; model: string; description: string; faultCodes: string[]; technicianFindings: string[]; repairPerformed: string[]; partsUsed: string[]; status: string; outcome: string; cancelled: boolean; incomplete: boolean; reopened: boolean; relevanceScore: number; relevanceReasons: string[] };
type KnownFix = { id:string; title:string; vehicleMake:string; vehicleModel:string; vehicleType:string; engineFamily:string; symptoms:string[]; faultCodes:string[]; diagnosticProcedure:string; expectedValues:string; repairProcedure:string; partsComponents:string[]; safetyWarnings:string; technicalCautions:string; sourceReference:string; revision:number; relevanceReasons:string[] };
type ReasoningResponse={summary:string;observations:string[];hypotheses:Array<{title:string;explanation:string;confidence:"LOW"|"MEDIUM"|"HIGH";evidenceReferences:string[];contradictions:string[];recommendedChecks:string[]}>;checks:Array<{description:string;purpose:string;expectedResult:string;safetyNote:string;evidenceSource:string}>;safetyWarnings:string[];missingInformation:string[];evidenceUsed:Array<{category:string;reference:string;detail:string}>;confidence:"LOW"|"MEDIUM"|"HIGH";limitations:string[]};

export default function IQ200JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [context, setContext] = useState<Context | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<HistoricalResult[]>([]);
  const [knownFixes, setKnownFixes] = useState<KnownFix[]>([]);
  const [assessment,setAssessment]=useState<ReasoningResponse|null>(null);
  const [reasoningMessage,setReasoningMessage]=useState("");
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [vehicleOnly, setVehicleOnly] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  async function loadHistory(filters: { q?: string; faultCode?: string; vehicleOnly?: boolean } = {}) {
    const query = new URLSearchParams({ limit: "10" });
    if (filters.q?.trim()) query.set("q", filters.q.trim());
    if (filters.faultCode?.trim()) query.set("faultCode", filters.faultCode.trim());
    if (filters.vehicleOnly) query.set("vehicleOnly", "true");
    const result = await iq200Api<{ results: HistoricalResult[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/history?${query}`);
    setHistory(result.results);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      iq200Api<Context>(`/api/iq200/jobs/${encodeURIComponent(id)}/context`),
      iq200Api<{ sessions: Session[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`),
      iq200Api<{ results: HistoricalResult[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/history?limit=10`),
      iq200Api<{ results: KnownFix[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/known-fixes?limit=10`),
    ]).then(([jobContext, sessionResult, historyResult, knownFixResult]) => {
      if (!active) return;
      setContext(jobContext); setSessions(sessionResult.sessions); setHistory(historyResult.results); setKnownFixes(knownFixResult.results);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "IQ200 could not be opened."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  async function startSession(event: React.FormEvent) {
    event.preventDefault(); if (!question.trim()) return;
    try {
      setSaving(true); setError("");
      const submitted=question.trim();
      const result = await iq200Api<{ session: Session }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`, { method: "POST", body: JSON.stringify({ question: submitted }) });
      setSessions((current) => [result.session, ...current]);
      const reasoning=await iq200Api<{message:string;response:ReasoningResponse|null}>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions/${encodeURIComponent(result.session.id)}/reason`,{method:"POST",body:JSON.stringify({question:submitted})});
      setAssessment(reasoning.response);setReasoningMessage(reasoning.message);setQuestion("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The IQ200 session could not be created."); }
    finally { setSaving(false); }
  }

  async function searchHistory(event: React.FormEvent) {
    event.preventDefault();
    try { setSearching(true); setHistoryError(""); await loadHistory({ q: search, faultCode, vehicleOnly }); }
    catch (reason) { setHistoryError(reason instanceof Error ? reason.message : "Repair history could not be searched."); }
    finally { setSearching(false); }
  }

  if (loading) return <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6"><div className="mx-auto max-w-6xl rounded-3xl border bg-white p-8">Loading secure IQ200 job context…</div></main>;
  if (!context) return <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6"><div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8"><h1 className="text-2xl font-black">IQ200 unavailable</h1><p className="mt-3 text-red-700">{error || "This job could not be accessed."}</p><Link href={`/jobs/${id}`} className="mt-6 inline-block font-bold text-blue-700">Return to job</Link></div></main>;
  const vehicle = [context.job.vehicle.registrationNumber, context.job.vehicle.fleetNumber, context.job.vehicle.make, context.job.vehicle.model].filter(Boolean).join(" · ") || "No vehicle details recorded";

  return <main className="min-h-screen bg-[#f5f7fb] p-3 sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><Link href={`/jobs/${context.job.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ChevronLeft size={17}/>Back to job</Link><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-600 p-3 text-white"><Bot size={28}/></span><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Technician Assist</p><h1 className="text-3xl font-black text-slate-950">ASK IQ200</h1></div></div><p className="mt-4 text-sm text-slate-500">Secure job context, related history, and approved knowledge. AI diagnosis is not enabled in Phase 1, Phase 2, or Phase 3. Phase 4 live AI reasoning remains disabled by default.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><ShieldCheck size={16}/>Company-scoped</span></div></header>
    <section className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase text-slate-400">Job</p><p className="mt-2 text-xl font-black">{context.job.number}</p><p className="mt-1 text-sm text-slate-600">{context.job.status || "Status not recorded"}</p></div><div className="rounded-2xl border bg-white p-5 md:col-span-2"><p className="text-xs font-black uppercase text-slate-400">Vehicle</p><p className="mt-2 font-black text-slate-900">{vehicle}</p><p className="mt-1 text-sm text-slate-600">{context.job.vehicle.type || "Vehicle type not recorded"}</p></div><div className="rounded-2xl border bg-white p-5 md:col-span-3"><p className="text-xs font-black uppercase text-slate-400">Reported Problem</p><p className="mt-2 whitespace-pre-wrap text-slate-800">{context.job.description || "No reported problem recorded."}</p>{context.job.location && <p className="mt-3 text-sm text-slate-500">Location: {context.job.location}</p>}</div></section>

    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-3"><History className="text-blue-600"/><div><h2 className="text-xl font-black">Related repair history</h2><p className="text-sm text-slate-500">Previous jobs may be relevant context; they are not a diagnosis for this job.</p></div></div>
      <form onSubmit={searchHistory} className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"><input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} placeholder="Symptom, component or repair keyword" className="min-h-11 rounded-xl border px-4 text-sm"/><input value={faultCode} onChange={(event) => setFaultCode(event.target.value)} maxLength={64} placeholder="Fault code" className="min-h-11 rounded-xl border px-4 text-sm"/><button disabled={searching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50"><Search size={16}/>{searching ? "Searching…" : "Search"}</button><label className="flex items-center gap-2 text-sm font-bold text-slate-700 md:col-span-3"><input type="checkbox" checked={vehicleOnly} onChange={(event) => setVehicleOnly(event.target.checked)} className="h-4 w-4"/>Same vehicle only</label></form>
      {historyError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{historyError}</p>}
      <div className="mt-5 space-y-4">{history.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><Link href={`/jobs/${item.id}`} className="text-lg font-black text-blue-700">Job {item.jobNumber}</Link><p className="text-sm font-bold text-slate-700">{[item.make, item.model, item.registration, item.fleetNumber].filter(Boolean).join(" · ") || "Vehicle details unavailable"}</p></div><div className="text-left text-xs font-bold text-slate-500 sm:text-right">{item.date ? new Date(item.date).toLocaleDateString("en-ZA") : "Date unavailable"}<div className="mt-1">Relevance {item.relevanceScore}</div></div></div><div className="mt-3 flex flex-wrap gap-2">{item.relevanceReasons.map((reason) => <span key={reason} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{reason}</span>)}</div><div className="mt-4 grid gap-3 text-sm md:grid-cols-2">{item.description && <Summary label="Reported" values={[item.description]}/>}<Summary label="Technician finding" values={item.technicianFindings}/><Summary label="Repair performed" values={item.repairPerformed}/><Summary label="Previous job used" values={item.partsUsed}/></div><div className={`mt-4 rounded-xl p-3 text-sm ${item.cancelled || item.incomplete || item.reopened ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}><strong>{item.cancelled ? "Cancelled" : item.reopened ? "Reopened work" : item.incomplete ? "Diagnosis/work incomplete" : "Completed history"}:</strong> {item.outcome || item.status || "No completion outcome recorded."}</div></article>)}{!history.length && !historyError && <div className="rounded-2xl border border-dashed p-8 text-center text-sm font-semibold text-slate-500">No related repair history was found within the bounded search.</div>}</div>
    </section>
    <KnownFixesSection fixes={knownFixes}/>

    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><Wrench className="text-blue-600"/><div><h2 className="text-xl font-black">Start a technician-assist session</h2><p className="text-sm text-slate-500">Your question and structured response stay separate from normal job notes.</p></div></div><form onSubmit={startSession} className="mt-5"><label className="text-sm font-bold text-slate-700">What are you seeing on the vehicle?<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={5} placeholder="Example: Truck is cranking but not starting. Where should I test next?" className="mt-2 w-full resize-y rounded-2xl border border-slate-300 p-4 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></label>{error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<button disabled={saving || !question.trim()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-40 sm:w-auto"><Send size={17}/>{saving ? "Creating assessment…" : "Ask IQ200"}</button></form>{reasoningMessage&&<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{reasoningMessage}</div>}</section>
    {assessment&&<ReasoningAssessment response={assessment}/>}
    {sessions.length > 0 && <section className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-black">Job IQ200 sessions</h2><div className="mt-4 space-y-3">{sessions.map((session) => <article key={session.id} className="rounded-2xl border bg-slate-50 p-4"><p className="whitespace-pre-wrap font-semibold text-slate-800">{session.initialQuestion || "Session started"}</p><p className="mt-2 text-xs font-bold uppercase text-slate-500">Context ready · AI response not enabled</p></article>)}</div></section>}
  </div></main>;
}

function Summary({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return <div><p className="text-xs font-black uppercase text-slate-400">{label}</p>{values.slice(0, 4).map((value, index) => <p key={`${label}-${index}`} className="mt-1 whitespace-pre-wrap text-slate-700">{value}</p>)}</div>;
}

function KnownFixesSection({ fixes }: { fixes: KnownFix[] }) {
  return <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><ShieldCheck className="text-emerald-600"/><div><h2 className="text-xl font-black">Known Fixes / Technical Knowledge</h2><p className="text-sm text-slate-500">Approved technical guidance that may apply; it is not confirmation of the current fault.</p></div></div><div className="mt-5 space-y-4">{fixes.map((fix)=><article key={fix.id} className="rounded-2xl border border-emerald-200 p-5">{fix.safetyWarnings&&<div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><strong>Safety warning:</strong> {fix.safetyWarnings}</div>}<p className="text-xs font-black uppercase text-emerald-700">Approved Known Fix · Revision {fix.revision}</p><h3 className="text-lg font-black">{fix.title}</h3><p className="text-sm text-slate-600">{[fix.vehicleMake,fix.vehicleModel,fix.vehicleType,fix.engineFamily].filter(Boolean).join(" · ")||"Generic applicability"}</p><div className="mt-3 flex flex-wrap gap-2">{fix.relevanceReasons.map(reason=><span key={reason} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{reason}</span>)}</div><div className="mt-4 grid gap-3 text-sm md:grid-cols-2"><Summary label="Symptoms" values={fix.symptoms}/><Summary label="Fault codes" values={fix.faultCodes}/>{fix.diagnosticProcedure&&<Summary label="Diagnostic procedure" values={[fix.diagnosticProcedure]}/>} {fix.expectedValues&&<Summary label="Expected values" values={[fix.expectedValues]}/>} {fix.repairProcedure&&<Summary label="Approved repair procedure" values={[fix.repairProcedure]}/>}<Summary label="Parts/components" values={fix.partsComponents}/></div>{fix.technicalCautions&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><strong>Technical caution:</strong> {fix.technicalCautions}</p>}{fix.sourceReference&&<p className="mt-3 text-xs font-bold text-slate-500">Source: {fix.sourceReference}</p>}</article>)}{!fixes.length&&<p className="rounded-2xl border border-dashed p-8 text-center text-sm font-semibold text-slate-500">No approved Known Fixes match this job.</p>}</div></section>;
}

function ReasoningAssessment({response}:{response:ReasoningResponse}){return <section className="rounded-3xl border border-blue-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-black uppercase tracking-widest text-blue-600">IQ200 Assessment</p><h2 className="mt-2 text-xl font-black">{response.summary}</h2><p className="mt-2 text-sm font-black">Confidence: {response.confidence}</p><div className="mt-5 grid gap-5 md:grid-cols-2"><Summary label="Current observations" values={response.observations}/><Summary label="Information still needed" values={response.missingInformation}/><Summary label="Safety warnings" values={response.safetyWarnings}/><Summary label="Limitations" values={response.limitations}/></div><div className="mt-5 space-y-3"><h3 className="font-black">Possible causes / hypotheses</h3>{response.hypotheses.map((item,index)=><article key={`${item.title}-${index}`} className="rounded-2xl bg-slate-50 p-4"><p className="font-black">{item.title} · {item.confidence}</p><p className="mt-1 text-sm">{item.explanation}</p><Summary label="Evidence" values={item.evidenceReferences}/><Summary label="Against / contradictions" values={item.contradictions}/></article>)}</div><div className="mt-5 space-y-3"><h3 className="font-black">Checks to perform next</h3>{response.checks.map((item,index)=><article key={`${item.description}-${index}`} className="rounded-2xl border p-4"><p className="font-bold">{item.description}</p><p className="mt-1 text-sm text-slate-600">{item.purpose}</p>{item.expectedResult&&<p className="mt-2 text-sm"><strong>Expected:</strong> {item.expectedResult}</p>}{item.safetyNote&&<p className="mt-2 text-sm text-red-800"><strong>Safety:</strong> {item.safetyNote}</p>}<p className="mt-2 text-xs font-bold text-slate-500">Source: {item.evidenceSource}</p></article>)}</div><div className="mt-5"><h3 className="font-black">Evidence used</h3>{response.evidenceUsed.map((item,index)=><p key={`${item.reference}-${index}`} className="mt-2 text-sm"><strong>{item.category} · {item.reference}:</strong> {item.detail}</p>)}</div></section>}
