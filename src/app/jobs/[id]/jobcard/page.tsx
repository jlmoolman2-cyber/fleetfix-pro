"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { permissionsForRole } from "@/lib/permissions";
import { calculateCompanyRateTotals, CompanyRateLine } from "@/lib/companyRates";

type OutputType = string;
type PrintMode = "all" | "jobcard-forms" | "forms" | "jobcard" | "photos";
type Photo = { id: string; url?: string; categoryName?: string; photoItemName?: string; name?: string };
type CompanyDetails = { companyName?: string; registrationNumber?: string; telephone?: string; email?: string; website?: string; vatNumber?: string; physicalAddress?: string; logo?: string };
const wideJobCardFieldIds = new Set(["customerAddress", "gpsLink", "statusHistory", "jobNotes", "labourSummary", "instructions", "reasons", "supplierInformation"]);
const pricingFieldIds = new Set(["partsCost", "labourCost", "sellingAmounts", "taxSummary", "totalAmount"]);
const lockedDocumentFieldIds = ["companyLogo", "companyDetails", "jobCardTitle", "jobNumber", "jobStatus", "priority", "createdAt", "dateBooked", "footer", "pageNumbers"];

const defaults = ["companyDetails", "jobNumber", "jobStatus", "dateBooked", "customerName", "contactName", "contactTelephone", "jobType", "description", "location", "vehicleRegistration", "fleetNumber", "vehicleMake", "vehicleModel", "assignedUsers", "tasks", "materials", "jobForms", "photoAlbum", "terms", "customerSignature", "technicianSignature"];

