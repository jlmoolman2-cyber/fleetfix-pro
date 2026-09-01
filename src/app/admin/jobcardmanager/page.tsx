"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";

type OutputType = string;
type OutputProfile = { id: string; name: string };
type Field = { id: string; label: string; customerDefault?: boolean; description?: string; printOnly?: boolean };
type Section = { id: string; title: string; fields: Field[] };
type CompanyDetails = { companyName?: string; registrationNumber?: string; telephone?: string; email?: string; website?: string; vatNumber?: string; physicalAddress?: string; logo?: string };
type Palette = { primary: string; primaryText: string; labelBackground: string; alternateBackground: string; border: string };
const defaultPalette: Palette = { primary: "#164e7a", primaryText: "#ffffff", labelBackground: "#e2e8f0", alternateBackground: "#f8fafc", border: "#94a3b8" };
const wideJobCardFieldIds = new Set(["customerAddress", "gpsLink", "traveledFor", "statusHistory", "jobNotes", "labourSummary", "instructions", "reasons", "formSummary", "photoCaptions", "supplierInformation", "terms"]);

const sections: Section[] = [
  { id: "header", title: "Document Header", fields: [
    { id: "companyLogo", label: "Company logo", customerDefault: true },
    { id: "companyDetails", label: "Company name and contact details", customerDefault: true },
    { id: "jobCardTitle", label: "Job card title", customerDefault: true },
    { id: "jobNumber", label: "Job number", customerDefault: true },
    { id: "jobStatus", label: "Current job status", customerDefault: true },
    { id: "priority", label: "Job priority" },
    { id: "createdAt", label: "Date and time created", customerDefault: true },
    { id: "dateBooked", label: "Booking date and time", customerDefault: true },
  ] },
  { id: "customer", title: "Customer and Contact Details", fields: [
    { id: "customerCode", label: "Customer code" },
    { id: "customerName", label: "Customer name", customerDefault: true },
    { id: "customerVatNumber", label: "Customer VAT number", customerDefault: true },
    { id: "customerAddress", label: "Customer address", customerDefault: true },
    { id: "contactName", label: "Contact name", customerDefault: true },
    { id: "contactTelephone", label: "Contact telephone", customerDefault: true },
    { id: "contactEmail", label: "Contact email", customerDefault: true },
    { id: "driverName", label: "Driver name", customerDefault: true },
    { id: "driverContact", label: "Driver contact number", customerDefault: true },
    { id: "customerOrderNumber", label: "Customer Order Number", customerDefault: true },
    { id: "referenceNumber", label: "Reference Number", customerDefault: true },
    { id: "invoiceNumber", label: "Invoice Number", customerDefault: true },
  ] },
  { id: "job", title: "Job Details", fields: [
    { id: "jobType", label: "Job type", customerDefault: true },
    { id: "location", label: "Job location", customerDefault: true },
    { id: "locationAddress", label: "Location address", customerDefault: true },
    { id: "description", label: "Job description / reported fault", customerDefault: true },
    { id: "previousJobNumber", label: "Previous Job Number" },
    { id: "supplierInformation", label: "Supplier", customerDefault: true },
    { id: "gpsLink", label: "Google Maps / GPS link" },
    { id: "startKm", label: "Starting kilometre reading", customerDefault: true },
    { id: "endKm", label: "Ending kilometre reading", customerDefault: true },
    { id: "totalTravelling", label: "Total travelling distance", customerDefault: true, printOnly: true, description: "Sum of every completed End KM minus Start KM pair" },
  ] },
  { id: "vehicle", title: "Vehicle / Asset Details", fields: [
    { id: "vehicleRegistration", label: "Registration number", customerDefault: true },
    { id: "fleetNumber", label: "Fleet number", customerDefault: true },
    { id: "vehicleMake", label: "Make", customerDefault: true },
    { id: "vehicleModel", label: "Model", customerDefault: true },
    { id: "vehicleType", label: "Vehicle type", customerDefault: true },
    { id: "vinNumber", label: "VIN / chassis number", customerDefault: true },
  ] },
  { id: "work", title: "Work and Operational Information", fields: [
    { id: "assignedUsers", label: "Assigned technicians / users", description: "Uses the users assigned to the job; Status can make assignment required", customerDefault: true },
    { id: "assignedVehicle", label: "Assigned service vehicle" },
    { id: "statusHistory", label: "Status history" },
    { id: "tasks", label: "Print job tasks", customerDefault: true, printOnly: true },
    { id: "timers", label: "Print job timers", printOnly: true },
    { id: "labourSummary", label: "Labour summary", customerDefault: true },
    { id: "materials", label: "Print booked materials", customerDefault: true, printOnly: true },
    { id: "materialType", label: "Parts and services — Type column", customerDefault: true, printOnly: true },
    { id: "materialCostPriceExcl", label: "Parts and services — Item cost price excl.", printOnly: true },
    { id: "instructions", label: "Instructions issued" },
  ] },
  { id: "forms", title: "Forms, Photos and Attachments", fields: [
    { id: "jobForms", label: "Completed job forms", customerDefault: true },
    { id: "formSummary", label: "Job form answers / summary", customerDefault: true },
    { id: "photoAlbum", label: "Job photo album", customerDefault: true },
    { id: "photoCaptions", label: "Photo category and captions", customerDefault: true },
    { id: "attachments", label: "Attachment list" },
  ] },
  { id: "financial", title: "Amounts and Internal Information", fields: [
    { id: "jobCosting", label: "Job Summary / Costing panel" },
    { id: "jobPricing", label: "Job Summary / Job Pricing panel" },
    { id: "partsCost", label: "Internal parts cost" },
    { id: "labourCost", label: "Internal labour cost" },
    { id: "sellingAmounts", label: "Customer selling amounts", customerDefault: true },
    { id: "taxSummary", label: "Tax / VAT summary", customerDefault: true },
    { id: "totalAmount", label: "Total amount", customerDefault: true },
    { id: "supplierInformation", label: "Supplier information" },
  ] },
  { id: "linkedDocuments", title: "Linked Documents", fields: [
    { id: "linkedQuote", label: "Linked quotation numbers", customerDefault: true },
    { id: "linkedPurchaseOrder", label: "Linked purchase order numbers", customerDefault: true },
    { id: "linkedInvoice", label: "Linked invoice numbers", customerDefault: true },
    { id: "linkedPartsRequisition", label: "Linked parts requisition numbers", customerDefault: true },
    { id: "linkedPartsDerequisition", label: "Linked parts derequisition numbers", customerDefault: true },
    { id: "jobSummary", label: "Print job status summary", printOnly: true },
    { id: "internalComments", label: "Job notes / internal comments", printOnly: true },
    { id: "statusReasonsAndNotes", label: "Status reasons and status notes", printOnly: true },
  ] },
  { id: "approval", title: "Approval, Terms and Signatures", fields: [
    { id: "terms", label: "Job terms and conditions", customerDefault: true },
    { id: "customerSignature", label: "Customer signature", customerDefault: true },
    { id: "customerSignatory", label: "Customer signatory name", customerDefault: true },
    { id: "technicianSignature", label: "Technician signature", customerDefault: true },
    { id: "technicianName", label: "Technician name", customerDefault: true },
    { id: "approvalDate", label: "Completion / approval date", customerDefault: true },
    { id: "footer", label: "Document footer", customerDefault: true },
    { id: "pageNumbers", label: "Page numbers", customerDefault: true },
  ] },
  { id: "custom", title: "Custom and Additional Job Fields", fields: [
    { id: "traveledFor", label: "Traveled for / description" },
    { id: "customtext1", label: "Customer custom text field 1" },
    { id: "customtext2", label: "Customer custom text field 2" },
    { id: "customtext3", label: "Customer custom text field 3" },
    { id: "customtext4", label: "Customer custom text field 4" },
    { id: "customfield1", label: "Job custom field 1" },
    { id: "customfield2", label: "Job custom field 2" },
    { id: "customfield3", label: "Job custom field 3" },
    { id: "customfield4", label: "Job custom field 4" },
    { id: "customfield5", label: "Job custom field 5" },
    { id: "customfield6", label: "Job custom field 6" },
    { id: "customfield7", label: "Job custom field 7" },
    { id: "customfield8", label: "Job custom field 8" },
    { id: "customfield9", label: "Job custom field 9" },
    { id: "customfield10", label: "Job custom field 10" },
  ] },
];

