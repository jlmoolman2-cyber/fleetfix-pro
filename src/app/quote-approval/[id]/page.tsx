"use client";

import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { use, useEffect, useRef, useState } from "react";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

export default function QuoteApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [quote, setQuote] = useState<any>(null);
  const [name, setName] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "quotes", id)).then((snapshot) => {
      if (snapshot.exists()) setQuote({ id: snapshot.id, ...snapshot.data() });
    }).finally(() => setLoading(false));
  }, [id]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d")!;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d")!;
    const position = point(event);
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#0f172a";
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasSignature(true);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function approve() {
    if (!name.trim() || !hasSignature || !canvasRef.current) return;
    setSaving(true);
    try {
      const signature = canvasRef.current.toDataURL("image/png");
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "quotes", id), {
        status: "open",
        approved: true,
        approvalSource: "customer",
        customerApprovedByName: name.trim(),
        customerApprovalSignature: signature,
        customerApprovedAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
      });
      await Promise.all([
        addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
          type: "customer_quote_approval", title: "Customer approved quote", message: `${name.trim()} approved ${quote.quoteNumber || "a quote"}.`,
          quoteId: id, quoteNumber: quote.quoteNumber || "", sourcePath: `/quotes/${id}`, status: "active", finalized: false,
          customerName: name.trim(), createdAt: serverTimestamp(),
        }),
        addDoc(collection(clientDb, "companies", COMPANY_ID, "quotes", id, "history"), {
          type: "customer_approval", description: `Quote approved by ${name.trim()}.`, customerName: name.trim(), signature,
          createdAt: serverTimestamp(),
        }),
      ]);
      setQuote((current: any) => ({ ...current, status: "open", approved: true, customerApprovedByName: name.trim(), customerApprovalSignature: signature }));
      setMessage("Thank you. This quote has been approved successfully.");
    } catch (error) {
      console.error(error);
      setMessage("The quote could not be approved. Please contact FleetFix.");
    } finally { setSaving(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6">Loading quote…</main>;
  if (!quote) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6">Quote not found.</main>;
  if (quote.approved) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6"><section className="w-full max-w-xl rounded-3xl border bg-white p-8 text-center shadow"><h1 className="text-3xl font-black text-emerald-700">Quote Approved</h1><p className="mt-3">Approved by <strong>{quote.customerApprovedByName || quote.approvedByName || "Authorized user"}</strong>.</p>{quote.customerApprovalSignature && <img src={quote.customerApprovalSignature} alt="Customer signature" className="mx-auto mt-6 h-28 max-w-full object-contain" />}</section></main>;

  return <main className="min-h-screen bg-slate-100 p-6"><section className="mx-auto max-w-2xl rounded-3xl border bg-white p-8 shadow"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">FleetFix Quote Approval</p><h1 className="mt-2 text-3xl font-black">Approve {quote.quoteNumber || `Quote ${id.slice(0, 8).toUpperCase()}`}</h1><div className="mt-6 rounded-2xl bg-slate-50 p-5"><p className="font-bold">Customer: {quote.customerName || "Customer"}</p><p className="mt-2 text-2xl font-black">Total: R {Number(quote.grandTotal ?? quote.total ?? 0).toFixed(2)}</p></div><label className="mt-6 block text-sm font-black">Full Name *</label><input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-4" placeholder="Enter your full name" /><div className="mt-6 flex items-center justify-between"><label className="text-sm font-black">Signature *</label><button type="button" onClick={clearSignature} className="rounded-lg border px-3 py-2 text-sm font-bold">Clear</button></div><canvas ref={canvasRef} width={900} height={240} onPointerDown={start} onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} className="mt-2 h-40 w-full touch-none rounded-xl border-2 bg-white" aria-label="Customer signature pad" /><button type="button" disabled={saving || !name.trim() || !hasSignature} onClick={() => void approve()} className="mt-6 h-14 w-full rounded-xl bg-emerald-600 font-black text-white disabled:opacity-40">{saving ? "Approving…" : "Approve Quote"}</button>{message && <p className="mt-4 text-center font-bold">{message}</p>}</section></main>;
}