export default function CompletedJobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [company, setCompany] = useState<CompanyDetails>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [timers, setTimers] = useState<any[]>([]);
  const [linkedItems, setLinkedItems] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [documentAttachments, setDocumentAttachments] = useState<any[]>([]);
  const [outputType, setOutputType] = useState<OutputType>("internal");
  const [autoPrint, setAutoPrint] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingPermissionChecked, setPricingPermissionChecked] = useState(false);
  const [canViewJobPricing, setCanViewJobPricing] = useState(false);
  const [companyRates, setCompanyRates] = useState<CompanyRateLine[]>([]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedType = query.get("type") || "internal";
    const type = /^[a-z0-9-]+$/i.test(requestedType) ? requestedType : "internal";
    setOutputType(type);
    const requestedPrint = query.get("print");
    if (requestedPrint && ["jobcard", "jobcard-forms", "forms", "photos"].includes(requestedPrint)) {
      setPrintMode(requestedPrint as PrintMode);
      setAutoPrint(true);
    } else {
      setAutoPrint(requestedPrint === "1");
    }
    async function load() {
      try {
        const [jobSnap, companySnap, settingsSnap, fieldSettingsSnap, rateSettingsSnap, photoSnap, taskSnap, materialSnap, inventorySnap, timerSnap, linkedItemSnap, noteSnap, communicationSnap, attachmentSnap] = await Promise.all([
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", id)),
          getDoc(doc(clientDb, "companies", COMPANY_ID)),
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings", type)),
          getDoc(doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job")),
          getDoc(doc(clientDb, "companies", COMPANY_ID, "companyRates", "settings")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "photoAlbumPhotos")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "tasks")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "materials")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "inventory")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "timers")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "linkedItems")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "notes")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "communications")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "attachments")),
        ]);
        if (jobSnap.exists()) setJob({ id: jobSnap.id, ...jobSnap.data() });
        if (companySnap.exists()) setCompany(companySnap.data() as CompanyDetails);
        const outputSettings = settingsSnap.exists() ? settingsSnap.data() : {};
        const fieldSettings = fieldSettingsSnap.exists() ? fieldSettingsSnap.data() : {};
        const configuredPrintFields = outputSettings.printFields || outputSettings.selectedFields || fieldSettings.printFields || fieldSettings.selectedFields || defaults;
        const configuredViewFields = outputSettings.viewFields || outputSettings.printFields || outputSettings.selectedFields || fieldSettings.printFields || defaults;
        setSettings({
          ...outputSettings,
          viewFields: Array.from(new Set([...configuredViewFields, ...lockedDocumentFieldIds])),
          printFields: Array.from(new Set([...configuredPrintFields, ...lockedDocumentFieldIds])),
          editableLabels: fieldSettings.editableLabels || {},
          documentTitle: outputSettings.documentTitle || (type === "internal" ? "Internal Job Card" : "Customer Job Card"),
        });
        setCompanyRates(rateSettingsSnap.exists() && Array.isArray(rateSettingsSnap.data().rates) ? rateSettingsSnap.data().rates : []);
        setPhotos(photoSnap.docs.map((item) => ({ id: item.id, ...item.data() })) as Photo[]);
        setTasks(taskSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setMaterials(materialSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setInventory(inventorySnap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setTimers(timerSnap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a: any, b: any) => timestampMillis(a.startTime) - timestampMillis(b.startTime)));
        setLinkedItems(linkedItemSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setNotes(noteSnap.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a: any, b: any) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)));
        setCommunications(communicationSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
        setDocumentAttachments(attachmentSnap.docs.map((item) => ({ id: item.id, ...item.data() })));
      } finally { setLoading(false); }
    }
    load();
  }, [id]);

  useEffect(() => {
    async function checkPricingPermission() {
      const auth = getAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        setCanViewJobPricing(false);
        setPricingPermissionChecked(true);
        return;
      }
      let userData: any = null;
      const companyUser = await getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid));
      if (companyUser.exists()) userData = companyUser.data();
      else {
        const globalUser = await getDoc(doc(clientDb, "users", user.uid));
        if (globalUser.exists()) userData = globalUser.data();
      }
      const permissions = userData?.permissions as Record<string, boolean> | undefined;
      const rolePermissions = permissionsForRole(String(userData?.primaryRole || userData?.role || ""));
      setCanViewJobPricing(
        permissions && Object.prototype.hasOwnProperty.call(permissions, "View job pricing")
          ? permissions["View job pricing"] === true
          : rolePermissions["View job pricing"] === true
      );
      setPricingPermissionChecked(true);
    }
    void checkPricingPermission();
  }, []);

  useEffect(() => {
    if (!loading && pricingPermissionChecked && autoPrint) {
      setPrintMode((current) => current || "all");
      setTimeout(() => window.print(), 2500);
    }
  }, [autoPrint, loading, pricingPermissionChecked]);

  useEffect(() => {
    const resetPrintMode = () => setPrintMode(null);
    window.addEventListener("afterprint", resetPrintMode);
    return () => window.removeEventListener("afterprint", resetPrintMode);
  }, []);

  if (loading || !pricingPermissionChecked) return <main className="min-h-screen p-8">Loading completed job card…</main>;
  if (!job) return <main className="min-h-screen p-8">Job not found.</main>;

  const selected: string[] = (printMode !== null || autoPrint ? settings?.printFields : settings?.viewFields) || defaults;
  const has = (id: string) => selected.includes(id);
  const showPricing = canViewJobPricing && has("jobPricing");
  const numericStatusReadings = (fieldId: string) => {
    const recorded = (Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) => reading.fieldId === fieldId && String(reading.value ?? "").trim() !== "")
      .sort((left: any, right: any) => String(left.recordedAt || "").localeCompare(String(right.recordedAt || "")))
      .map((reading: any) => Number(String(reading.value).replace(/[^0-9.-]/g, "")))
      .filter((value: number) => Number.isFinite(value));
    if (recorded.length) return recorded;
    return String(job.statusFieldValues?.[fieldId] || "").split("#")
      .map((value) => Number(value.trim().replace(/[^0-9.-]/g, "")))
      .filter((value) => Number.isFinite(value));
  };
  const startKmReadings = numericStatusReadings("startKm");
  const endKmReadings = numericStatusReadings("endKm");
  const totalTravellingKm = startKmReadings
    .slice(0, Math.min(startKmReadings.length, endKmReadings.length))
    .reduce((total: number, startKm: number, index: number) => total + Math.max(0, endKmReadings[index] - startKm), 0);
  const configuredRateTotals = calculateCompanyRateTotals(companyRates, timers, totalTravellingKm);
  const hasConfiguredRates = companyRates.some((rate) => rate.active !== false);
  const bookedPartsCostTotal = materials.reduce((total: number, material: any) => {
    const inventoryItem = inventory.find((item: any) => item.id === material.inventoryId || (material.partNumber && item.partNumber === material.partNumber));
    const quantity = Math.max(0, Number(material.qty ?? material.quantity ?? 0));
    const unitCost = Number(material.costPrice ?? material.unitCost ?? material.cost ?? inventoryItem?.costPrice ?? inventoryItem?.unitCost ?? inventoryItem?.cost ?? 0);
    return total + quantity * unitCost;
  }, 0);
  const pricingPartsTotal = Number(job.partsTotal || materials.reduce((total: number, item: any) => total + Number(item.total ?? Number(item.qty || 0) * Number(item.sellPrice || 0)), 0));
  const pricingLabourTotal = hasConfiguredRates ? configuredRateTotals.labour : Number(job.labourTotal || 0);
  const pricingTravelTotal = hasConfiguredRates ? configuredRateTotals.travel : Number(job.travelTotal || 0);
  const pricingGrandTotal = pricingPartsTotal + pricingLabourTotal + pricingTravelTotal;
  const vehicle = job.vehicle || {};
  const fieldGroups = [
    {
      title: "Customer and Contact Details", rows: [
        { id: "customerCode", label: "Customer code", value: job.customerCode },
        { id: "customerName", label: "Customer", value: job.customerName },
        { id: "customerVatNumber", label: "VAT number", value: job.customerVatNumber || job.vatNumber },
        { id: "customerAddress", label: "Customer address", value: job.customerAddress },
        { id: "contactName", label: "Contact", value: job.contactName || job.customerContact },
        { id: "contactTelephone", label: "Telephone", value: job.contactNumber || job.customerContactNumber || job.customerTelephone },
        { id: "contactEmail", label: "Email", value: job.contactEmail || job.customerContactEmail },
        { id: "driverName", label: "Driver", value: job.driverName },
        { id: "driverContact", label: "Driver contact", value: job.driverContactNo || job.driverContactNumber },
        { id: "customerOrderNumber", label: "Customer Order Number", value: job.customerOrderNumber || job.purchaseOrderNumber || job.customerPoNumber || job.dynamicFields?.customerOrderNumber },
        { id: "referenceNumber", label: "Reference Number", value: job.referenceNumber || job.customerReference || job.dynamicFields?.referenceNumber },
        { id: "invoiceNumber", label: "Invoice Number", value: job.invoiceNumber || job.dynamicFields?.invoiceNumber },
      ]
    },
    {
      title: "Job Details", rows: [
        { id: "jobNumber", label: "Job number", value: job.jobNumber || id },
        { id: "jobType", label: "Job type", value: job.jobType || job.jobTypeName },
        { id: "location", label: "Location", value: job.breakdownLocation || job.locationName || job.locationDetails?.name || (typeof job.location === "object" ? job.location?.name : job.location) },
        { id: "locationAddress", label: "Location address", value: job.locationDetails?.address || job.locationDetails?.addressText || (typeof job.location === "object" ? job.location?.addressText : job.locationAddress) },
        { id: "description", label: "Description / reported fault", value: job.description },
        { id: "priority", label: "Priority", value: job.priority },
        { id: "createdAt", label: "Created", value: formatDocumentValue(job.createdAt) },
        { id: "previousJobNumber", label: "Previous Job Number", value: job.previousJobNumber || job.statusFieldValues?.previousJobNumber || job.dynamicFields?.previousJobNumber },
        { id: "gpsLink", label: "GPS link", value: job.locationDetails?.googleMapsLink || job.locationDetails?.googleMaps || (typeof job.location === "object" ? job.location?.googleMapsLink : job.googleMapsLink) },
        { id: "startKm", label: "Starting kilometres", value: readingValues(job, "startKm", job.statusFieldValues?.startKm || job.startKm) },
        { id: "endKm", label: "Ending kilometres", value: readingValues(job, "endKm", job.statusFieldValues?.endKm || job.endKm) },
        { id: "totalTravelling", label: "Total travelling", value: `${totalTravellingDistance(job).toLocaleString()} km` },
      ]
    },
    {
      title: "Vehicle / Asset Details", rows: [
        { id: "vehicleRegistration", label: "Registration", value: job.vehicleRegNo || job.vehicleRegistration || vehicle.vehicleReg || vehicle.regNo },
        { id: "fleetNumber", label: "Fleet number", value: job.vehicleFleetNo || job.fleetNumber || vehicle.fleetNo },
        { id: "vehicleMake", label: "Make", value: job.vehicleMake || vehicle.make },
        { id: "vehicleModel", label: "Model", value: job.vehicleModel || vehicle.model },
        { id: "vehicleType", label: "Vehicle type", value: job.vehicleType || vehicle.type },
        { id: "vinNumber", label: "VIN / chassis", value: job.vinNumber || vehicle.vinNumber },
      ]
    },
    {
      title: "Work and Operational Information", rows: [
        { id: "assignedUsers", label: "Assigned users", value: job.assignedTo || (job.assignedUsers || []).map((item: any) => item.name || `${item.firstName || ""} ${item.surname || item.lastName || ""}`.trim()).filter(Boolean).join(", ") },
        { id: "assignedVehicle", label: "Assigned service vehicle", value: job.assignedVehicle || job.assignedVan },
        { id: "statusHistory", label: "Status history", value: (job.statusHistory || []).map((item: any) => item.status || item.statusName).filter(Boolean).join(" → ") },
        { id: "jobNotes", label: "Job notes", value: job.notes || job.workCompleted },
        { id: "labourSummary", label: "Labour summary", value: job.labourSummary || job.workCompleted },
        { id: "instructions", label: "Instructions", value: job.instructions },
        { id: "reasons", label: settings?.editableLabels?.reasons || "Hold reason", value: job.dynamicFields?.reasons || job.statusReason || job.reason || job.statusNote },
      ]
    },
    {
      title: "Approval and Completion", rows: [
        { id: "customerSignatory", label: "Customer signatory", value: job.customerSignatory || job.customerSignatoryName },
        { id: "technicianName", label: "Technician name", value: job.technicianName || job.completedByName || job.assignedTo },
        { id: "approvalDate", label: "Completion / approval date", value: formatDocumentValue(job.approvalDate || job.completedAt || job.closedAt) },
      ]
    },
    {
      title: "Custom and Additional Job Fields", rows: [
        "traveledFor",
        "customtext1", "customtext2", "customtext3", "customtext4",
        "customfield1", "customfield2", "customfield3", "customfield4", "customfield5",
        "customfield6", "customfield7", "customfield8", "customfield9", "customfield10",
      ].map((fieldId) => ({
        id: fieldId,
        label: settings?.editableLabels?.[fieldId] || (fieldId === "traveledFor" ? "Traveled for / description" : fieldId),
        value: readingValues(
          job,
          fieldId,
          job.dynamicFields?.[fieldId] ?? job.statusFieldValues?.[fieldId] ?? job[fieldId] ?? (fieldId === "traveledFor" ? job.travelledFor : undefined)
        ),
      }))
    },
  ].map((group) => ({
    ...group,
    rows: group.rows.filter((row) => has(row.id) && !pricingFieldIds.has(row.id)),
  })).filter((group) => group.rows.length);
  const forms = Array.isArray(job.jobForms) ? job.jobForms : job.jobFormTemplateId ? [{ id: job.jobFormTemplateId, templateName: job.jobFormTemplateName, fields: job.jobFormFields }] : [];
  const photoPages = Array.from({ length: Math.ceil(photos.length / 4) }, (_, index) => photos.slice(index * 4, index * 4 + 4));
  const linkedDocumentRows = [
    { id: "linkedPurchaseOrder", label: "Purchase Order", numbers: documentNumbers("purchase", job.purchaseOrders, linkedItems, job.purchaseOrderNumber) },
    { id: "linkedPartsRequisition", label: "Parts Requisitions", numbers: documentNumbers("parts_requisition", job.partsRequisitions, linkedItems, job.partsRequisitionNumber) },
    { id: "linkedPartsDerequisition", label: "Parts Derequisitions", numbers: documentNumbers("parts_derequisition", job.partsDerequisitions, linkedItems, job.partsDerequisitionNumber) },
    { id: "linkedQuote", label: "Quotes", numbers: documentNumbers("quote", job.quotes, linkedItems, job.quoteNumber) },
    { id: "linkedInvoice", label: "Invoices", numbers: documentNumbers("invoice", job.invoices, linkedItems, job.invoiceNumber) },
  ].map((document) => ({ ...document, enabled: has(document.id) }));
  const showLinkedDocuments = linkedDocumentRows.some((document) => document.enabled);
  const isReasonOrNoteField = (value: unknown) => /reason|note|comment|travel(?:ed|led)?\s*for/i.test(String(value || ""));
  const statusReasonAndNoteRows = [
    ...(Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) => String(reading.value ?? "").trim() && (isReasonOrNoteField(reading.fieldId) || isReasonOrNoteField(reading.label)))
      .map((reading: any) => ({
        key: reading.id || `${reading.fieldId}-${reading.recordedAt}-${reading.value}`,
        type: reading.label || "Status reason / note",
        message: String(reading.value).trim(),
        context: reading.statusName || "Status update",
        createdBy: reading.recordedByName || "System",
        timestamp: reading.recordedAt || reading.createdAt || "",
      })),
    ...(Array.isArray(job.statusHistory) ? job.statusHistory : []).flatMap((entry: any, index: number) => [
      { type: "Status reason", message: entry.reason || entry.statusReason || entry.reasonName },
      { type: "Status note", message: entry.note || entry.statusNote || entry.comment },
    ].filter((item) => String(item.message || "").trim()).map((item) => ({
      key: `${entry.id || index}-${item.type}`,
      type: item.type,
      message: String(item.message).trim(),
      context: entry.statusName || entry.status || "Status update",
      createdBy: entry.updatedByName || entry.createdByName || "System",
      timestamp: entry.enteredAt || entry.createdAt || entry.updatedAt || "",
    }))),
    ...[
      { key: "legacy-status-reason", type: "Status reason", message: job.statusReason || job.reason, context: job.status || "Status update", createdBy: job.updatedByName || "System", timestamp: job.updatedAt || "" },
      { key: "legacy-status-note", type: "Status note", message: job.statusNote, context: job.status || "Status update", createdBy: job.updatedByName || "System", timestamp: job.updatedAt || "" },
    ].filter((entry) => String(entry.message || "").trim()),
  ].filter((entry, index, entries) => index === entries.findIndex((candidate) =>
    candidate.type === entry.type && candidate.message === entry.message && candidate.context === entry.context && String(candidate.timestamp || "") === String(entry.timestamp || "")
  ));
  const jobNoteAndStatusRows = [
    ...(has("internalComments") ? notes.map((note) => {
      const sentMessages = communications.filter((communication) => communication.noteId === note.id && communication.source === "job-note");
      const recipients = Array.from(new Set(sentMessages.map((message) => message.recipientName || message.recipientEmail).filter(Boolean))).join(", ");
      const assignedNames = (job.assignedUsers || []).map((user: any) => `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim() || user.name || user.displayName).filter(Boolean).join(", ") || job.assignedTo || "System";
      const recordedBy = !note.createdByName || note.createdByName === "Unknown User" ? assignedNames : note.createdByName;
      return {
        key: `note-${note.id}`,
        type: sentMessages.length ? "Message" : note.visibility === "public" ? "Public comment" : "Internal comment",
        message: note.comment || note.text || "—",
        context: recipients || "Not sent",
        createdBy: recordedBy,
        timestamp: note.createdAt,
      };
    }) : []),
    ...(has("statusReasonsAndNotes") ? statusReasonAndNoteRows : []),
  ].sort((left, right) => timestampMillis(right.timestamp) - timestampMillis(left.timestamp));
  const printableAttachments = [...documentAttachments, ...(job.attachments || [])].filter(
    (attachment: any, index: number, attachments: any[]) => {
      const identity = attachment.id || attachment.url || attachment.fileName || attachment.name;
      return index === attachments.findIndex((candidate: any) =>
        (candidate.id || candidate.url || candidate.fileName || candidate.name) === identity
      );
    }
  );
  const palette = { primary: "#164e7a", primaryText: "#ffffff", labelBackground: "#e2e8f0", alternateBackground: "#f8fafc", border: "#94a3b8", ...(settings?.palette || {}) };
  const paletteStyle = { "--job-card-primary": palette.primary, "--job-card-primary-text": palette.primaryText, "--job-card-label-bg": palette.labelBackground, "--job-card-alternate": palette.alternateBackground, "--job-card-border": palette.border } as React.CSSProperties;
  const printJobCard = async (mode: PrintMode) => {
    setPrintMode(mode);
    setShowPrintOptions(false);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    const printableImages = Array.from(document.querySelectorAll<HTMLImageElement>(".job-photo-print-page img"));
    await Promise.race([
      Promise.all(printableImages.map((image) => image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        })
      )),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
    ]);
    window.setTimeout(() => window.print(), 300);
  };

  return <main className="completed-job-card job-card-palette bg-slate-100 py-6 print:bg-white print:py-0" style={paletteStyle}>
    <div className="no-print sticky top-0 z-20 mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 shadow print:hidden">
      <Link href={`/jobs/${id}`} className="rounded-lg border px-4 py-2 font-bold">← Back to Job</Link>
      <div className="flex gap-2">
        <select value={outputType} onChange={(event) => window.location.href = `/jobs/${id}/jobcard?type=${event.target.value}`} className="rounded-lg border px-3 py-2 font-bold"><option value="internal">Internal Job Card</option><option value="customer">Customer Job Card</option></select>
        <div className="relative">
          <button onClick={() => setShowPrintOptions((current) => !current)} className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white">🖨 Print / Save PDF</button>
          {showPrintOptions && <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl">
            <button type="button" onClick={() => void printJobCard("all")} className="block w-full px-4 py-3 text-left hover:bg-blue-50"><strong className="block text-sm">Print Job Card with All Forms and Photo Album</strong><span className="mt-1 block text-xs text-gray-500">Includes the job card, configured job forms, and job photos.</span></button>
            <button type="button" onClick={() => void printJobCard("jobcard-forms")} className="block w-full border-t px-4 py-3 text-left hover:bg-blue-50"><strong className="block text-sm">Print Job Card with Forms Only</strong><span className="mt-1 block text-xs text-gray-500">Includes the job card and forms; excludes the photo album.</span></button>
            <button type="button" onClick={() => void printJobCard("forms")} className="block w-full border-t px-4 py-3 text-left hover:bg-blue-50"><strong className="block text-sm">Print Job Forms Only</strong><span className="mt-1 block text-xs text-gray-500">Prints the allocated job forms without the job card or photos.</span></button>
            <button type="button" onClick={() => void printJobCard("jobcard")} className="block w-full border-t px-4 py-3 text-left hover:bg-blue-50"><strong className="block text-sm">Print Job Card Only</strong><span className="mt-1 block text-xs text-gray-500">Excludes forms and photos.</span></button>
          </div>}
        </div>
      </div>
    </div>

    <article className={`job-card-a4 mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-[8mm] text-slate-900 shadow print:shadow-none ${printMode === "forms" || printMode === "photos" ? "print:hidden" : ""}`}>
      <CompanyHeader company={company} job={job} title={settings?.documentTitle || "Job Card"} subtitle={`${outputType} document`} jobNumber={job.jobNumber || id} showDetails={has("companyDetails")} showLogo={has("companyLogo")} showTitle={has("jobCardTitle")} showJobNumber={has("jobNumber")} showEmployee={outputType === "internal"} />
      <div className="space-y-2">{fieldGroups.map((group) => <section key={group.title} className="job-card-section"><h2 className="job-card-section-title">{group.title}</h2><div className={`job-card-field-grid ${group.title === "Vehicle / Asset Details" ? "job-card-vehicle-grid" : ""}`}>{group.rows.map((row) => <div key={row.id} className={`job-card-field ${wideJobCardFieldIds.has(row.id) ? "job-card-field-wide" : ""} ${row.id === "locationAddress" ? "job-card-location-address" : ""} ${row.id === "description" ? "job-card-description" : ""}`}><p className="job-card-field-label">{row.label}</p><p className="job-card-field-value">{String(row.value || "—")}</p></div>)}</div></section>)}</div>
      {showLinkedDocuments && <section className="job-card-section mt-2">
        <h2 className="job-card-section-title">Linked Documents</h2>
        <div className="grid grid-cols-5">
          {linkedDocumentRows.map((document) => <div key={document.id} className="job-card-field min-w-0">
            <p className="job-card-field-label">{document.label}</p>
            <div className="job-card-field-value space-y-1">
              {document.enabled && document.numbers.map((number) => <p key={number} className="break-words">{number}</p>)}
            </div>
          </div>)}
        </div>
      </section>}
      {has("materials") && <JobCardTable title="Parts and Services Booked" headers={["Part / Service Code", "Description", ...(has("materialType") ? ["Type"] : []), "Unit", ...(has("materialCostPriceExcl") ? ["Cost Price Excl."] : []), "Quantity"]} rows={job.noPartsUsed === true ? [] : materials.map((item) => [item.partNumber || item.code || item.inventoryCode || "—", item.description || item.name || "—", ...(has("materialType") ? [item.category || item.type || "Part / Service"] : []), item.unit || item.uom || "—", ...(has("materialCostPriceExcl") ? [formatMoney(item.costPrice ?? item.unitCost ?? item.cost)] : []), String(item.qty ?? item.quantity ?? 0)])} emptyMessage={job.noPartsUsed === true ? "No Parts Used" : "No parts or services booked on this job."} emphasizeEmpty={job.noPartsUsed === true} />}
      {(has("jobCosting") || showPricing) && <div className="grid grid-cols-1 gap-2 md:grid-cols-2 print:grid-cols-2">
        {has("jobCosting") && <JobCardTable title="Job Summary / Costing" headers={["Cost Line", "Amount / Value"]} rows={[
          ["Parts Cost Total", formatMoney(bookedPartsCostTotal)],
          ["Travelling Cost (CPK)", formatMoney(configuredRateTotals.travellingCost)],
          ["Total Travelling", `${totalTravellingKm.toLocaleString()} km`],
          ["Total Cost", formatMoney(bookedPartsCostTotal + configuredRateTotals.travellingCost)],
        ]} emptyMessage="No job costs recorded." />}
        {showPricing && <JobCardTable title="Job Summary / Job Pricing" headers={["Pricing Line", "Amount / Value"]} rows={[
          ["Parts Total", formatMoney(pricingPartsTotal)],
          ["Labour", formatMoney(pricingLabourTotal)],
          ["Travel", formatMoney(pricingTravelTotal)],
          ...(hasConfiguredRates ? [["Travel time", formatMoney(configuredRateTotals.travelTime)], ["Travelling distance", formatMoney(configuredRateTotals.travelling)]] : []),
          ["Total Travelling", `${totalTravellingKm.toLocaleString()} km`],
          ["Total", formatMoney(hasConfiguredRates ? pricingGrandTotal : Number(job.total || pricingGrandTotal))],
        ]} emptyMessage="No job pricing recorded." />}
      </div>}
      {has("timers") && <JobCardTable title="Job Timers" headers={["Employee", "Description", "Billable", "Overtime", "Date", "Start", "End", "Duration"]} rows={timers.map((timer) => {
        const start = timestampDate(timer.startTime); const end = timestampDate(timer.endTime);
        return [timer.employeeName || timer.technicianName || "—", timer.description || timer.statusName || "—", timer.billable === true ? "Yes" : "No", timer.overtime === true ? "Yes" : "No", start ? start.toLocaleDateString("en-ZA") : "—", start ? start.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—", end ? end.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }) : timer.active ? "Running" : "—", formatTimerDuration(start, end)];
      })} footer={["TOTAL", "", "", "", "", "", "", formatTotalDuration(timers)]} emptyMessage="No timers recorded on this job." />}
      {has("tasks") && <JobCardTable title="Job Tasks" headers={["Description", "Assigned To", "Status", "Result"]} rows={tasks.map((task) => [task.name || task.description || "—", task.assignedTo || task.assignedUserName || "Unassigned", task.completed === true ? "Completed" : "Outstanding", task.result || task.value || "—"])} emptyMessage="No tasks allocated to this job." />}
      {has("jobSummary") && <JobCardTable title="Job Status Summary" headers={["Status", "Entered", "Updated By"]} rows={(job.statusHistory || []).map((entry: any) => [entry.statusName || entry.status || "—", formatDocumentValue(entry.enteredAt || entry.createdAt), entry.updatedByName || entry.createdByName || "System"])} emptyMessage="No job status history recorded." />}
      {(has("internalComments") || has("statusReasonsAndNotes")) && <JobCardTable
        title="Job Notes / Internal Comments"
        headers={["Type", "Comment / Message", "Status / Sent To", "Created By", "Timestamp"]}
        rows={jobNoteAndStatusRows.map((entry) => [entry.type, entry.message, entry.context, entry.createdBy, formatDocumentValue(entry.timestamp)])}
        emptyMessage="No job notes, comments, status reasons, or status notes recorded."
      />}
      {has("attachments") && <JobCardTable title="Attachments" headers={["File", "Type", "Added By"]} rows={printableAttachments.map((attachment: any) => [attachment.name || attachment.fileName || attachment.fileNameOriginal || "—", attachment.type || attachment.fileType || attachment.category || "Attachment", attachment.createdByName || attachment.uploadedByName || attachment.addedByName || "—"])} emptyMessage="No attachments recorded on this job." />}
      {has("terms") && <section className="job-card-section mt-2"><h2 className="job-card-section-title">Terms and approval</h2><p className="whitespace-pre-wrap p-2 text-[8px]">{job.jobCardCustomerSignatureTerms || job.terms || "Work completed is subject to FleetFix standard service terms and conditions."}</p></section>}
      {(has("technicianSignature") || has("customerSignature")) && <div className="mt-7 grid grid-cols-2 gap-10">
        {has("technicianSignature") && <div className="border-b pb-2 text-[8px] font-black uppercase text-slate-400">Technician signature</div>}
        {has("customerSignature") && <div className="border-b pb-2 text-[8px]">
          {job.customerSignature || job.jobCardCustomerSignature ? <img src={job.customerSignature || job.jobCardCustomerSignature} alt="Customer signature" className="mb-1 h-14 w-full object-contain object-left" /> : <div className="h-14" />}
          <div className="font-black uppercase text-slate-400">Customer signature</div>
          {(job.customerSignatory || job.jobCardCustomerSignedAt) && <div className="mt-1 normal-case text-slate-600">{[job.customerSignatory, formatDocumentValue(job.jobCardCustomerSignedAt)].filter(Boolean).join(" · ")}</div>}
        </div>}
      </div>}
      {(has("footer") || has("pageNumbers")) && <footer className="mt-4 flex items-center justify-between border-t pt-2 text-[8px] text-slate-400"><span>{has("footer") ? job.footer || "Thank you for choosing FleetFix." : ""}</span><span>{has("pageNumbers") ? "Job card · Page 1" : ""}</span></footer>}
    </article>

    <div className={printMode === "jobcard" || printMode === "photos" ? "print:hidden" : ""}>{(printMode === "all" || printMode === "jobcard-forms" || printMode === "forms" || has("jobForms")) && forms.map((form: any, index: number) => <ExactJobFormFrame key={form.id || index} jobId={id} formId={form.id || form.templateId} palette={palette} printEnabled={printMode !== "jobcard" && printMode !== "photos"} startOnNewPage={index === 0} />)}</div>

    <div className={printMode === "forms" || printMode === "jobcard-forms" || printMode === "jobcard" ? "print:hidden" : ""}>
      {(printMode === "all" || printMode === "photos" || has("photoAlbum")) && photoPages.map((page, pageIndex) => <article key={pageIndex} className="job-photo-print-page job-card-a4 job-card-page-break mx-auto mt-6 min-h-[297mm] w-full max-w-[210mm] bg-white p-[10mm] shadow print:shadow-none"><CompanyHeader company={company} title="Job Photos" subtitle={`Photo album · Page ${pageIndex + 1} of ${photoPages.length}`} jobNumber={job.jobNumber || id} showDetails={false} showLogo /><div className="mt-5 grid grid-cols-2 gap-5">{page.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.photoItemName || "Job photo"} className="aspect-[4/3] w-full rounded-xl border object-cover" />{has("photoCaptions") && <figcaption className="mt-2 border-l-2 border-blue-600 pl-2 text-[9px]"><strong>{photo.categoryName || "Job Photo"}</strong><br />{photo.photoItemName || photo.name}</figcaption>}</figure>)}</div><footer className="mt-6 border-t pt-2 text-right text-[8px] text-slate-400">Photos · Page {pageIndex + 1} of {photoPages.length}</footer></article>)}
    </div>
  </main>;
}

function CompanyHeader({ company, job, title, subtitle, jobNumber, showDetails, showLogo, showTitle = true, showJobNumber = true, showEmployee = true }: { company: CompanyDetails; job?: any; title: string; subtitle: string; jobNumber: string; showDetails: boolean; showLogo: boolean; showTitle?: boolean; showJobNumber?: boolean; showEmployee?: boolean }) {
  const companyLines = [
    company.physicalAddress,
    company.website,
    company.registrationNumber ? `Registration: ${company.registrationNumber}` : "",
    company.vatNumber ? `VAT: ${company.vatNumber}` : "",
    company.telephone ? `Contact: ${company.telephone}` : "",
    company.email ? `Email: ${company.email}` : "",
  ].filter(Boolean);
  const employee = job?.assignedTo || (job?.assignedUsers || []).map((user: any) =>
    user.name || user.displayName || `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim()
  ).filter(Boolean).join(", ") || "—";
  const status = typeof job?.status === "object" ? job.status?.name : job?.status;
  const information = [
    ["Customer", job?.customerName || job?.customer || "—"],
    ["Status", status || "—"],
    ["Date", formatDocumentValue(job?.dateBooked || job?.createdAt) || "—"],
    ...(showEmployee ? [["Employee", employee]] : []),
  ];
  return <header className="border-b-[3px] border-blue-700 pb-3"><div className="flex min-h-[103px] justify-between gap-5"><div className="flex min-w-0 items-start gap-4">{showLogo && company.logo ? <img src={company.logo} alt={`${company.companyName || "Company"} logo`} className="h-20 w-24 shrink-0 object-contain" /> : null}{showDetails && <div className="min-w-0"><strong className="text-lg font-black tracking-tight text-blue-700">{company.companyName || "Company Name"}</strong><div className="mt-1 flex flex-col gap-[2px]">{companyLines.map((line, index) => <p key={`${line}-${index}`} className="max-w-md whitespace-nowrap text-[8px] leading-[10px] text-slate-500">{line}</p>)}</div></div>}</div>{job && <div className="grid h-fit w-[245px] shrink-0 grid-cols-[74px_1fr] overflow-hidden rounded border border-slate-400 text-[8px]">{information.map(([label, value]) => <div key={label} className="contents"><strong className="border-b border-r border-slate-300 bg-slate-100 px-2 py-1">{label}</strong><span className="truncate border-b border-slate-300 px-2 py-1 font-bold" title={String(value)}>{value}</span></div>)}</div>}</div><div className="flex items-end justify-end gap-3 text-right">{showTitle && <h1 className="text-lg font-black leading-tight">{title}:</h1>}{showJobNumber && <p className="text-lg font-black leading-tight">{jobNumber}</p>}</div></header>;
}

function ExactJobFormFrame({ jobId, formId, palette, printEnabled, startOnNewPage }: { jobId: string; formId: string; palette: Record<string, string>; printEnabled: boolean; startOnNewPage: boolean }) {
  const [height, setHeight] = useState(1122);
  const [printableHtml, setPrintableHtml] = useState("");
  const paletteQuery = new URLSearchParams({ primary: palette.primary, primaryText: palette.primaryText, labelBackground: palette.labelBackground, alternateBackground: palette.alternateBackground, border: palette.border }).toString();
  const paletteStyle = { "--job-card-primary": palette.primary, "--job-card-primary-text": palette.primaryText, "--job-card-label-bg": palette.labelBackground, "--job-card-alternate": palette.alternateBackground, "--job-card-border": palette.border } as React.CSSProperties;

  function preparePrintableForm(frame: HTMLIFrameElement) {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) return false;
    const source = frameDocument.querySelector<HTMLElement>(".job-form-print-canvas");
    if (!source) return false;

    const clone = source.cloneNode(true) as HTMLElement;
    const sourceControls = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    const clonedControls = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    sourceControls.forEach((control, index) => {
      const clonedControl = clonedControls[index];
      if (!clonedControl) return;
      if (control.tagName === "INPUT") {
        const sourceInput = control as HTMLInputElement;
        clonedControl.setAttribute("value", sourceInput.value);
        if (sourceInput.checked) clonedControl.setAttribute("checked", "checked");
        else clonedControl.removeAttribute("checked");
      } else if (control.tagName === "TEXTAREA") {
        clonedControl.textContent = (control as HTMLTextAreaElement).value;
      } else if (control.tagName === "SELECT") {
        const sourceSelect = control as HTMLSelectElement;
        const clonedSelect = clonedControl as HTMLSelectElement;
        Array.from(clonedSelect.options || []).forEach((option, optionIndex) => {
          if (optionIndex === sourceSelect.selectedIndex) option.setAttribute("selected", "selected");
          else option.removeAttribute("selected");
        });
      }
    });

    const sourceCanvases = source.querySelectorAll<HTMLCanvasElement>("canvas");
    const clonedCanvases = clone.querySelectorAll<HTMLCanvasElement>("canvas");
    sourceCanvases.forEach((sourceCanvas, index) => {
      const clonedCanvas = clonedCanvases[index];
      if (!clonedCanvas) return;
      try {
        const signatureImage = frameDocument.createElement("img");
        signatureImage.src = sourceCanvas.toDataURL("image/png");
        signatureImage.alt = sourceCanvas.getAttribute("aria-label") || "Signature";
        signatureImage.className = sourceCanvas.className;
        signatureImage.setAttribute("style", sourceCanvas.getAttribute("style") || "width:100%;height:100%;object-fit:contain;");
        signatureImage.style.objectFit = "contain";
        clonedCanvas.replaceWith(signatureImage);
      } catch (error) {
        console.error("Unable to prepare signature for printing", error);
      }
    });

    setHeight(Math.max(1122, frameDocument.documentElement.scrollHeight, frameDocument.body.scrollHeight, source.scrollHeight));
    setPrintableHtml(clone.outerHTML);
    return true;
  }

  return <section className={`exact-job-form-page ${startOnNewPage ? "job-card-page-break" : ""} mx-auto mt-6 w-full max-w-[210mm] overflow-hidden bg-white shadow print:mt-0 print:shadow-none ${printEnabled ? "" : "print:hidden"}`} style={paletteStyle}>
    <iframe
      src={`/jobs/${jobId}/form/${formId}?pdf=1&embedded=1&${paletteQuery}`}
      title={`Completed job form ${formId}`}
      className="block w-full border-0 print:hidden"
      style={{ height }}
      onLoad={(event) => {
        const frame = event.currentTarget;
        let attempts = 0;
        const capture = window.setInterval(() => {
          attempts += 1;
          if (preparePrintableForm(frame) || attempts >= 40) {
            window.clearInterval(capture);
          }
        }, 250);
      }}
    />
    {printableHtml ? (
      <div className="job-form-print-copy w-[210mm] overflow-visible bg-white" dangerouslySetInnerHTML={{ __html: printableHtml }} />
    ) : (
      <div className="job-form-print-loading min-h-[297mm] items-center justify-center p-10 text-center text-sm text-gray-500">
        The linked job form is still loading. Close the print dialog, wait a moment and print again.
      </div>
    )}
  </section>;
}

function formatDocumentValue(value: any) {
  if (!value) return "";
  const date = value?.toDate?.() || (typeof value === "string" || typeof value === "number" ? new Date(value) : null);
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", hour12: false });
  }
  return String(value);
}

function formatMoney(value: any) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `R ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

function JobCardTable({ title, headers, rows, footer, emptyMessage, emphasizeEmpty = false }: { title: string; headers: string[]; rows: string[][]; footer?: string[]; emptyMessage: string; emphasizeEmpty?: boolean }) {
  return <section className="job-card-section mt-2"><h2 className="job-card-section-title">{title}</h2>{rows.length ? <div><div className="grid bg-slate-200" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>{headers.map((header) => <span key={header} className="border-r border-slate-300 px-1.5 py-1 text-[6px] font-black uppercase text-slate-700">{header}</span>)}</div>{rows.map((row, rowIndex) => <div key={rowIndex} className={`grid border-t border-slate-300 ${rowIndex % 2 ? "bg-slate-50" : "bg-white"}`} style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>{row.map((value, cellIndex) => <span key={cellIndex} className="overflow-hidden border-r border-slate-200 px-1.5 py-1 text-[7px]">{value}</span>)}</div>)}{footer && <div className="grid border-t-2 border-slate-500 bg-slate-100 font-black" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>{footer.map((value, cellIndex) => <span key={cellIndex} className="border-r px-1.5 py-1 text-[7px]">{value}</span>)}</div>}</div> : <p className={`p-2 ${emphasizeEmpty ? "text-[10px] font-black text-slate-900" : "text-[8px] text-slate-400"}`}>{emptyMessage}</p>}</section>;
}

function timestampDate(value: any): Date | null {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function timestampMillis(value: any) {
  return timestampDate(value)?.getTime() || 0;
}

function timerSeconds(start: Date | null, end: Date | null) {
  if (!start) return 0;
  return Math.max(0, Math.floor(((end || new Date()).getTime() - start.getTime()) / 1000));
}

function displayDuration(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days ? `${String(days).padStart(2, "0")}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTimerDuration(start: Date | null, end: Date | null) {
  return start ? displayDuration(timerSeconds(start, end)) : "00:00:00";
}

function formatTotalDuration(timers: any[]) {
  return displayDuration(timers.reduce((total, timer) => total + timerSeconds(timestampDate(timer.startTime), timestampDate(timer.endTime)), 0));
}

function documentNumbers(kind: "quote" | "purchase" | "invoice" | "parts_requisition" | "parts_derequisition", jobDocuments: any, linkedItems: any[], directNumber: any) {
  const terms = kind === "purchase" ? ["purchase", "po"] : kind === "parts_requisition" ? ["parts_requisition", "parts requisition", "requisition"] : kind === "parts_derequisition" ? ["parts_derequisition", "parts derequisition", "derequisition", "stock return"] : [kind];
  const candidates = [
    ...(Array.isArray(jobDocuments) ? jobDocuments : []),
    ...linkedItems.filter((item) => {
      const type = String(item.documentType || item.type || item.category || item.module || "").toLowerCase();
      return terms.some((term) => type.includes(term));
    }),
    ...(directNumber ? [{ referenceNumber: directNumber }] : []),
  ];
  return Array.from(new Set(candidates.map((item) => String(item.referenceNumber || item.documentNumber || item.requisitionNumber || item.derequisitionNumber || item.purchaseOrderNumber || item.quoteNumber || item.invoiceNumber || item.number || item.jobNumber || item.code || "").trim()).filter(Boolean)));
}

function readingValues(job: any, fieldId: string, legacyValue: any) {
  const readings = (Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
    .filter((reading: any) => reading.fieldId === fieldId && String(reading.value ?? "").trim() !== "")
    .sort((a: any, b: any) => String(a.recordedAt || "").localeCompare(String(b.recordedAt || "")))
    .map((reading: any) => String(reading.value).trim());
  if (readings.length) return readings.join(" # ");
  return legacyValue ? String(legacyValue) : "";
}

function totalTravellingDistance(job: any) {
  const numericReadings = (fieldId: string) => {
    const recorded = (Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) => reading.fieldId === fieldId && String(reading.value ?? "").trim() !== "")
      .sort((left: any, right: any) => String(left.recordedAt || "").localeCompare(String(right.recordedAt || "")))
      .map((reading: any) => Number(String(reading.value).replace(/[^0-9.-]/g, "")))
      .filter((value: number) => Number.isFinite(value));
    if (recorded.length) return recorded;
    return String(job.statusFieldValues?.[fieldId] || "")
      .split("#")
      .map((value) => Number(value.trim().replace(/[^0-9.-]/g, "")))
      .filter((value) => Number.isFinite(value));
  };
  const starts = numericReadings("startKm");
  const ends = numericReadings("endKm");
  return starts.slice(0, Math.min(starts.length, ends.length)).reduce(
    (total: number, start: number, index: number) => total + Math.max(0, ends[index] - start),
    0
  );
}