const allFieldIds = Array.from(new Set(sections.flatMap((section) => section.fields.map((field) => field.id))));
const screenFieldIds = Array.from(new Set(sections.flatMap((section) => section.fields.filter((field) => !field.printOnly).map((field) => field.id))));
const lockedDocumentFieldIds = ["companyLogo", "companyDetails", "jobCardTitle", "jobNumber", "jobStatus", "priority", "createdAt", "dateBooked", "footer", "pageNumbers"];
const configurableSections = sections
  .filter((section) => section.id !== "header")
  .map((section) => ({ ...section, fields: section.fields.filter((field) => !["footer", "pageNumbers"].includes(field.id)) }));
const customerDefaults = sections.flatMap((section) => section.fields.filter((field) => field.customerDefault).map((field) => field.id));
const defaultStatusFields = screenFieldIds.filter((id) => /^(startKm|endKm|customfield\d+|customtext\d+|traveledFor)$/i.test(id));

export default function JobCardManagerPage() {
  const [outputType, setOutputType] = useState<OutputType>("internal");
  const [viewFields, setViewFields] = useState<string[]>(allFieldIds);
  const [printFields, setPrintFields] = useState<string[]>(allFieldIds);
  const [screenFields, setScreenFields] = useState<string[]>(screenFieldIds);
  const [statusFields, setStatusFields] = useState<string[]>(defaultStatusFields);
  const [documentTitle, setDocumentTitle] = useState("Internal Job Card");
  const [includeEmptyFields, setIncludeEmptyFields] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [company, setCompany] = useState<CompanyDetails>({});
  const [palette, setPalette] = useState<Palette>(defaultPalette);
  const [editableLabels, setEditableLabels] = useState<Record<string, string>>({});
  const [outputProfiles, setOutputProfiles] = useState<OutputProfile[]>([
    { id: "internal", name: "Internal Job Card" },
    { id: "customer", name: "Customer Job Card" },
  ]);

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID)).then((snapshot) => {
      if (snapshot.exists()) setCompany(snapshot.data() as CompanyDetails);
    }).catch((error) => console.error("Unable to load company details", error));
  }, []);

  useEffect(() => {
    getDocs(collection(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings")).then((snapshot) => {
      const configured = snapshot.docs.map((item) => ({
        id: item.id,
        name: item.data().profileName || item.data().documentTitle || item.id,
      }));
      setOutputProfiles((current) => Array.from(new Map([...current, ...configured].map((profile) => [profile.id, profile])).values()));
    }).catch((error) => console.error("Unable to load job card profiles", error));
  }, []);

  useEffect(() => {
    async function loadConfiguration() {
      setLoading(true);
      try {
        const [snapshot, fieldSnapshot] = await Promise.all([
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings", outputType)),
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job")),
        ]);
        const fieldData = fieldSnapshot.exists() ? fieldSnapshot.data() : {};
        setEditableLabels(fieldData.editableLabels || {});
        setScreenFields((Array.isArray(fieldData.screenFields) ? fieldData.screenFields : (fieldData.viewFields || fieldData.selectedFields || screenFieldIds)).filter((id: string) => screenFieldIds.includes(id)));
        setStatusFields((Array.isArray(fieldData.statusFields) ? fieldData.statusFields : defaultStatusFields).filter((id: string) => screenFieldIds.includes(id)));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setViewFields(Array.from(new Set([...(Array.isArray(data.viewFields) ? data.viewFields : (data.printFields || data.selectedFields || allFieldIds)), ...lockedDocumentFieldIds])).filter((id: string) => allFieldIds.includes(id)));
          setPrintFields(Array.from(new Set([...(Array.isArray(data.printFields) ? data.printFields : (data.selectedFields || fieldData.printFields || allFieldIds)), ...lockedDocumentFieldIds])).filter((id: string) => allFieldIds.includes(id)));
          setDocumentTitle(data.documentTitle || (outputType === "internal" ? "Internal Job Card" : "Customer Job Card"));
          setIncludeEmptyFields(data.includeEmptyFields === true);
          setPalette({ ...defaultPalette, ...(data.palette || {}) });
        } else {
          setViewFields(Array.from(new Set([...(outputType === "internal" ? allFieldIds : customerDefaults), ...lockedDocumentFieldIds])));
          setPrintFields((Array.isArray(fieldData.printFields) ? fieldData.printFields : (outputType === "internal" ? allFieldIds : customerDefaults)).filter((id: string) => allFieldIds.includes(id)));
          setDocumentTitle(outputType === "internal" ? "Internal Job Card" : "Customer Job Card");
          setIncludeEmptyFields(false);
          setPalette(defaultPalette);
        }
      } catch (error) {
        console.error(error);
        alert("Unable to load the job card configuration.");
      } finally {
        setLoading(false);
      }
    }
    loadConfiguration();
  }, [outputType]);

  const visibleSections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return configurableSections;
    return configurableSections.map((section) => ({ ...section, fields: section.fields.filter((field) => (editableLabels[field.id] || field.label).toLowerCase().includes(term)) })).filter((section) => section.fields.length);
  }, [search, editableLabels]);

  function toggleField(fieldId: string, kind: "view" | "print" | "screen" | "status") {
    const setter = kind === "view" ? setViewFields : kind === "print" ? setPrintFields : kind === "screen" ? setScreenFields : setStatusFields;
    setter((current) => current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]);
  }

  function toggleSection(section: Section, kind: "view" | "print" | "screen" | "status") {
    const ids = section.fields.filter((field) => kind === "view" || kind === "print" || !field.printOnly).map((field) => field.id);
    const fields = kind === "view" ? viewFields : kind === "print" ? printFields : kind === "screen" ? screenFields : statusFields;
    const setter = kind === "view" ? setViewFields : kind === "print" ? setPrintFields : kind === "screen" ? setScreenFields : setStatusFields;
    const allSelected = ids.every((id) => fields.includes(id));
    setter((current) => allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  }

  async function saveConfiguration() {
    setSaving(true);
    try {
      await Promise.all([
        setDoc(doc(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings", outputType), {
          outputType, profileName: outputProfiles.find((profile) => profile.id === outputType)?.name || documentTitle.trim(), documentTitle: documentTitle.trim(), selectedFields: Array.from(new Set([...printFields, ...lockedDocumentFieldIds])), viewFields: Array.from(new Set([...viewFields, ...lockedDocumentFieldIds])), printFields: Array.from(new Set([...printFields, ...lockedDocumentFieldIds])), includeEmptyFields, palette,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job"), {
          selectedFields: screenFields, screenFields, viewFields: screenFields, printFields, statusFields, editableLabels,
          fieldCatalog: allFieldIds.map((id) => {
            const definition = sections.flatMap((section) => section.fields).find((field) => field.id === id);
            return {
              id,
              label: editableLabels[id] || definition?.label || id,
              type: id === "assignedUsers" ? "assignment" : /km|number|amount|cost|total|year/i.test(id) ? "number" : /description|notes|summary|comments|instructions|terms/i.test(id) ? "textarea" : "text",
              statusEligible: statusFields.includes(id),
            };
          }),
          updatedAt: serverTimestamp(),
        }, { merge: true }),
      ]);
      alert(`${outputType === "internal" ? "Internal" : "Customer"} job card settings saved.`);
    } catch (error) {
      console.error(error);
      alert("Failed to save the job card configuration.");
    } finally {
      setSaving(false);
    }
  }

  async function addOutputProfile() {
    const name = window.prompt("Name the additional job card");
    if (!name?.trim()) return;
    const baseId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "job-card";
    let id = `additional-${baseId}`;
    let suffix = 2;
    while (outputProfiles.some((profile) => profile.id === id)) id = `additional-${baseId}-${suffix++}`;
    const profile = { id, name: name.trim() };
    await setDoc(doc(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings", id), {
      outputType: id, profileName: profile.name, documentTitle: profile.name,
      selectedFields: customerDefaults, printFields: customerDefaults, includeEmptyFields: false, palette: defaultPalette,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    setOutputProfiles((current) => [...current, profile]);
    setOutputType(id);
  }

  return <main className="job-card-manager-page min-h-screen bg-[#f5f7fb] p-6 text-gray-900">
    <div className="manager-content mx-auto max-w-7xl">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-black">Job Card Manager</h1><p className="mt-2 text-sm text-gray-500">View controls the jobcard viewer, Print controls printed output, and Screen controls the live job screen.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/admin/jobsettings" className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700">Back to Job Settings</Link><button disabled={loading} onClick={() => setShowPreview(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 font-bold text-blue-700 disabled:opacity-50">PDF Preview</button><button disabled={saving || loading} onClick={saveConfiguration} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save Settings"}</button></div>
      </header>

      <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
          <div><span className="mb-2 block text-xs font-black uppercase text-gray-500">Job card output</span><div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">{outputProfiles.map((profile) => <button key={profile.id} onClick={() => setOutputType(profile.id)} className={`rounded-lg px-4 py-3 font-bold ${outputType === profile.id ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{profile.name}</button>)}<button onClick={addOutputProfile} className="rounded-lg border border-dashed border-blue-300 px-4 py-3 font-bold text-blue-700">+ Additional Card</button></div></div>
          <label className="text-xs font-black uppercase text-gray-500">Document title<input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-normal normal-case outline-none focus:border-blue-500" /></label>
          <label className="flex items-end gap-2 pb-3 text-sm font-bold"><input type="checkbox" checked={includeEmptyFields} onChange={(event) => setIncludeEmptyFields(event.target.checked)} className="size-4" />Show empty fields</label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5"><div><strong>{viewFields.length}</strong> view · <strong>{printFields.length}</strong> print · <strong>{screenFields.length}</strong> screen · <strong>{statusFields.length}</strong> status fields</div><div className="flex flex-wrap gap-2"><button onClick={() => setViewFields(allFieldIds)} className="rounded-lg border px-3 py-2 text-sm font-bold">View all</button><button onClick={() => setPrintFields(allFieldIds)} className="rounded-lg border px-3 py-2 text-sm font-bold">Print all</button><button onClick={() => setScreenFields(screenFieldIds)} className="rounded-lg border px-3 py-2 text-sm font-bold">Screen all</button><button onClick={() => { setViewFields(lockedDocumentFieldIds); setPrintFields(lockedDocumentFieldIds); setScreenFields([]); setStatusFields([]); }} className="rounded-lg border px-3 py-2 text-sm font-bold">Clear configurable</button></div></div>
      </section>

      <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Document Colour Palette</h2><p className="mt-1 text-sm text-gray-500">Applied to this job card output and its attached job forms.</p></div><button type="button" onClick={() => setPalette(defaultPalette)} className="rounded-lg border px-3 py-2 text-sm font-bold">Reset colours</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
          ["primary", "Section headers"], ["primaryText", "Header text"], ["labelBackground", "Label cells"], ["alternateBackground", "Alternate rows"], ["border", "Borders"],
        ].map(([key, label]) => <label key={key} className="text-xs font-black uppercase text-gray-500">{label}<div className="mt-2 flex items-center gap-2 rounded-xl border p-2"><input type="color" value={palette[key as keyof Palette]} onChange={(event) => setPalette((current) => ({ ...current, [key]: event.target.value }))} className="h-9 w-12 cursor-pointer border-0 bg-transparent" /><span className="font-mono text-xs font-normal normal-case">{palette[key as keyof Palette]}</span></div></label>)}</div>
      </section>

      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search information fields…" className="mb-5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-blue-500" />

      {loading ? <div className="rounded-3xl bg-white p-12 text-center text-gray-500">Loading configuration…</div> : <div className="space-y-5">{visibleSections.map((section) => {
        const viewCount = section.fields.filter((field) => viewFields.includes(field.id)).length;
        const printCount = section.fields.filter((field) => printFields.includes(field.id)).length;
        const screenCount = section.fields.filter((field) => screenFields.includes(field.id)).length;
        const statusCount = section.fields.filter((field) => statusFields.includes(field.id)).length;
        return <section key={section.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-50 px-6 py-4"><div><h2 className="text-lg font-black">{section.title}</h2><p className="mt-1 text-xs text-gray-500">View {viewCount}/{section.fields.length} · Print {printCount}/{section.fields.length} · Screen {screenCount}/{section.fields.length} · Status {statusCount}/{section.fields.length}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => toggleSection(section, "view")} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-blue-700">Toggle View</button><button onClick={() => toggleSection(section, "print")} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-violet-700">Toggle Print</button><button onClick={() => toggleSection(section, "screen")} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-emerald-700">Toggle Screen</button><button onClick={() => toggleSection(section, "status")} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold text-amber-700">Toggle Status</button></div></div>
          <div className="divide-y divide-gray-100">{section.fields.map((field) => {
            const customField = field.id === "traveledFor" || /^custom(text|field)\d+$/i.test(field.id);
            return <div key={field.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-5 px-5 py-4 hover:bg-blue-50"><div>{customField ? <input value={editableLabels[field.id] ?? field.label} onChange={(event) => setEditableLabels((current) => ({ ...current, [field.id]: event.target.value }))} aria-label={`Name for ${field.id}`} className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold outline-none focus:border-blue-500" /> : <strong className="block text-sm">{editableLabels[field.id] || field.label}</strong>}<span className="mt-1 block text-xs text-gray-500">{field.printOnly ? "Recorded output option" : customField ? "Editable custom field name" : field.description || field.id}</span></div><label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-blue-700"><input type="checkbox" checked={viewFields.includes(field.id)} onChange={() => toggleField(field.id, "view")} className="size-4" />View</label><label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-violet-700"><input type="checkbox" checked={printFields.includes(field.id)} onChange={() => toggleField(field.id, "print")} className="size-4" />Print</label>{field.printOnly ? <span className="text-xs font-bold text-gray-400">No screen</span> : <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-emerald-700"><input type="checkbox" checked={screenFields.includes(field.id)} onChange={() => toggleField(field.id, "screen")} className="size-4" />Screen</label>}{field.printOnly ? <span /> : <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-amber-700"><input type="checkbox" checked={statusFields.includes(field.id)} onChange={() => toggleField(field.id, "status")} className="size-4" />Status</label>}</div>;
          })}</div>
        </section>;
      })}</div>}
    </div>
    {showPreview && <JobCardPreview company={company} outputType={outputType} documentTitle={documentTitle} selectedFields={printFields} includeEmptyFields={includeEmptyFields} palette={palette} editableLabels={editableLabels} onClose={() => setShowPreview(false)} />}
  </main>;
}

const previewValues: Record<string, string> = {
  companyDetails: "FleetFix Professional Services · +27 11 555 0182 · service@fleetfix.co.za",
  jobCardTitle: "JOB CARD", jobNumber: "JOB-2026-00418", jobStatus: "Work in Progress", priority: "High",
  createdAt: "24 July 2026, 08:15", dateBooked: "24 July 2026, 09:00",
  customerCode: "CUS-00124", customerName: "Northern Logistics (Pty) Ltd", customerVatNumber: "4123456789",
  customerAddress: "18 Industrial Road, Johannesburg", contactName: "Michael Daniels", contactTelephone: "+27 82 555 0149",
  contactEmail: "michael@northernlogistics.co.za", driverName: "Samuel Nkosi", driverContact: "+27 72 555 0161",
  customerOrderNumber: "CO-10458", invoiceNumber: "INV-2026-0089",
  jobType: "Truck – Major Service", description: "Perform scheduled major service and inspect reported air leak.",
  referenceNumber: "NL-REF-7782", location: "Northern Logistics Depot",
  locationAddress: "18 Industrial Road, Johannesburg", gpsLink: "maps.google.com/…", startKm: "486,210 km", endKm: "486,224 km",
  totalTravelling: "14 km",
  previousJobNumber: "JOB-2026-00391", traveledFor: "Scheduled service and reported air leak",
  customtext1: "Example customer field value", customtext2: "Example customer field value", customtext3: "Example customer field value", customtext4: "Example customer field value",
  customfield1: "Example job field value", customfield2: "Example job field value", customfield3: "Example job field value", customfield4: "Example job field value", customfield5: "Example job field value",
  customfield6: "Example job field value", customfield7: "Example job field value", customfield8: "Example job field value", customfield9: "Example job field value", customfield10: "Example job field value",
  vehicleRegistration: "AB 12 CD GP", fleetNumber: "TRK-042", vehicleMake: "Scania", vehicleModel: "R500",
  vehicleType: "Truck Tractor 6x4", vinNumber: "YS2R6X20005512345", engineNumber: "DC13-881245", yearModel: "2022",
  assignedUsers: "J. Mokoena, T. Botha", assignedVehicle: "Service Van 03", statusHistory: "Booked → Dispatched → Work in Progress",
  jobNotes: "Air leak located near rear coupling. Customer advised.", tasks: "8 of 10 tasks completed", timers: "6 h 35 min",
  labourSummary: "Major service; air-system inspection and repair", materials: "Oil filter, fuel filter, 38 L engine oil, air coupling",
  materialType: "Type column",
  materialCostPriceExcl: "Item cost price excl. column",
  instructions: "Complete road test and leak test before release.", reasons: "—", jobForms: "Major Service Inspection – completed",
  formSummary: "All mandatory inspection points completed", photoAlbum: "12 job photos attached", photoCaptions: "Before repair, component detail, completed repair",
  attachments: "Customer PO; diagnostic report", partsCost: "R 8,420.00", labourCost: "R 4,250.00", sellingAmounts: "R 15,890.00",
  appointments: "24 July 2026, 13:39 · 60 minutes · J. Mokoena", comments: "Customer advised that repair was completed.",
  taxSummary: "VAT 15%: R 2,383.50", totalAmount: "R 18,273.50", linkedQuote: "Q-2026-0124", linkedInvoice: "INV-2026-0089",
  linkedPurchaseOrder: "PO-2026-0104",
  statusReasonsAndNotes: "On Hold · Awaiting customer approval",
  supplierInformation: "Internal use only", terms: "Work completed is subject to FleetFix standard service terms and conditions.",
  internalComments: "Customer advised repair complete",
  customerSignature: "Signature captured", customerSignatory: "Michael Daniels", technicianSignature: "Signature captured",
  technicianName: "J. Mokoena", approvalDate: "24 July 2026, 16:42", footer: "Thank you for choosing FleetFix.", pageNumbers: "Page 1 of 1",
};

function JobCardPreview({ company, outputType, documentTitle, selectedFields, includeEmptyFields, palette, editableLabels, onClose }: {
  company: CompanyDetails; outputType: OutputType; documentTitle: string; selectedFields: string[]; includeEmptyFields: boolean; palette: Palette; editableLabels: Record<string, string>; onClose: () => void;
}) {
  const printableSections = sections.map((section) => ({
    ...section,
    fields: section.fields
      .filter((field) => selectedFields.includes(field.id) && (includeEmptyFields || previewValues[field.id] || ["companyLogo", "customerSignature", "technicianSignature"].includes(field.id)))
      .map((field) => ({ ...field, label: editableLabels[field.id] || field.label })),
  })).filter((section) => section.fields.length && !["header", "forms"].includes(section.id))
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => field.id !== "internalComments"),
    }))
    .filter((section) => section.fields.length);

  return <div className="job-card-preview-overlay job-card-palette fixed inset-0 z-[1000] overflow-y-auto bg-slate-950/70 p-4 sm:p-8" style={{ "--job-card-primary": palette.primary, "--job-card-primary-text": palette.primaryText, "--job-card-label-bg": palette.labelBackground, "--job-card-alternate": palette.alternateBackground, "--job-card-border": palette.border } as React.CSSProperties}>
    <div className="no-print sticky top-0 z-10 mx-auto mb-4 flex max-w-[210mm] justify-end gap-3 rounded-xl bg-white p-3 shadow-xl">
      <button onClick={onClose} className="rounded-lg border px-4 py-2 font-bold text-gray-700">Close</button>
      <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white">Print / Save PDF</button>
    </div>
    <article className="job-card-a4 job-card-palette mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-[8mm] text-slate-900 shadow-2xl" style={{ "--job-card-primary": palette.primary, "--job-card-primary-text": palette.primaryText, "--job-card-label-bg": palette.labelBackground, "--job-card-alternate": palette.alternateBackground, "--job-card-border": palette.border } as React.CSSProperties}>
      <header className="border-b-[3px] border-blue-700 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">{selectedFields.includes("companyLogo") && company.logo ? <img src={company.logo} alt={`${company.companyName || "Company"} logo`} className="h-16 w-24 shrink-0 object-contain" /> : null}{selectedFields.includes("companyDetails") && <div className="min-w-0"><h1 className="text-xl font-black tracking-tight text-blue-700">{company.companyName || "Company Name"}</h1><div className="mt-1 space-y-0.5 text-[8px] leading-tight text-slate-500"><p>{company.physicalAddress || "Company address"}</p><p>{[company.telephone, company.email, company.website].filter(Boolean).join(" · ")}</p><p>{[company.registrationNumber ? `Reg: ${company.registrationNumber}` : "", company.vatNumber ? `VAT: ${company.vatNumber}` : ""].filter(Boolean).join(" · ")}</p></div></div>}</div>
          <div className="text-right">{selectedFields.includes("jobCardTitle") && <><p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-700">{outputType === "internal" ? "Internal document" : "Customer document"}</p><h2 className="mt-1 text-xl font-black">{documentTitle || "Job Card"}</h2></>}{selectedFields.includes("jobNumber") && <p className="font-mono text-xs font-bold">JOB-2026-00418</p>}</div>
        </div>
      </header>

      <div className="my-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-slate-200">
        {[{ id: "jobStatus", label: "Status" }, { id: "dateBooked", label: "Booked" }].filter((item) => selectedFields.includes(item.id)).map((item) => <div key={item.id} className="bg-slate-50 p-2"><p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{item.label}</p><p className="text-[10px] font-bold">{previewValues[item.id]}</p></div>)}
      </div>

      <div className="space-y-3">{printableSections.map((section) => <section key={section.id} className="job-card-section">
        <h3 className="job-card-section-title">{section.title}</h3>
        {section.id === "approval" ? <><div className="grid grid-cols-2 gap-5 p-2">{section.fields.filter((field) => field.id.includes("Signature") || field.id.includes("Name") || field.id === "customerSignatory").map((field) => <div key={field.id} className="mt-2 border-b border-slate-400 pb-1"><p className="text-[8px] font-black uppercase text-slate-400">{field.label}</p><p className="mt-3 text-[9px] italic text-slate-600">{previewValues[field.id] || "Signature"}</p></div>)}</div><div className="job-card-field-grid mt-2">{section.fields.filter((field) => !field.id.includes("Signature") && !field.id.includes("Name") && field.id !== "customerSignatory").map((field) => <PreviewField key={field.id} field={field} />)}</div></> : section.id === "work" ? <>
          <div className="job-card-field-grid">{section.fields.filter((field) => !["materials", "materialType", "materialCostPriceExcl", "tasks", "timers"].includes(field.id)).map((field) => <PreviewField key={field.id} field={field} />)}</div>
          {selectedFields.includes("materials") && <PreviewTable title="Materials" headers={["Code", "Description", ...(selectedFields.includes("materialType") ? ["Type"] : []), "Unit", ...(selectedFields.includes("materialCostPriceExcl") ? ["Cost Price Excl."] : []), "Quantity"]} rows={[["INV00002", "Self Tapping Screws", ...(selectedFields.includes("materialType") ? ["Part"] : []), "mm", ...(selectedFields.includes("materialCostPriceExcl") ? ["R 12.50"] : []), "10"], ["INV00003", "10mm Stock Item", ...(selectedFields.includes("materialType") ? ["Part"] : []), "mm", ...(selectedFields.includes("materialCostPriceExcl") ? ["R 24.00"] : []), "5"], ["INV00004", "20mm Stock Item", ...(selectedFields.includes("materialType") ? ["Part"] : []), "mm", ...(selectedFields.includes("materialCostPriceExcl") ? ["R 36.00"] : []), "4"]]} />}
          {selectedFields.includes("timers") && <PreviewTable title="Job Timers" headers={["Employee", "Description", "Billable", "Date", "Duration"]} rows={[["J. Mokoena", "Major service", "Yes", "2026/07/24", "01:00:00"], ["T. Botha", "Air leak repair", "Yes", "2026/07/24", "02:00:00"], ["TOTAL", "", "", "", "03:00:00"]]} />}
          {selectedFields.includes("tasks") && <PreviewTable title="Task Items" headers={["Description", "Employee", "Result", "Due Date"]} rows={[["Complete major service", "J. Mokoena", "Complete", "2026/07/24"], ["Air-system leak test", "T. Botha", "Pass", "2026/07/24"]]} />}
        </> : section.id === "forms" ? <>
          <div className="job-card-field-grid">{section.fields.filter((field) => !["appointments", "comments", "attachments"].includes(field.id)).map((field) => <PreviewField key={field.id} field={field} />)}</div>
          {selectedFields.includes("appointments") && <PreviewTable title="Appointments" headers={["Subject", "Start", "Duration", "Employee"]} rows={[["Meet at client", "2026-07-24 13:39", "60 min", "J. Mokoena"]]} />}
          {selectedFields.includes("comments") && <PreviewTable title="Comments" headers={["Comment", "Created", "Created By"]} rows={[["Customer advised repair complete", "2026-07-24 15:10", "J. Mokoena"]]} />}
          {selectedFields.includes("attachments") && <PreviewTable title="Attachments" headers={["File", "Type", "Added By"]} rows={[["Customer PO", "Purchase Order", "Office"], ["Diagnostic report", "Report", "J. Mokoena"]]} />}
        </> : <div className={`job-card-field-grid ${section.id === "vehicle" ? "job-card-vehicle-grid" : ""}`}>{section.fields.map((field) => <PreviewField key={field.id} field={field} />)}</div>}
      </section>)}</div>

      {selectedFields.includes("internalComments") && <PreviewTable title="Job Notes / Internal Comments" headers={["Type", "Comment / Message", "Created By"]} rows={[["Internal comment", "Customer advised repair complete", "J. Mokoena"]]} />}
      {selectedFields.includes("attachments") && <PreviewTable title="Attachments" headers={["File", "Type", "Added By"]} rows={[["Customer PO", "Purchase Order", "Office"], ["Diagnostic report", "Report", "J. Mokoena"]]} />}

      <footer className="mt-4 flex items-center justify-between border-t pt-2 text-[8px] text-slate-400"><span>{selectedFields.includes("footer") ? previewValues.footer : ""}</span><span>{selectedFields.includes("pageNumbers") ? "Job card · Page 1" : ""}</span></footer>
    </article>
    {selectedFields.includes("jobForms") && <JobFormPreviewPage />}
    {selectedFields.includes("photoAlbum") && <PhotoPreviewPages />}
  </div>;
}

