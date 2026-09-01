"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { COMPANY_ID } from "@/lib/company";
import { clientDb, storage } from "@/lib/firebaseClient";
import { MESSAGE_TEMPLATE_MODULES } from "@/lib/messageTemplateModules";

const moduleCollections: Record<string, string> = { JobCard: "jobs", Query: "queries", Quote: "quotes", Invoice: "invoices", "Purchase Order": "purchase_orders", GRV: "grvs", Customer: "customers", Supplier: "suppliers", Inventory: "inventory" };

export default function ComposeMessagePage() {
  return <Suspense fallback={<main className="p-8 font-bold text-gray-500">Loading message composer…</main>}><ComposeMessage /></Suspense>;
}

function ComposeMessage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialModule = searchParams.get("module") || "General";
  const documentId = searchParams.get("documentId") || "";
  const explicitJobId = searchParams.get("jobId") || "";
  const requestedTemplateId = searchParams.get("templateId") || "";
  const composeNote = searchParams.get("notes") || searchParams.get("comment") || searchParams.get("body") || "";
  const requestedRecipients = searchParams.get("recipients") || "";
  const [module, setModule] = useState(initialModule);
  const [record, setRecord] = useState<any>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [showRecipients, setShowRecipients] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(() => searchParams.get("subject") || "");
  const [body, setBody] = useState(() => searchParams.get("body") || "");
  const [sendEmail, setSendEmail] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      const [templateSnapshot, userSnapshot, customerSnapshot, supplierSnapshot] = await Promise.all([
        getDocs(collection(clientDb, "companies", COMPANY_ID, "messageTemplates")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "customers")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "suppliers")),
      ]);
      const loadedTemplates = templateSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as any));
      setTemplates(loadedTemplates);
      const userRecipients = userSnapshot.docs.map((entry) => ({ id: `user:${entry.id}`, sourceId: entry.id, type: "User", ...entry.data() }));
      let loadedRecord: any = {};
      const collectionName = moduleCollections[initialModule];
      if (documentId && collectionName) {
        const snapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, collectionName, documentId));
        if (snapshot.exists()) loadedRecord = { id: snapshot.id, ...snapshot.data() };
      }
      setRecord(loadedRecord);
      const requestedTemplate = loadedTemplates.find((item) => item.id === requestedTemplateId);
      if (requestedTemplate) {
        const loadedJobId = explicitJobId || loadedRecord.jobId || (initialModule === "JobCard" ? documentId : "");
        const tags = messageTags(loadedRecord, initialModule, documentId, loadedJobId, {
          notes: composeNote,
          comment: composeNote,
        });
        const apply = (value: string) => Object.entries(tags).reduce(
          (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, String(replacement || "")),
          String(value || "")
        );
        setTemplateId(requestedTemplate.id);
        setSubject(apply(requestedTemplate.subject || requestedTemplate.name || ""));
        setBody(apply(requestedTemplate.htmlBody || ""));
      }
      const baseRecipients: any[] = [...userRecipients];
      const isSupplierDocument = initialModule === "Purchase Order";
      const isCustomerDocument = ["JobCard", "Quote", "Invoice"].includes(initialModule);

      if (isSupplierDocument) {
        const supplierDocument = supplierSnapshot.docs.find((entry) => entry.id === loadedRecord.supplierId) || supplierSnapshot.docs.find((entry) => String(entry.data().supplierName || "") === String(loadedRecord.supplier || loadedRecord.supplierName || ""));
        if (supplierDocument) {
          const supplierData = supplierDocument.data();
          baseRecipients.push({ id: `supplier:${supplierDocument.id}`, sourceId: supplierDocument.id, type: "Supplier Contact", ...supplierData });
          const contactSnapshot = await getDocs(collection(clientDb, "companies", COMPANY_ID, "suppliers", supplierDocument.id, "contacts"));
          baseRecipients.push(...contactSnapshot.docs.map((entry) => ({ id: `supplier-contact:${entry.id}`, sourceId: entry.id, type: "Supplier Contact", supplierId: supplierDocument.id, ...entry.data() })));
        }
      } else if (isCustomerDocument && loadedRecord.customerId) {
        const customerDocument = customerSnapshot.docs.find((entry) => entry.id === loadedRecord.customerId);
        if (customerDocument) baseRecipients.push({ id: `customer:${customerDocument.id}`, sourceId: customerDocument.id, type: "Customer Contact", ...customerDocument.data() });
        const contactSnapshot = await getDocs(collection(clientDb, "companies", COMPANY_ID, "customers", loadedRecord.customerId, "contacts"));
        baseRecipients.push(...contactSnapshot.docs.map((entry) => ({ id: `contact:${entry.id}`, sourceId: entry.id, type: "Customer Contact", customerId: loadedRecord.customerId, ...entry.data() })));
      } else if (!documentId) {
        baseRecipients.push(
          ...customerSnapshot.docs.map((entry) => ({ id: `customer:${entry.id}`, sourceId: entry.id, type: "Customer", ...entry.data() })),
          ...supplierSnapshot.docs.map((entry) => ({ id: `supplier:${entry.id}`, sourceId: entry.id, type: "Supplier", ...entry.data() })),
        );
      }
      setRecipients(baseRecipients);
      const preferred = baseRecipients.find((item: any) => item.sourceId === loadedRecord.customerContactId || item.sourceId === loadedRecord.contactId || item.sourceId === loadedRecord.supplierContactId);
      const requestedRecipientIds: string[] = [];
      if (requestedRecipients.includes("customer")) {
        const customerRecipient = preferred || baseRecipients.find((item: any) => item.id === `customer:${loadedRecord.customerId}`);
        if (customerRecipient) requestedRecipientIds.push(customerRecipient.id);
      }
      if (requestedRecipients.includes("assigned-users")) {
        const assignedIds = new Set([
          ...(Array.isArray(loadedRecord.assignedUserIds) ? loadedRecord.assignedUserIds : []),
          ...(Array.isArray(loadedRecord.assignedUsers) ? loadedRecord.assignedUsers.map((user: any) => user.id).filter(Boolean) : []),
          loadedRecord.assignedUserId,
          loadedRecord.technicianId,
        ].filter(Boolean).map(String));
        baseRecipients.forEach((item: any) => {
          if (item.type === "User" && assignedIds.has(String(item.sourceId))) requestedRecipientIds.push(item.id);
        });
      }
      setRecipientIds(Array.from(new Set(requestedRecipientIds.length ? requestedRecipientIds : preferred ? [preferred.id] : [])));
    }
    void load();
  }, [composeNote, documentId, explicitJobId, initialModule, requestedRecipients, requestedTemplateId]);

  const moduleTemplates = useMemo(() => templates.filter((item) => !item.module || item.module === module || (module === "JobCard" && item.module === "Job Card")), [module, templates]);
  const filteredRecipients = useMemo(() => recipients.filter((item) => recipientLabel(item).toLowerCase().includes(recipientSearch.toLowerCase())), [recipientSearch, recipients]);
  const jobId = explicitJobId || record.jobId || (module === "JobCard" ? documentId : "");
  const relatedDocuments = useMemo(() => {
    const result: any[] = [];
    if (documentId && moduleCollections[module]) result.push({ id: "current", label: `${module} document`, type: module, printUrl: documentPrintUrl(module, documentId) });
    if (jobId) result.push(
      { id: "jobCard", label: "Job Card", type: "jobCard", printUrl: `/jobs/${jobId}/jobcard?type=internal&print=1` },
      { id: "customerJobCard", label: "Customer Job Card", type: "customerJobCard", printUrl: `/jobs/${jobId}/jobcard?type=customer&print=1` },
      { id: "jobForms", label: "Completed Job Forms", type: "jobForms", printUrl: `/jobs/${jobId}/jobcard?type=customer&print=forms` },
      { id: "photoAlbum", label: "Job Photo Album", type: "photoAlbum", printUrl: `/jobs/${jobId}/jobcard?type=customer&print=photos` },
    );
    return result;
  }, [documentId, jobId, module]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    const tags = messageTags(record, module, documentId, jobId, {
      notes: composeNote,
      comment: composeNote,
    });
    const apply = (value: string) => Object.entries(tags).reduce((result, [key, replacement]) => result.replaceAll(`{{${key}}}`, String(replacement || "")), String(value || ""));
    setSubject(apply(template.subject || template.name || ""));
    setBody(apply(template.htmlBody || ""));
  }

  async function send() {
    const selectedRecipients = recipients.filter((item) => recipientIds.includes(item.id));
    if (!selectedRecipients.length || !sendEmail || !subject.trim() || !body.trim()) return alert("Select recipients and enter an email subject and message body.");
    setSending(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `companies/${COMPANY_ID}/message-attachments/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
        return { name: file.name, url: await getDownloadURL(storageRef), storagePath, size: file.size, contentType: file.type };
      }));
      const documents = relatedDocuments.filter((item) => selectedDocuments.includes(item.id));
      for (const recipient of selectedRecipients) await addDoc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"), {
        module, documentId, documentType: module.toLowerCase().replaceAll(" ", "_"), jobId, jobNumber: record.jobNumber || "",
        purchaseOrderId: module === "Purchase Order" ? documentId : "", quoteId: module === "Quote" ? documentId : "", invoiceId: module === "Invoice" ? documentId : "", queryId: module === "Query" ? documentId : "",
        templateId, templateName: templates.find((item) => item.id === templateId)?.name || "Custom message", communicationName: "Compose Message",
        recipientId: recipient.sourceId, recipientType: recipient.type, recipientName: recipientName(recipient), recipientEmail: recipient.email || recipient.email1 || "", recipientPhone: recipient.phone || recipient.phone1 || recipient.mobile || "",
        subject: subject.trim(), body, sendEmail: true, sendSms: false, relatedDocuments: documents, attachments: uploaded, state: "pending", createdAt: serverTimestamp(),
      });
      alert(`${selectedRecipients.length} message${selectedRecipients.length === 1 ? "" : "s"} queued.`);
      router.back();
    } finally { setSending(false); }
  }

  return <main className="min-h-screen bg-[#f4f7fb] p-4 md:p-6"><section className="mx-auto max-w-[1500px] overflow-hidden rounded-2xl border bg-white shadow-sm"><header className="flex items-center justify-between border-b px-5 py-4"><div><h1 className="text-xl font-black">Compose Message</h1><p className="text-sm text-gray-500">{documentId ? `${module} communication` : "New FleetFix communication"}</p></div><button disabled={sending} onClick={() => void send()} className="rounded-lg bg-blue-600 px-5 py-2.5 font-black text-white disabled:opacity-50">✈ {sending ? "Sending…" : "Send Message"}</button></header>
    <div className="space-y-5 p-5"><div className="flex flex-wrap items-center gap-5"><span className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">Email</span><label className="ml-auto text-sm font-bold">Module <select disabled={Boolean(documentId)} value={module} onChange={(event) => { setModule(event.target.value); setTemplateId(""); }} className="ml-2 rounded-lg border px-3 py-2 disabled:bg-gray-100">{MESSAGE_TEMPLATE_MODULES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="relative"><p className="mb-2 text-xs font-black uppercase text-gray-500">Select recipients</p><button type="button" onClick={() => setShowRecipients((current) => !current)} className="min-h-12 w-full rounded-xl border px-4 text-left">{recipientIds.length ? `${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"} selected` : initialModule === "Purchase Order" ? "Select this supplier's contacts or FleetFix users" : ["JobCard", "Quote", "Invoice"].includes(initialModule) ? "Select this customer's contacts or FleetFix users" : "Select recipients"}</button>{showRecipients && <div className="absolute z-30 mt-2 max-h-80 w-full overflow-hidden rounded-xl border bg-white shadow-xl"><input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search available recipients..." className="h-12 w-full border-b px-4" /><div className="max-h-64 overflow-y-auto p-2">{filteredRecipients.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-3 hover:bg-blue-50"><input type="checkbox" checked={recipientIds.includes(item.id)} onChange={(event) => setRecipientIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><b>{recipientName(item)}</b><small className="ml-2 text-gray-500">{item.type} · {item.email || item.email1 || item.phone || item.mobile || "No contact details"}</small></span></label>)}</div><button type="button" onClick={() => setShowRecipients(false)} className="w-full border-t p-3 font-bold text-blue-700">Done</button></div>}</div>
      <label className="block text-sm font-bold">Message Template<select value={templateId} onChange={(event) => chooseTemplate(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4"><option value="">Select template or write a custom message</option>{moduleTemplates.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
      <section className="rounded-xl border"><div className="border-b bg-gray-50 px-4 py-2 text-xs font-black uppercase">Message</div><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="h-12 w-full border-b px-4 font-bold" /><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} data-enter-newline="true" placeholder="Message body..." className="w-full resize-y p-4" /></section>
      <section className="rounded-xl border"><div className="border-b bg-gray-50 px-4 py-3 font-black">Email Attachments</div><div className="grid gap-6 p-5 md:grid-cols-2"><div><p className="mb-3 text-xs font-black uppercase text-gray-500">Related Documents and Forms</p>{relatedDocuments.length ? relatedDocuments.map((item) => <label key={item.id} className="mb-2 flex items-center justify-between rounded-lg border p-3 text-sm font-bold"><span>{item.label}</span><input type="checkbox" checked={selectedDocuments.includes(item.id)} onChange={(event) => setSelectedDocuments((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></label>) : <p className="text-sm text-gray-400">No related documents available.</p>}</div><div><p className="mb-3 text-xs font-black uppercase text-gray-500">Uploaded Files</p><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} className="w-full rounded-lg border border-dashed p-4" />{files.map((file) => <p key={`${file.name}-${file.size}`} className="mt-2 text-sm font-bold text-gray-600">{file.name}</p>)}</div></div></section>
    </div></section></main>;
}

function recipientName(item: any) { return item.name || item.displayName || item.companyName || item.customerName || item.supplierName || item.contactName || `${item.firstName || ""} ${item.lastName || item.surname || ""}`.trim() || item.email || "Recipient"; }
function recipientLabel(item: any) { return `${recipientName(item)} ${item.email || item.email1 || ""} ${item.phone || item.mobile || ""} ${item.type || ""}`; }
function documentPrintUrl(module: string, id: string) { const type = module === "Purchase Order" ? "purchase_order" : module.toLowerCase(); return ["quote", "invoice", "purchase_order"].includes(type) ? `/documents/${type}/${id}?print=1` : `/${moduleCollections[module] || ""}/${id}`; }
function messageTags(record: any, module: string, id: string, jobId: string, overrides: Record<string, string> = {}) {
  const origin = window.location.origin;
  const recordLink = id ? `${origin}/${moduleCollections[module] || "messages"}/${id}` : origin;
  const jobLink = jobId ? `${origin}/jobs/${jobId}` : "";
  const customerId = record.customerId || "";
  const supplierId = record.supplierId || "";
  const vehicle = record.vehicle || {};
  return {
    link: module === "JobCard" && jobLink ? jobLink : recordLink,
    customerName: record.customerName || record.customer || "",
    customerContact: record.customerContact || record.contactName || "",
    customerEmail: record.customerContactEmail || record.customerEmail || "",
    customerPhone: record.customerContactPhone || record.customerPhone || "",
    customerLink: customerId ? `${origin}/customers/${customerId}` : "",
    supplierName: record.supplier || record.supplierName || "",
    supplierLink: supplierId ? `${origin}/suppliers/${supplierId}` : "",
    userName: record.assignedUserName || record.assignedTo || "",
    jobNumber: record.jobNumber || "",
    jobStatus: typeof record.status === "object" ? record.status?.name || "" : record.status || "",
    jobType: record.jobType || record.jobTypeName || "",
    jobDescription: record.description || "",
    jobLink,
    jobCardLink: jobId ? `${origin}/jobs/${jobId}/jobcard` : "",
    jobFormsLink: jobId ? `${origin}/jobs/${jobId}/form` : "",
    jobPhotoAlbumLink: jobId ? `${origin}/jobs/${jobId}/photos` : "",
    vehicleReg: record.vehicleRegNo || record.vehicleReg || vehicle.vehicleReg || vehicle.registration || "",
    fleetNo: record.vehicleFleetNo || record.fleetNo || vehicle.fleetNo || "",
    vehicleMake: record.vehicleMake || vehicle.make || "",
    vehicleModel: record.vehicleModel || vehicle.model || "",
    vehicleVin: record.vehicleVin || record.vin || vehicle.vin || "",
    googleMapsLink: record.googleMapsLink || record.locationDetails?.googleMapsLink || "",
    quoteNumber: record.quoteNumber || record.documentNumber || "",
    quoteLink: module === "Quote" && id ? recordLink : "",
    invoiceNumber: record.invoiceNumber || record.documentNumber || "",
    invoiceLink: module === "Invoice" && id ? recordLink : "",
    purchaseOrderNumber: record.purchaseOrderNumber || record.documentNumber || "",
    purchaseOrderLink: module === "Purchase Order" && id ? recordLink : "",
    querySubject: record.subject || "",
    queryDescription: record.description || "",
    referenceNumber: record.referenceNumber || "",
    notes: record.notes || "",
    comment: record.comment || record.notes || "",
    ...overrides,
  };
}
