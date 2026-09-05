"use client";

import { useCallback, useEffect, useState } from "react";
import { communicationExecutionApi } from "@/lib/communicationExecutions/client";

type Execution = { id: string; createdAt: string | null; sourceEntityType: string; sourceEntityId: string; trigger: string; recipientDisplay: string; normalizedDestination: string | null; channel: string; templateId: string; status: string; plannedAt: string; reason: string | null; sent: false };
const label = (value: string) => String(value || "").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CommunicationExecutionsPage() {
  const [items, setItems] = useState<Execution[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { const response = await communicationExecutionApi<{ items: Execution[]; transportEnabled: false }>("/api/communication-executions"); setItems(response.items); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Executions could not be loaded."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="min-h-screen bg-[#f5f7fb] p-6"><div className="mb-6"><p className="text-xs font-black uppercase tracking-widest text-blue-600">Communications Setup</p><h1 className="text-3xl font-black">Communication Executions</h1><p className="mt-1 text-sm text-gray-500">Inspection only. Transport execution is disabled.</p></div>
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 font-black text-amber-900">PREPARED ONLY — NO MESSAGE SENT</div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-4">Created</th><th>Source</th><th>Trigger</th><th>Recipient</th><th>Channel</th><th>Template</th><th>Status</th><th className="p-4">Planned / reason</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id} className="border-t"><td className="p-4">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Pending"}</td><td>{label(item.sourceEntityType)} · {item.sourceEntityId}</td><td>{label(item.trigger)}</td><td><strong>{item.recipientDisplay}</strong><div className="text-xs text-gray-500">{item.normalizedDestination || "Not available"}</div></td><td>{label(item.channel)}</td><td>{item.templateId}</td><td><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-black">{item.status}</span><div className="text-xs">sent=false</div></td><td className="p-4">{item.plannedAt ? new Date(item.plannedAt).toLocaleString() : "—"}<div className="text-xs text-gray-500">{item.reason || "Ready for a future gated hand-off"}</div></td></tr>)}
      {!items.length && <tr><td colSpan={8} className="p-10 text-center text-gray-500">{loading ? "Loading…" : "No prepared executions."}</td></tr>}
    </tbody></table></div></div>;
}
