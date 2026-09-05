"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Bot, ChevronLeft, Send, ShieldCheck, Wrench } from "lucide-react";
import { iq200Api } from "@/lib/iq200/client";

type Context = {
  companyId: string;
  job: {
    id: string; number: string; status: string; description: string; location: string; bookingDateTime: string | null;
    customer: { id: string; name: string } | null;
    vehicle: { registrationNumber: string; fleetNumber: string; make: string; model: string; type: string };
    assignedTechnicians: Array<{ id: string; name: string }>;
    previousJobNumber: string; statusHistory: unknown[]; notes: Array<{ id: string; text: string; author: string; createdAt: string | null }>; diagnostics: unknown[];
  };
  currentUser: { id: string; name: string };
};
type Session = { id: string; initialQuestion?: string; state?: string; responseStatus?: string; createdAt?: string };

export default function IQ200JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [context, setContext] = useState<Context | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      iq200Api<Context>(`/api/iq200/jobs/${encodeURIComponent(id)}/context`),
      iq200Api<{ sessions: Session[] }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`),
    ]).then(([jobContext, sessionResult]) => {
      if (!active) return;
      setContext(jobContext);
      setSessions(sessionResult.sessions);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "IQ200 could not be opened."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  async function startSession(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    try {
      setSaving(true); setError("");
      const result = await iq200Api<{ session: Session }>(`/api/iq200/jobs/${encodeURIComponent(id)}/sessions`, { method: "POST", body: JSON.stringify({ question: question.trim() }) });
      setSessions((current) => [result.session, ...current]);
      setQuestion("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The IQ200 session could not be created.");
    } finally { setSaving(false); }
  }

  if (loading) return <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6"><div className="mx-auto max-w-6xl rounded-3xl border bg-white p-8">Loading secure IQ200 job context…</div></main>;
  if (!context) return <main className="min-h-screen bg-[#f5f7fb] p-4 sm:p-6"><div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8"><h1 className="text-2xl font-black">IQ200 unavailable</h1><p className="mt-3 text-red-700">{error || "This job could not be accessed."}</p><Link href={`/jobs/${id}`} className="mt-6 inline-block font-bold text-blue-700">Return to job</Link></div></main>;

  const vehicle = [context.job.vehicle.registrationNumber, context.job.vehicle.fleetNumber, context.job.vehicle.make, context.job.vehicle.model].filter(Boolean).join(" · ") || "No vehicle details recorded";
  return <main className="min-h-screen bg-[#f5f7fb] p-3 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <Link href={`/jobs/${context.job.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ChevronLeft size={17}/>Back to job</Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-600 p-3 text-white"><Bot size={28}/></span><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Technician Assist</p><h1 className="text-3xl font-black text-slate-950">ASK IQ200</h1></div></div><p className="mt-4 text-sm text-slate-500">Securely grounded in this FleetFix job. AI diagnosis is not enabled in Phase 1.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><ShieldCheck size={16}/>Company-scoped</span></div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-black uppercase text-slate-400">Job</p><p className="mt-2 text-xl font-black">{context.job.number}</p><p className="mt-1 text-sm text-slate-600">{context.job.status || "Status not recorded"}</p></div>
        <div className="rounded-2xl border bg-white p-5 md:col-span-2"><p className="text-xs font-black uppercase text-slate-400">Vehicle</p><p className="mt-2 font-black text-slate-900">{vehicle}</p><p className="mt-1 text-sm text-slate-600">{context.job.vehicle.type || "Vehicle type not recorded"}</p></div>
        <div className="rounded-2xl border bg-white p-5 md:col-span-3"><p className="text-xs font-black uppercase text-slate-400">Reported Problem</p><p className="mt-2 whitespace-pre-wrap text-slate-800">{context.job.description || "No reported problem recorded."}</p>{context.job.location && <p className="mt-3 text-sm text-slate-500">Location: {context.job.location}</p>}</div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3"><Wrench className="text-blue-600"/><div><h2 className="text-xl font-black">Start a technician-assist session</h2><p className="text-sm text-slate-500">Your question will be stored separately from normal job notes.</p></div></div>
        <form onSubmit={startSession} className="mt-5"><label className="text-sm font-bold text-slate-700">What are you seeing on the vehicle?<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} rows={5} placeholder="Example: Truck is cranking but not starting. Where should I test next?" className="mt-2 w-full resize-y rounded-2xl border border-slate-300 p-4 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>{error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<button disabled={saving || !question.trim()} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-black text-white disabled:opacity-40 sm:w-auto"><Send size={17}/>{saving ? "Creating session…" : "Ask IQ200"}</button></form>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Phase 1 controlled placeholder:</strong> job context and the technician session are saved securely. No diagnostic answer is generated yet.</div>
      </section>

      {sessions.length > 0 && <section className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-black">Job IQ200 sessions</h2><div className="mt-4 space-y-3">{sessions.map((session) => <article key={session.id} className="rounded-2xl border bg-slate-50 p-4"><p className="whitespace-pre-wrap font-semibold text-slate-800">{session.initialQuestion || "Session started"}</p><p className="mt-2 text-xs font-bold uppercase text-slate-500">Context ready · AI response not enabled</p></article>)}</div></section>}
    </div>
  </main>;
}