function PreviewField({ field }: { field: Field }) {
  return <div className={`job-card-field ${wideJobCardFieldIds.has(field.id) ? "job-card-field-wide" : ""} ${field.id === "locationAddress" ? "job-card-location-address" : ""} ${field.id === "description" ? "job-card-description" : ""}`}><p className="job-card-field-label">{field.label}</p><p className="job-card-field-value">{previewValues[field.id] || "—"}</p></div>;
}

function PreviewTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return <div className="job-card-section mt-2"><h4 className="job-card-section-title">{title}</h4><div className="grid bg-slate-200" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>{headers.map((header) => <span key={header} className="border-r border-slate-300 px-2 py-1 text-[7px] font-black uppercase text-slate-700">{header}</span>)}</div>{rows.map((row, rowIndex) => <div key={rowIndex} className={`grid border-t border-slate-200 ${rowIndex % 2 ? "bg-slate-50" : "bg-white"}`} style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>{row.map((value, cellIndex) => <span key={cellIndex} className="border-r border-slate-200 px-2 py-1 text-[8px]">{value}</span>)}</div>)}</div>;
}

function DocumentPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="mb-5 flex items-end justify-between border-b-[3px] border-blue-700 pb-3">
    <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-blue-700 text-sm font-black text-white">FF</div><div><h2 className="text-lg font-black">{title}</h2><p className="text-[9px] text-slate-500">{subtitle}</p></div></div>
    <div className="text-right"><p className="font-mono text-xs font-bold">JOB-2026-00418</p><p className="text-[9px] text-slate-500">Northern Logistics · TRK-042</p></div>
  </header>;
}

function JobFormPreviewPage() {
  const inspectionRows = [
    ["Engine oil and filter", "Completed", "Replaced oil and filter"],
    ["Fuel filters", "Completed", "Primary and secondary replaced"],
    ["Cooling system", "Pass", "Level and pressure checked"],
    ["Brake system", "Pass", "Linings and air pressure inspected"],
    ["Air system leak test", "Completed", "Rear coupling replaced"],
    ["Steering and suspension", "Pass", "No defects identified"],
    ["Electrical and lighting", "Pass", "All lights operational"],
    ["Road test", "Pass", "Vehicle operating normally"],
  ];
  return <article className="job-card-a4 job-card-page-break mx-auto mt-6 min-h-[297mm] w-full max-w-[210mm] bg-white p-[10mm] text-slate-900 shadow-2xl">
    <DocumentPageHeader title="Major Service Inspection" subtitle="Configured job form · Completed 24 July 2026" />
    <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded-lg border bg-slate-200">{[["Technician", "J. Mokoena"], ["Registration", "AB 12 CD GP"], ["Odometer", "486,224 km"], ["Form status", "Completed"]].map(([label, value]) => <div key={label} className="bg-slate-50 p-2"><p className="text-[8px] font-black uppercase text-slate-400">{label}</p><p className="text-[10px] font-bold">{value}</p></div>)}</div>
    <div className="overflow-hidden rounded-lg border border-slate-200"><div className="grid grid-cols-[1fr_110px_1.5fr] bg-slate-800 px-3 py-2 text-[9px] font-black uppercase text-white"><span>Inspection item</span><span>Result</span><span>Notes</span></div>{inspectionRows.map((row, index) => <div key={row[0]} className={`grid grid-cols-[1fr_110px_1.5fr] px-3 py-3 text-[10px] ${index % 2 ? "bg-slate-50" : "bg-white"}`}><strong>{row[0]}</strong><span className="font-bold text-green-700">✓ {row[1]}</span><span>{row[2]}</span></div>)}</div>
    <section className="mt-5"><h3 className="border-b pb-1 text-[9px] font-black uppercase tracking-wider text-blue-700">Technician findings and recommendations</h3><p className="mt-2 min-h-20 rounded-lg border bg-slate-50 p-3 text-[10px] leading-5">Major service completed according to schedule. Air leak traced to rear coupling and repaired. Recommend checking rear brake linings again at the next scheduled service.</p></section>
    <div className="mt-8 grid grid-cols-2 gap-10"><div className="border-b border-slate-400 pb-2"><p className="text-[8px] font-black uppercase text-slate-400">Technician signature</p><p className="mt-8 text-[10px] italic">J. Mokoena</p></div><div className="border-b border-slate-400 pb-2"><p className="text-[8px] font-black uppercase text-slate-400">Customer acknowledgement</p><p className="mt-8 text-[10px] italic">Michael Daniels</p></div></div>
    <footer className="mt-8 flex justify-between border-t pt-2 text-[8px] text-slate-400"><span>Job form generated from its configured layout</span><span>Job form · Page 1</span></footer>
  </article>;
}

function PhotoPreviewPages() {
  const photos = [
    ["Vehicle front", "Arrival condition"], ["Vehicle registration", "Asset identification"],
    ["Reported air leak", "Before repair"], ["Rear air coupling", "Fault detail"],
    ["Replacement coupling", "Part installed"], ["Completed repair", "After repair"],
    ["Engine service", "Filters replaced"], ["Final road test", "Vehicle ready"],
  ];
  const pages = [photos.slice(0, 4), photos.slice(4, 8)];
  return <>{pages.map((page, pageIndex) => <article key={pageIndex} className="job-card-a4 job-card-page-break mx-auto mt-6 min-h-[297mm] w-full max-w-[210mm] bg-white p-[10mm] text-slate-900 shadow-2xl">
    <DocumentPageHeader title="Job Photos" subtitle={`Photo album · ${photos.length} images`} />
    <div className="grid grid-cols-2 gap-5">{page.map(([title, caption], imageIndex) => <figure key={title} className="break-inside-avoid"><div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300"><div className="absolute inset-0 grid place-items-center text-center"><div><span className="text-4xl text-slate-400">▧</span><p className="mt-2 text-[10px] font-bold text-slate-500">Job photo {pageIndex * 4 + imageIndex + 1}</p></div></div></div><figcaption className="mt-2 border-l-2 border-blue-600 pl-2"><strong className="block text-[10px]">{title}</strong><span className="text-[9px] text-slate-500">{caption} · 24 July 2026, 14:{20 + imageIndex}</span></figcaption></figure>)}</div>
    <footer className="mt-6 flex justify-between border-t pt-2 text-[8px] text-slate-400"><span>Four images per A4 page</span><span>Photos · Page {pageIndex + 1} of {pages.length}</span></footer>
  </article>)}</>;
}
