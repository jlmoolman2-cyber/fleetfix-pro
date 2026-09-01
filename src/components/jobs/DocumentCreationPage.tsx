"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  defaultDocumentLineColumnIds,
  documentLineColumns,
} from "@/components/admin/DocumentLineColumnSettings";
import JobItemPickerModal, {
  JobCardItem,
} from "@/components/jobs/JobItemPickerModal";
import { auditFields, creationAuditFields, getAuditActor } from "@/lib/audit";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { hasPermission, hasPrivilegedRole } from "@/lib/accessControl";
import { ALL_PERMISSIONS } from "@/lib/permissions";

type DocumentType = "quote" | "invoice";
type Line = {
  id: string;
  inventoryId: string;
  inventorySearch: string;
  code: string;
  description: string;
  stockLocationId: string;
  stockLocationName: string;
  stockWarning: "" | "NO STOCK" | "RESERVED STOCK";
  quantity: number;
  cost: number;
  markup: number;
  priceExcl: number;
  priceIncl: number;
  discount: number;
  taxRate: number;
  lineType: "item" | "description";
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankLine = (): Line => ({
  id: uid(),
  inventoryId: "",
  inventorySearch: "",
  code: "",
  description: "",
  stockLocationId: "",
  stockLocationName: "",
  stockWarning: "",
  quantity: 1,
  cost: 0,
  markup: 0,
  priceExcl: 0,
  priceIncl: 0,
  discount: 0,
  taxRate: 15,
  lineType: "item",
});
const blankDescriptionLine = (): Line => ({
  ...blankLine(),
  lineType: "description",
  quantity: 0,
  taxRate: 0,
});
const money = (value: number) => `R ${value.toFixed(2)}`;
const MAX_MONEY_VALUE = 999999.99;
const MAX_QUANTITY_VALUE = 10000;
const MAX_DISCOUNT_VALUE = 99.99;

const isDescriptionLine = (line: Partial<Line>) =>
  line.lineType === "description";

function lineTotals(line: Line) {
  const quantity = Number(line.quantity) || 0;
  const priceIncl = Number(line.priceIncl) || 0;
  const discountFactor = 1 - (Number(line.discount) || 0) / 100;
  const totalIncl = Math.min(MAX_MONEY_VALUE, priceIncl * quantity * Math.max(0, discountFactor));
  const totalExcl = Math.min(MAX_MONEY_VALUE, totalIncl / (1 + (Number(line.taxRate) || 0) / 100));
  const tax = totalIncl - totalExcl;
  const profit = totalExcl - (Number(line.cost) || 0) * quantity;
  return { totalIncl, totalExcl, tax, profit };
}

export default function DocumentCreationPage({
  type,
  documentId,
}: {
  type: DocumentType;
  documentId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedJobId = searchParams.get("jobId");
  const copyFromId = searchParams.get("copyFrom");
  const sourceQuoteId = searchParams.get("quoteId");
  const [documentJobId, setDocumentJobId] = useState(requestedJobId || "");
  const jobId = documentJobId || requestedJobId;
  const label = type === "quote" ? "Quote" : "Invoice";
  const [job, setJob] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showInvoiceActions, setShowInvoiceActions] = useState(false);
  const [showAddLineOptions, setShowAddLineOptions] = useState(false);
  const [jobItemPickerMode, setJobItemPickerMode] = useState<
    "prompt" | "select" | null
  >(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [inventory, setInventory] = useState<any[]>([]);
  const [stockLocations, setStockLocations] = useState<any[]>([]);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [stockLocationPicker, setStockLocationPicker] = useState<{
    lineId: string;
    inventoryId: string;
  } | null>(null);
  const [financialColumnPermissions, setFinancialColumnPermissions] = useState({
    cost: false,
    markup: false,
  });
  const [userPermissions, setUserPermissions] = useState<
    Record<string, boolean>
  >({});
  const [canRevertInvoice, setCanRevertInvoice] = useState(false);
  const [canRecordInvoicePayments, setCanRecordInvoicePayments] = useState(false);
  const [documentStatus, setDocumentStatus] = useState("");
  const [quoteApproval, setQuoteApproval] = useState<{
    name: string;
    signature: string;
    approvedAt: any;
  } | null>(null);
  const [invoiceAmountPaid, setInvoiceAmountPaid] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    amount: "0.00",
    dateReceived: new Date().toISOString().slice(0, 10),
    reference: "",
    description: "",
  });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [notes, setNotes] = useState("");
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(
    defaultDocumentLineColumnIds,
  );
  const [documentSettings, setDocumentSettings] = useState<any>({});

  async function openEmailOptions() {
    if (!documentId) return;
    router.push(
      `/messages/compose?module=${type === "quote" ? "Quote" : "Invoice"}&documentId=${documentId}${jobId ? `&jobId=${jobId}` : ""}`,
    );
  }

  useEffect(() => {
    Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "customers")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "inventory")),
      getDoc(doc(clientDb, "companies", COMPANY_ID, "documentSettings", type)),
    ]).then(([customerSnapshot, inventorySnapshot, settingsSnapshot]) => {
      setCustomers(
        customerSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a: any, b: any) =>
            String(
              a.companyName || a.customerName || a.name || "",
            ).localeCompare(
              String(b.companyName || b.customerName || b.name || ""),
            ),
          ),
      );
      setInventory(
        inventorySnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      );
      if (settingsSnapshot.exists()) {
        const settings = settingsSnapshot.data();
        setDocumentSettings(settings);
        if (Array.isArray(settings.viewLineColumns))
          setVisibleColumnIds(settings.viewLineColumns);
        else if (Array.isArray(settings.lineColumns))
          setVisibleColumnIds(settings.lineColumns);
        if (!documentId && settings.defaultNote)
          setNotes(String(settings.defaultNote));
      }
    });
  }, [type]);

  useEffect(() => {
    Promise.all([
      getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory_settings",
          "setup",
          "warehouses",
        ),
      ),
      getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory_settings",
          "setup",
          "rav",
        ),
      ),
      getDoc(
        doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup"),
      ),
    ]).then(([warehouses, vehicles, inventorySettings]) => {
      setAllowNegativeStock(
        inventorySettings.exists() &&
          inventorySettings.data().allowNegativeStock === true,
      );
      setStockLocations([
        ...warehouses.docs.map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.data().name || snapshot.id,
          type: "warehouse",
        })),
        ...vehicles.docs.map((snapshot) => ({
          id: snapshot.id,
          name: snapshot.data().name || snapshot.id,
          type: "rav",
        })),
      ]);
    });
    const auth = getAuth();
    auth.authStateReady().then(async () => {
      if (!auth.currentUser) return;
      const [companyUser, globalUser] = await Promise.all([
        getDoc(
          doc(clientDb, "companies", COMPANY_ID, "users", auth.currentUser.uid),
        ),
        getDoc(doc(clientDb, "users", auth.currentUser.uid)),
      ]);
      const globalData = globalUser.exists() ? globalUser.data() : {};
      const companyData = companyUser.exists() ? companyUser.data() : {};
      const userData = { ...globalData, ...companyData };
      const savedPermissions = {
        ...(globalData.permissions || {}),
        ...(companyData.permissions || {}),
      };
      const permissions = savedPermissions;
      const role = String(
        companyData.primaryRole ||
          companyData.role ||
          globalData.primaryRole ||
          globalData.role ||
          "",
      ).toLowerCase();
      setUserPermissions(permissions);
      setCanRevertInvoice(
        hasPermission(permissions, "Revert invoices to draft") ||
          hasPrivilegedRole(role),
      );
      setCanRecordInvoicePayments(
        hasPermission(permissions, "Record invoice payments") ||
          hasPrivilegedRole(role),
      );
      setFinancialColumnPermissions({
        cost: hasPermission(permissions, `View ${type} item cost`),
        markup: hasPermission(permissions, `View ${type} item markup`),
      });
    });
  }, [type]);

  useEffect(() => {
    if (!documentId) return;
    getDoc(doc(clientDb, "companies", COMPANY_ID, `${type}s`, documentId)).then(
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as any;
        setDocumentStatus(data.status || "unpaid");
        if (type === "quote" && data.approved)
          setQuoteApproval({
            name:
              data.customerApprovedByName ||
              data.approvedByName ||
              "Approved user",
            signature: data.customerApprovalSignature || "",
            approvedAt: data.customerApprovedAt || data.approvedAt,
          });
        setInvoiceAmountPaid(Number(data.amountPaid || 0));
        setDocumentJobId(data.jobId || "");
        setReferenceNumber(data.referenceNumber || "");
        setSelectedCustomerId(data.customerId || "");
        setSelectedContactId(data.customerContactId || data.contactId || "");
        setNotes(data.notes || "");
        if (Array.isArray(data.lines) && data.lines.length)
          setLines(
            data.lines.map((line: any) => ({
              ...blankLine(),
              ...line,
              id: line.id || uid(),
              lineType:
                line.lineType ||
                (line.type === "description" || line.isDescription === true
                  ? "description"
                  : "") ||
                (!line.inventoryId &&
                !line.code &&
                !Number(line.cost) &&
                !Number(line.priceExcl) &&
                !Number(line.priceIncl)
                  ? "description"
                  : "item"),
            })),
          );
        else if (data.description || data.total || data.amount)
          setLines([
            {
              ...blankLine(),
              description: data.description || "",
              priceIncl: Number(data.total ?? data.amount ?? 0),
              taxRate: 0,
            },
          ]);
      },
    );
    getDocs(collection(clientDb, "companies", COMPANY_ID, `${type}s`)).then(
      (snapshot) => {
        const documentIndex = snapshot.docs.findIndex(
          (documentSnapshot) => documentSnapshot.id === documentId,
        );
        if (documentIndex >= 0) {
          setDocumentNumber(
            `${type === "quote" ? "QT" : "INV"}${String(documentIndex + 1).padStart(6, "0")}`,
          );
        }
      },
    );
    if (type === "invoice")
      getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "invoices",
          documentId,
          "payments",
        ),
      ).then((snapshot) => {
        setPayments(
          snapshot.docs.map((payment) => ({
            id: payment.id,
            ...payment.data(),
          })),
        );
      });
  }, [documentId, type]);

  useEffect(() => {
    if (!showPaymentModal) setEditingPaymentId("");
  }, [showPaymentModal]);

  useEffect(() => {
    if (documentId || !copyFromId || type !== "invoice") return;
    getDoc(doc(clientDb, "companies", COMPANY_ID, "invoices", copyFromId)).then(
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as any;
        setDocumentJobId(data.jobId || "");
        setReferenceNumber(data.referenceNumber || "");
        setSelectedCustomerId(data.customerId || "");
        setSelectedContactId(data.customerContactId || data.contactId || "");
        setNotes(data.notes || "");
        if (Array.isArray(data.lines) && data.lines.length)
          setLines(
            data.lines.map((line: any) => ({
              ...blankLine(),
              ...line,
              id: uid(),
            })),
          );
      },
    );
  }, [copyFromId, documentId, type]);

  useEffect(() => {
    if (documentId || !sourceQuoteId || type !== "invoice") return;
    getDoc(
      doc(clientDb, "companies", COMPANY_ID, "quotes", sourceQuoteId),
    ).then((snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as any;
      setDocumentJobId(data.jobId || "");
      setReferenceNumber(data.referenceNumber || "");
      setSelectedCustomerId(data.customerId || "");
      setSelectedContactId(data.customerContactId || data.contactId || "");
      setNotes(data.notes || "");
      if (Array.isArray(data.lines) && data.lines.length)
        setLines(
          data.lines.map((line: any) => ({
            ...blankLine(),
            ...line,
            id: uid(),
          })),
        );
    });
  }, [documentId, sourceQuoteId, type]);

  useEffect(() => {
    if (!jobId) return;
    getDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", jobId)).then(
      (snapshot) => {
        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() } as any;
          setJob(data);
          setSelectedCustomerId((current) => current || data.customerId || "");
        }
      },
    );
  }, [jobId]);

  useEffect(() => {
    if (jobId && !documentId) setJobItemPickerMode("prompt");
  }, [documentId, jobId]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setContacts([]);
      return;
    }
    getDocs(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "customers",
        selectedCustomerId,
        "contacts",
      ),
    ).then((snapshot) => {
      setContacts(
        snapshot.docs.map((contactSnapshot) => ({
          id: contactSnapshot.id,
          ...contactSnapshot.data(),
        })),
      );
    });
  }, [selectedCustomerId, type]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (sum, line) => {
          const calculated = lineTotals(line);
          return {
            subtotal: sum.subtotal + calculated.totalExcl,
            tax: sum.tax + calculated.tax,
            total: sum.total + calculated.totalIncl,
          };
        },
        { subtotal: 0, tax: 0, total: 0 },
      ),
    [lines],
  );

  function updateLine(
    id: string,
    changes: Partial<Line>,
    recalculatePrice = false,
  ) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...changes };
        if (recalculatePrice) {
          next.priceExcl = next.cost * (1 + next.markup / 100);
          next.priceIncl = next.priceExcl * (1 + next.taxRate / 100);
        }
        return next;
      }),
    );
  }

  function selectInventory(lineId: string, inventoryId: string) {
    const item = inventory.find((entry) => entry.id === inventoryId);
    if (!item) return;
    const cost = Number(item.costPrice ?? item.cost ?? 0);
    const markup = Number(
      item.markupPercent ?? item.markupPercentage ?? item.markup ?? 0,
    );
    const taxRate = Number(item.taxRate ?? item.vatRate ?? 15);
    const priceExcl = Number(
      item.sellPrice ?? item.priceExcl ?? cost * (1 + markup / 100),
    );
    const stockQuantity =
      item.grandTotal !== undefined
        ? Number(item.grandTotal || 0)
        : Object.values(item.warehouseStock || {}).reduce(
            (sum: number, quantity) => sum + Number(quantity || 0),
            0,
          );
    updateLine(lineId, {
      inventoryId: item.id,
      lineType: "item",
      inventorySearch: [
        item.partNumber || item.code,
        item.description || item.name,
      ]
        .filter(Boolean)
        .join(" - "),
      code: item.partNumber || item.code || item.sku || "",
      description: item.description || item.name || "",
      cost,
      markup,
      taxRate,
      priceExcl,
      stockLocationId: "",
      stockLocationName: "",
      stockWarning:
        type === "quote"
          ? stockQuantity <= 0
            ? "NO STOCK"
            : stockQuantity === 1
              ? "RESERVED STOCK"
              : ""
          : "",
      priceIncl: priceExcl * (1 + taxRate / 100),
    });
    setLines((current) => {
      const selectedIndex = current.findIndex((line) => line.id === lineId);
      const hasOpenItemLine = current.some(
        (line) =>
          line.id !== lineId &&
          line.lineType === "item" &&
          !line.inventoryId &&
          !line.description &&
          !line.code,
      );
      return selectedIndex === current.length - 1 && !hasOpenItemLine
        ? [...current, blankLine()]
        : current;
    });
    if (type === "invoice" && !jobId) {
      setStockLocationPicker({ lineId, inventoryId: item.id });
    }
  }

  function handleExactPartNumberEnter(event: React.KeyboardEvent<HTMLElement>) {
    if (
      event.key !== "Enter" ||
      !(event.target instanceof HTMLInputElement) ||
      event.target.getAttribute("list") !== `${type}-inventory-items`
    )
      return;
    const entered = event.target.value.trim().toLowerCase();
    const item = inventory.find(
      (entry) =>
        String(entry.partNumber || entry.code || "")
          .trim()
          .toLowerCase() === entered,
    );
    if (!item) return;
    const row = event.target.closest("tr");
    const line = row ? lines[row.rowIndex - 1] : undefined;
    if (!line) return;
    event.preventDefault();
    event.stopPropagation();
    selectInventory(line.id, item.id);
  }

  function selectInvoiceStockLocation(location: any) {
    if (!stockLocationPicker) return;
    const lineIndex = lines.findIndex(
      (line) => line.id === stockLocationPicker.lineId,
    );
    updateLine(stockLocationPicker.lineId, {
      stockLocationId: location.id,
      stockLocationName: location.name || location.id,
    });
    setStockLocationPicker(null);
    window.setTimeout(() => {
      const rows =
        document.querySelectorAll<HTMLTableRowElement>("table tbody tr");
      const quantityInput = rows[lineIndex]?.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      quantityInput?.focus();
      quantityInput?.select();
    }, 0);
  }

  function updateNumericLineField(line: Line, fieldId: string, value: number) {
    const maximum = fieldId === "quantity"
      ? MAX_QUANTITY_VALUE
      : fieldId === "discount"
        ? MAX_DISCOUNT_VALUE
        : fieldId === "taxRate"
          ? 15
          : ["cost", "priceExcl", "priceIncl"].includes(fieldId)
            ? MAX_MONEY_VALUE
            : Number.MAX_SAFE_INTEGER;
    value = Math.min(maximum, Math.max(0, Number(value) || 0));
    if (fieldId === "priceExcl") {
      updateLine(line.id, {
        priceExcl: value,
        priceIncl: value * (1 + line.taxRate / 100),
        markup: line.cost > 0 ? (value / line.cost - 1) * 100 : 0,
      });
      return;
    }
    if (fieldId === "priceIncl") {
      const priceExcl = value / (1 + line.taxRate / 100);
      updateLine(line.id, {
        priceIncl: value,
        priceExcl,
        markup: line.cost > 0 ? (priceExcl / line.cost - 1) * 100 : 0,
      });
      return;
    }
    updateLine(
      line.id,
      { [fieldId]: value } as any,
      ["cost", "markup", "taxRate"].includes(fieldId),
    );
  }

  function addJobItems(items: JobCardItem[]) {
    const nextLines = items.map((item) => {
      const priceExcl = Number(item.sellPrice ?? item.priceExcl ?? 0);
      const taxRate = Number(item.taxRate ?? 15);
      const inventoryItem = inventory.find(
        (entry) => entry.id === item.inventoryId,
      );
      const stockQuantity =
        inventoryItem?.grandTotal !== undefined
          ? Number(inventoryItem.grandTotal || 0)
          : Object.values(inventoryItem?.warehouseStock || {}).reduce(
              (sum: number, quantity) => sum + Number(quantity || 0),
              0,
            );
      return {
        ...blankLine(),
        inventoryId: item.inventoryId || "",
        inventorySearch: [item.partNumber || item.code, item.description]
          .filter(Boolean)
          .join(" - "),
        code: item.partNumber || item.code || "",
        description: item.description || "",
        quantity: Number(item.qty ?? item.quantity ?? 1),
        priceExcl,
        priceIncl: priceExcl * (1 + taxRate / 100),
        taxRate,
        stockWarning:
          type === "quote"
            ? stockQuantity <= 0
              ? ("NO STOCK" as const)
              : stockQuantity === 1
                ? ("RESERVED STOCK" as const)
                : ("" as const)
            : ("" as const),
      };
    });
    setLines((current) => [
      ...current.filter(
        (line) =>
          line.description || line.inventoryId || line.code || line.priceIncl,
      ),
      ...nextLines,
    ]);
    setJobItemPickerMode(null);
  }

  async function saveDocument(_legacySendToCustomer = false) {
    if (jobId && !job) return;
    const selectedCustomer = customers.find(
      (customer) => customer.id === selectedCustomerId,
    );
    const selectedContact = contacts.find(
      (contact) => contact.id === selectedContactId,
    );
    if (type === "quote" && !selectedCustomer)
      return alert("Select a customer before saving the quote.");
    if (type === "invoice" && !jobId && !selectedCustomer)
      return alert("Select a customer before saving the invoice.");
    if (type === "quote" && !selectedContact)
      return alert("Select a customer contact before saving the quote.");
    const cleanLines = lines
      .filter((line) => line.description.trim())
      .map((line) =>
        line.lineType === "description"
          ? {
              ...line,
              lineType: "description" as const,
              description: line.description.trim(),
              inventoryId: "",
              inventorySearch: "",
              code: "",
              quantity: 0,
              cost: 0,
              markup: 0,
              priceExcl: 0,
              priceIncl: 0,
              discount: 0,
              taxRate: 0,
            }
          : { ...line, lineType: "item" as const },
      );
    if (!cleanLines.length)
      return alert("Add at least one item or description line.");
    try {
      setSaving(true);
      const values = {
        jobId: jobId || "",
        jobNumber: job?.jobNumber || "",
        quoteId: sourceQuoteId || "",
        customerId: selectedCustomer?.id || job?.customerId || "",
        customerName:
          selectedCustomer?.companyName ||
          selectedCustomer?.customerName ||
          selectedCustomer?.name ||
          job?.customerName ||
          "",
        customerContactId: selectedContact?.id || "",
        customerContactName: selectedContact?.name || "",
        customerContactTelephone:
          selectedContact?.mobile || selectedContact?.phone || "",
        customerContactEmail: selectedContact?.email || "",
        description: cleanLines.map((line) => line.description).join("; "),
        lines: cleanLines,
        notes,
        referenceNumber: referenceNumber.trim(),
        paymentTerms:
          type === "invoice"
            ? String(documentSettings.paymentTerms || "Due On Receipt")
            : "",
        duePeriodDays:
          type === "invoice"
            ? Math.max(0, Number(documentSettings.duePeriodDays) || 0)
            : 0,
        expiryDays:
          type === "quote"
            ? Math.max(0, Number(documentSettings.expiryDays) || 0)
            : 0,
        defaultDepositPercent:
          type === "quote"
            ? Math.min(
                100,
                Math.max(
                  0,
                  Number(documentSettings.defaultDepositPercent) || 0,
                ),
              )
            : 0,
        subtotal: totals.subtotal,
        vat: totals.tax,
        total: totals.total,
        grandTotal: totals.total,
        status:
          type === "quote"
            ? documentId
              ? documentStatus || "draft"
              : "draft"
            : "unpaid",
        ...creationAuditFields(),
      };
      if (documentId) {
        await updateDoc(
          doc(clientDb, "companies", COMPANY_ID, `${type}s`, documentId),
          {
            ...values,
            documentPrintPath: `/documents/${type}/${documentId}`,
          },
        );
      } else {
        const documentRef = await addDoc(
          collection(clientDb, "companies", COMPANY_ID, `${type}s`),
          values,
        );
        if (type === "invoice" && !jobId) {
          const quantitiesByInventoryLocation = cleanLines.reduce(
            (result, line) => {
              if (line.lineType === "item" && line.inventoryId) {
                if (!line.stockLocationId)
                  throw new Error(
                    `Select a stock location for ${line.code || line.description}.`,
                  );
                const key = `${line.inventoryId}::${line.stockLocationId}`;
                const current = result.get(key);
                result.set(key, {
                  inventoryId: line.inventoryId,
                  locationId: line.stockLocationId,
                  locationName: line.stockLocationName || line.stockLocationId,
                  quantity:
                    (current?.quantity || 0) +
                    Math.max(0, Number(line.quantity) || 0),
                });
              }
              return result;
            },
            new Map<
              string,
              {
                inventoryId: string;
                locationId: string;
                locationName: string;
                quantity: number;
              }
            >(),
          );
          try {
            await runTransaction(clientDb, async (transaction) => {
              const entries = Array.from(
                quantitiesByInventoryLocation.values(),
              ).map((entry) => ({
                ...entry,
                ref: doc(
                  clientDb,
                  "companies",
                  COMPANY_ID,
                  "inventory",
                  entry.inventoryId,
                ),
              }));
              const snapshots = await Promise.all(
                entries.map((entry) => transaction.get(entry.ref)),
              );
              entries.forEach((entry, index) => {
                const snapshot = snapshots[index];
                if (!snapshot.exists())
                  throw new Error(
                    "An invoiced inventory item no longer exists.",
                  );
                const data = snapshot.data();
                if (data.serialNumberTracking === true)
                  throw new Error(
                    `Select a serial number through a linked job before invoicing ${data.partNumber || data.description || "this serialized item"}.`,
                  );
                const beforeQty = Number(
                  data.warehouseStock?.[entry.locationId] || 0,
                );
                if (!allowNegativeStock && beforeQty < entry.quantity)
                  throw new Error(
                    `Insufficient stock for ${data.partNumber || data.description || "inventory item"}. Available: ${beforeQty.toFixed(2)}, required: ${entry.quantity.toFixed(2)}.`,
                  );
              });
              entries.forEach((entry, index) => {
                const data = snapshots[index].data()!;
                const beforeQty = Number(
                  data.warehouseStock?.[entry.locationId] || 0,
                );
                const warehouseStock = {
                  ...(data.warehouseStock || {}),
                  [entry.locationId]: beforeQty - entry.quantity,
                };
                const locationType = String(
                  stockLocations.find(
                    (location) => location.id === entry.locationId,
                  )?.type || "",
                ).toLowerCase();
                transaction.update(entry.ref, {
                  warehouseStock,
                  warehouseTotal:
                    locationType === "warehouse"
                      ? Number(data.warehouseTotal || 0) - entry.quantity
                      : Number(data.warehouseTotal || 0),
                  vanTotal:
                    locationType === "rav"
                      ? Number(data.vanTotal || 0) - entry.quantity
                      : Number(data.vanTotal || 0),
                  grandTotal: Number(data.grandTotal || 0) - entry.quantity,
                  updatedAt: serverTimestamp(),
                });
                transaction.set(
                  doc(
                    collection(
                      clientDb,
                      "companies",
                      COMPANY_ID,
                      "inventory_transactions",
                    ),
                  ),
                  {
                    inventoryId: entry.inventoryId,
                    partNumber: data.partNumber || "",
                    description: data.description || "",
                    type: "OUT",
                    qty: entry.quantity,
                    beforeQty,
                    afterQty: beforeQty - entry.quantity,
                    locationId: entry.locationId,
                    locationName: entry.locationName,
                    referenceType: "INVOICE",
                    referenceNumber: documentRef.id,
                    invoiceId: documentRef.id,
                    createdAt: serverTimestamp(),
                  },
                );
              });
              transaction.update(documentRef, {
                stockProcessed: true,
                stockProcessedAt: serverTimestamp(),
                stockLocationIds: Array.from(
                  new Set(entries.map((entry) => entry.locationId)),
                ),
              });
            });
          } catch (error) {
            await deleteDoc(documentRef);
            throw error;
          }
        }
        if (type === "invoice") {
          const settingsRef = doc(
            clientDb,
            "companies",
            COMPANY_ID,
            "documentSettings",
            "invoice",
          );
          await runTransaction(clientDb, async (transaction) => {
            const settingsSnapshot = await transaction.get(settingsRef);
            const settings = settingsSnapshot.data() || {};
            const currentSequence = String(
              settings.currentSequence ?? "000000",
            );
            const sequenceWidth = Math.max(1, currentSequence.length);
            const nextSequence = String(
              (Number(currentSequence) || 0) + 1,
            ).padStart(sequenceWidth, "0");
            const prefix =
              String(settings.prefix || "INV")
                .trim()
                .toUpperCase() || "INV";
            const invoiceNumber =
              settings.numberingEnabled === false
                ? `INV-${documentRef.id.slice(0, 8).toUpperCase()}`
                : `${prefix}${nextSequence}`;
            transaction.update(documentRef, {
              documentPrintPath: `/documents/invoice/${documentRef.id}`,
              invoiceNumber,
            });
            if (settings.numberingEnabled !== false) {
              transaction.set(
                settingsRef,
                { currentSequence: nextSequence, updatedAt: serverTimestamp() },
                { merge: true },
              );
            }
          });
        } else {
          const settingsRef = doc(
            clientDb,
            "companies",
            COMPANY_ID,
            "documentSettings",
            "quote",
          );
          await runTransaction(clientDb, async (transaction) => {
            const settingsSnapshot = await transaction.get(settingsRef);
            const settings = settingsSnapshot.data() || {};
            const currentSequence = String(
              settings.currentSequence ?? "000000",
            );
            const sequenceWidth = Math.max(1, currentSequence.length);
            const nextSequence = String(
              (Number(currentSequence) || 0) + 1,
            ).padStart(sequenceWidth, "0");
            const prefix =
              String(settings.prefix || "QT")
                .trim()
                .toUpperCase() || "QT";
            const quoteNumber =
              settings.numberingEnabled === false
                ? `QT-${documentRef.id.slice(0, 8).toUpperCase()}`
                : `${prefix}${nextSequence}`;
            transaction.update(documentRef, {
              documentPrintPath: `/documents/quote/${documentRef.id}`,
              quoteNumber,
            });
            if (settings.numberingEnabled !== false) {
              transaction.set(
                settingsRef,
                { currentSequence: nextSequence, updatedAt: serverTimestamp() },
                { merge: true },
              );
            }
          });
        }
        if (type === "invoice" && sourceQuoteId) {
          const sourceQuoteRef = doc(
            clientDb,
            "companies",
            COMPANY_ID,
            "quotes",
            sourceQuoteId,
          );
          const sourceQuoteSnapshot = await getDoc(sourceQuoteRef);
          if (
            sourceQuoteSnapshot.exists() &&
            totals.total >=
              Number(
                sourceQuoteSnapshot.data().grandTotal ??
                  sourceQuoteSnapshot.data().total ??
                  0,
              )
          ) {
            await updateDoc(sourceQuoteRef, {
              status: "closed",
              fullyInvoiced: true,
              invoicedAt: serverTimestamp(),
              invoiceId: documentRef.id,
              ...auditFields("UPDATE"),
            });
          }
        }
      }
      if (type === "quote") alert("Quote saved.");
      router.push(jobId ? `/jobs/${jobId}` : `/${type}s`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : `Unable to save ${label.toLowerCase()}.`;
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  async function revertInvoiceToDraft() {
    if (!documentId || !canRevertInvoice)
      return alert("You do not have permission to revert invoices to draft.");
    if (!window.confirm("Revert this invoice to Draft so it can be amended?"))
      return;
    try {
      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "invoices", documentId),
        {
          status: "draft",
          revertedToDraftAt: serverTimestamp(),
          ...auditFields("UPDATE"),
        },
      );
      setDocumentStatus("draft");
      setShowInvoiceActions(false);
      alert("Invoice reverted to Draft. It can now be amended.");
    } catch (error) {
      console.error("Unable to revert invoice to draft", error);
      alert("Unable to revert this invoice to Draft. Please try again.");
    }
  }

  async function approveQuote() {
    if (
      !documentId ||
      type !== "quote" ||
      !hasPermission(userPermissions, "Approve quotes")
    )
      return alert("You do not have permission to approve quotes.");
    if (!window.confirm("Approve this quote and move it to Open?")) return;
    const actor = getAuditActor();
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "quotes", documentId),
      {
        status: "open",
        approved: true,
        approvalSource: "internal",
        approvedByName: actor.userName,
        approvedById: actor.userId,
        approvedAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    setQuoteApproval({
      name: actor.userName,
      signature: "",
      approvedAt: new Date(),
    });
    setDocumentStatus("open");
    alert("Quote approved and moved to Open.");
  }

  async function closeQuote() {
    if (
      !documentId ||
      type !== "quote" ||
      !hasPermission(userPermissions, "Close quotes")
    )
      return alert("You do not have permission to close quotes.");
    if (!window.confirm("Manually close this quote?")) return;
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "quotes", documentId),
      {
        status: "closed",
        manuallyClosed: true,
        closedAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    setDocumentStatus("closed");
    alert("Quote moved to Closed.");
  }

  async function cancelInvoice() {
    if (!documentId || !userPermissions["Edit invoices"])
      return alert("You do not have permission to cancel invoices.");
    if (
      !window.confirm("Cancel this invoice? This action will lock the invoice.")
    )
      return;
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "invoices", documentId),
      {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    setDocumentStatus("cancelled");
    setShowInvoiceActions(false);
    alert("Invoice cancelled.");
  }

  async function createInvoicePayment() {
    if (!documentId || type !== "invoice") return;
    if (!canRecordInvoicePayments)
      return alert("You do not have permission to record invoice payments.");
    if (editingPaymentId) return updateInvoicePayment();
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return alert("Enter an amount received greater than zero.");
    if (!paymentForm.dateReceived) return alert("Select the date received.");
    if (!paymentForm.reference.trim())
      return alert("Enter the payment reference.");
    setPaymentSaving(true);
    try {
      const invoiceRef = doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "invoices",
        documentId,
      );
      const paymentRef = doc(collection(invoiceRef, "payments"));
      let updatedPaid = invoiceAmountPaid;
      await runTransaction(clientDb, async (transaction) => {
        const invoiceSnapshot = await transaction.get(invoiceRef);
        if (!invoiceSnapshot.exists()) throw new Error("Invoice not found.");
        const invoiceData = invoiceSnapshot.data();
        const invoiceTotal = Number(
          invoiceData.grandTotal ?? invoiceData.total ?? 0,
        );
        const currentPaid = Number(invoiceData.amountPaid || 0);
        const amountDue = Math.max(0, invoiceTotal - currentPaid);
        if (amount > amountDue)
          throw new Error(
            `Amount received cannot exceed the amount due of ${money(amountDue)}.`,
          );
        updatedPaid = currentPaid + amount;
        transaction.set(paymentRef, {
          invoiceId: documentId,
          invoiceNumber: documentNumber,
          amount,
          dateReceived: paymentForm.dateReceived,
          reference: paymentForm.reference.trim(),
          description: paymentForm.description.trim(),
          receiptNumber: `RCT-${paymentRef.id.slice(0, 8).toUpperCase()}`,
          ...creationAuditFields(),
        });
        transaction.update(invoiceRef, {
          amountPaid: updatedPaid,
          amountDue: Math.max(0, invoiceTotal - updatedPaid),
          status: updatedPaid >= invoiceTotal ? "paid" : "partially_paid",
          lastPaymentAt: serverTimestamp(),
          ...auditFields("UPDATE"),
        });
      });
      setInvoiceAmountPaid(updatedPaid);
      setPayments((current) => [
        ...current,
        {
          id: paymentRef.id,
          invoiceId: documentId,
          invoiceNumber: documentNumber,
          amount,
          dateReceived: paymentForm.dateReceived,
          reference: paymentForm.reference.trim(),
          description: paymentForm.description.trim(),
          receiptNumber: `RCT-${paymentRef.id.slice(0, 8).toUpperCase()}`,
        },
      ]);
      setDocumentStatus(
        updatedPaid >= totals.total ? "paid" : "partially_paid",
      );
      setShowPaymentModal(false);
      setPaymentForm({
        amount: "0.00",
        dateReceived: new Date().toISOString().slice(0, 10),
        reference: "",
        description: "",
      });
      alert("Payment created. The receipt is available in Preview and Print.");
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to create payment.",
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  function openPaymentEditor(payment: any) {
    if (!canRecordInvoicePayments)
      return alert("You do not have permission to edit invoice payments.");
    setEditingPaymentId(payment.id);
    setPaymentForm({
      amount: Number(payment.amount || 0).toFixed(2),
      dateReceived:
        payment.dateReceived || new Date().toISOString().slice(0, 10),
      reference: payment.reference || "",
      description: payment.description || "",
    });
    setShowPaymentModal(true);
  }

  async function updateInvoicePayment() {
    if (!documentId || !editingPaymentId || !canRecordInvoicePayments) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return alert("Enter an amount received greater than zero.");
    if (!paymentForm.dateReceived) return alert("Select the date received.");
    if (!paymentForm.reference.trim())
      return alert("Enter the payment reference.");
    setPaymentSaving(true);
    try {
      const invoiceRef = doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "invoices",
        documentId,
      );
      const paymentRef = doc(invoiceRef, "payments", editingPaymentId);
      let updatedPaid = invoiceAmountPaid;
      let updatedStatus = documentStatus;
      await runTransaction(clientDb, async (transaction) => {
        const [invoiceSnapshot, paymentSnapshot] = await Promise.all([
          transaction.get(invoiceRef),
          transaction.get(paymentRef),
        ]);
        if (!invoiceSnapshot.exists() || !paymentSnapshot.exists())
          throw new Error("Invoice payment not found.");
        const invoiceTotal = Number(
          invoiceSnapshot.data().grandTotal ??
            invoiceSnapshot.data().total ??
            0,
        );
        const previousAmount = Number(paymentSnapshot.data().amount || 0);
        updatedPaid = Math.max(
          0,
          Number(invoiceSnapshot.data().amountPaid || 0) -
            previousAmount +
            amount,
        );
        if (updatedPaid > invoiceTotal)
          throw new Error(
            `Total payments cannot exceed the invoice total of ${money(invoiceTotal)}.`,
          );
        updatedStatus =
          updatedPaid <= 0
            ? "unpaid"
            : updatedPaid >= invoiceTotal
              ? "paid"
              : "partially_paid";
        transaction.update(paymentRef, {
          amount,
          dateReceived: paymentForm.dateReceived,
          reference: paymentForm.reference.trim(),
          description: paymentForm.description.trim(),
          ...auditFields("UPDATE"),
        });
        transaction.update(invoiceRef, {
          amountPaid: updatedPaid,
          amountDue: Math.max(0, invoiceTotal - updatedPaid),
          status: updatedStatus,
          lastPaymentAt: serverTimestamp(),
          ...auditFields("UPDATE"),
        });
      });
      setPayments((current) =>
        current.map((payment) =>
          payment.id === editingPaymentId
            ? {
                ...payment,
                amount,
                dateReceived: paymentForm.dateReceived,
                reference: paymentForm.reference.trim(),
                description: paymentForm.description.trim(),
              }
            : payment,
        ),
      );
      setInvoiceAmountPaid(updatedPaid);
      setDocumentStatus(updatedStatus);
      setEditingPaymentId("");
      setShowPaymentModal(false);
      setPaymentForm({
        amount: "0.00",
        dateReceived: new Date().toISOString().slice(0, 10),
        reference: "",
        description: "",
      });
      alert("Payment details updated.");
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to update payment.",
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  const selectedCustomer = customers.find(
    (entry) => entry.id === selectedCustomerId,
  );
  const invoiceLocked =
    type === "invoice" && Boolean(documentId) && documentStatus !== "draft";
  const visibleColumns = documentLineColumns.filter((column) => {
    if (column.id !== "description" && !visibleColumnIds.includes(column.id))
      return false;
    if (column.id === "cost") return financialColumnPermissions.cost;
    if (column.id === "markup" || column.id === "profit")
      return financialColumnPermissions.markup;
    return true;
  });
  const showsColumn = (columnId: string) =>
    visibleColumns.some((column) => column.id === columnId);
  // Quote and invoice entry deliberately use the same fixed line geometry as
  // Purchase Orders. Cost/markup remain available in document reporting, but
  // must not resize the create-document item table.
  const editorShowsCost = false;
  const editorShowsMarkup = false;

  return (
    <main className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="w-full max-w-none">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              {label}s
            </div>
            <h1 className="text-4xl font-black">
              {documentId
                ? `Edit ${label} ${documentNumber}`
                : `Create ${label}`}
            </h1>
          </div>
          {documentId && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/documents/${type}/${documentId}`}
                className="rounded-xl border bg-white px-4 py-3 font-bold text-blue-700"
              >
                Preview
              </Link>
              {type === "quote" && documentStatus === "draft" && (
                <button
                  type="button"
                  onClick={() => void approveQuote()}
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-black text-white"
                >
                  Approve Quote
                </button>
              )}
              {type === "quote" && documentStatus === "open" && (
                <button
                  type="button"
                  onClick={() => void closeQuote()}
                  className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white hover:bg-blue-600"
                >
                  Close Quote
                </button>
              )}
              {type === "quote" && documentStatus === "open" && (
                <Link
                  href={`/invoices/new?quoteId=${documentId}${jobId ? `&jobId=${jobId}` : ""}`}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white"
                >
                  Create Invoice
                </Link>
              )}
              {type === "invoice" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowInvoiceActions((current) => !current)}
                    className="rounded-xl border bg-white px-4 py-3 font-black text-gray-800"
                  >
                    Actions ▼
                  </button>
                  {showInvoiceActions && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border bg-white shadow-xl">
                      <button
                        type="button"
                        disabled={
                          !canRevertInvoice ||
                          documentStatus === "draft" ||
                          documentStatus === "cancelled"
                        }
                        onClick={() => void revertInvoiceToDraft()}
                        className="block w-full px-5 py-4 text-left font-bold hover:bg-blue-50 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        Revert to Draft
                      </button>
                      <button
                        type="button"
                        disabled={
                          !userPermissions["Edit invoices"] ||
                          documentStatus === "cancelled"
                        }
                        onClick={() => void cancelInvoice()}
                        className="block w-full border-t px-5 py-4 text-left font-bold text-red-700 hover:bg-red-50 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        Cancel Invoice
                      </button>
                      <button
                        type="button"
                        disabled={!userPermissions["Create invoices"]}
                        onClick={() =>
                          router.push(`/invoices/new?copyFrom=${documentId}`)
                        }
                        className="block w-full border-t px-5 py-4 text-left font-bold hover:bg-blue-50 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        Copy Invoice
                      </button>
                      <Link
                        href="/admin/invoicesettings"
                        className="block w-full border-t px-5 py-4 font-bold hover:bg-blue-50"
                      >
                        Preferences
                      </Link>
                      {jobId ? (
                        <Link
                          href={`/jobs/${jobId}`}
                          className="block w-full border-t px-5 py-4 font-bold hover:bg-blue-50"
                        >
                          Open Linked Job
                        </Link>
                      ) : (
                        <span className="block w-full border-t bg-gray-50 px-5 py-4 font-bold text-gray-400">
                          No Linked Job
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Link
                href={`/documents/${type}/${documentId}?print=1`}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
              >
                Print / PDF
              </Link>
              {(type !== "quote" || documentStatus === "open") && (
                <button
                  type="button"
                  onClick={() => void openEmailOptions()}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white"
                >
                  Send Email
                </button>
              )}
            </div>
          )}
        </div>
        {invoiceLocked && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900">
            This saved invoice is locked. An authorized user must use Actions →
            Revert to Draft before it can be amended.
          </div>
        )}
        {documentId && type === "quote" && documentStatus === "draft" && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => void openEmailOptions()}
              disabled={!hasPermission(userPermissions, "Send quotes")}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-40"
            >
              Send Quote
            </button>
          </div>
        )}
        {type === "quote" && quoteApproval && (
          <section className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Quote Approved
            </p>
            <p className="mt-2 font-black text-emerald-950">
              {quoteApproval.name}
            </p>
            {quoteApproval.signature && (
              <img
                src={quoteApproval.signature}
                alt={`${quoteApproval.name} signature`}
                className="mt-3 h-20 max-w-sm rounded-lg border bg-white object-contain p-2"
              />
            )}
          </section>
        )}
        <fieldset
          disabled={invoiceLocked}
          onKeyDownCapture={handleExactPartNumberEnter}
          className="space-y-5 rounded-3xl border border-gray-300 bg-white p-5 shadow-sm md:p-7 disabled:opacity-75"
        >
          <style>{`
        fieldset > section:nth-of-type(2) { position: relative; padding-bottom: 4.5rem; }
        fieldset > section:nth-of-type(2) > div:first-child > div:last-child { position: absolute; left: 1.25rem; bottom: 1rem; }
        fieldset > section:nth-of-type(2) > div:first-child > div:last-child > div { top: auto; right: auto; bottom: calc(100% + 0.5rem); left: 0; margin-top: 0; }
      `}</style>
          <section className="rounded-3xl border border-gray-900 bg-gray-50 p-5">
            <h2 className="mb-4 text-xl font-black">{label} Details</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-start-2 md:row-start-1 md:text-right">
                <div className="text-sm font-bold text-gray-500">
                  Linked Job
                </div>
                <div className="font-black">
                  {jobId
                    ? job
                      ? `Job ${job.jobNumber || job.id}`
                      : "Loading job…"
                    : `Standalone ${label.toLowerCase()}`}
                </div>
                {jobId && (
                  <Link
                    href={`/jobs/${jobId}`}
                    className="text-sm font-bold text-blue-600"
                  >
                    Back to job
                  </Link>
                )}
              </div>
              <div className="md:col-start-1 md:row-start-1">
                {type === "quote" || !jobId ? (
                  <>
                    <label className="text-sm font-bold text-gray-500">
                      Customer *
                    </label>
                    <select
                      required
                      value={selectedCustomerId}
                      onChange={(event) => {
                        setSelectedCustomerId(event.target.value);
                        setSelectedContactId("");
                      }}
                      className="mt-2 h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5"
                    >
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.companyName ||
                            customer.customerName ||
                            customer.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-gray-500">
                      Customer
                    </div>
                    <div className="font-black">
                      {job?.customerName ||
                        selectedCustomer?.companyName ||
                        selectedCustomer?.customerName ||
                        "No customer"}
                    </div>
                  </>
                )}
              </div>
              <div className="md:col-start-1 md:row-start-2">
                <label className="text-sm font-bold text-gray-500">
                  Customer Contact {type === "quote" ? "*" : ""}
                </label>
                <select
                  required={type === "quote"}
                  value={selectedContactId}
                  onChange={(event) => setSelectedContactId(event.target.value)}
                  disabled={!selectedCustomerId}
                  className="mt-2 h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 disabled:bg-gray-100"
                >
                  <option value="">
                    {selectedCustomerId
                      ? "Select customer contact"
                      : "Select a customer first"}
                  </option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {[
                        contact.name,
                        contact.position,
                        contact.mobile || contact.phone,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    </option>
                  ))}
                </select>
                {selectedCustomerId && contacts.length === 0 && (
                  <div className="mt-1 text-xs font-semibold text-red-600">
                    This customer has no contacts. Add a contact before emailing
                    the {label.toLowerCase()}.
                  </div>
                )}
              </div>
              <div className="md:col-start-2 md:row-start-2 md:self-end">
                <label className="text-sm font-bold text-gray-500">
                  Reference
                </label>
                <input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  placeholder="Enter customer reference"
                  className="mt-2 h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5 font-semibold"
                />
              </div>
            </div>
          </section>

          <section className="w-full rounded-3xl border border-gray-200 bg-gray-50 p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Item Details</h2>
                <p className="text-sm text-gray-500">
                  Add inventory, job-card items, or a description.
                </p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddLineOptions((current) => !current)}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white"
                >
                  + Add Line ▾
                </button>
                {showAddLineOptions && (
                  <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border bg-white shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setLines((current) => [...current, blankLine()]);
                        setShowAddLineOptions(false);
                      }}
                      className="block w-full px-5 py-3 text-left font-bold hover:bg-blue-50"
                    >
                      Add Item
                    </button>
                    <button
                      type="button"
                      disabled={!jobId}
                      title={!jobId ? "Link a job to add job items" : undefined}
                      onClick={() => {
                        setJobItemPickerMode("select");
                        setShowAddLineOptions(false);
                      }}
                      className="block w-full border-t px-5 py-3 text-left font-bold hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      Add Job Item
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLines((current) => [
                          ...current,
                          blankDescriptionLine(),
                        ]);
                        setShowAddLineOptions(false);
                      }}
                      className="block w-full border-t px-5 py-3 text-left font-bold hover:bg-blue-50"
                    >
                      Add Description
                    </button>
                  </div>
                )}
              </div>
            </div>
            <datalist id={`${type}-inventory-items`}>
              {inventory.map((item) => (
                <option
                  key={item.id}
                  value={[
                    item.partNumber || item.code,
                    item.description || item.name,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                />
              ))}
            </datalist>
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full min-w-[1050px] table-fixed text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-64" />
                  <col className="w-80" />
                  <col className="w-24" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-20" />
                  <col className="w-16" />
                </colgroup>
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-[11px] font-black uppercase text-gray-500">
                    <th className="w-12 p-3 text-center">#</th>
                    <th className="w-64 p-3">Product / Service</th>
                    <th className="w-80 p-3">Description</th>
                    <th className="w-24 p-3 text-right">Qty</th>
                    {editorShowsCost && (
                      <th className="w-28 p-3 text-right">Cost</th>
                    )}
                    {editorShowsMarkup && (
                      <th className="w-24 p-3 text-right">Markup</th>
                    )}
                    <th className="w-28 p-3 text-right">Rate</th>
                    <th className="w-28 p-3 text-right">Amount</th>
                    <th className="w-20 p-3 text-right">VAT</th>
                    <th className="w-16 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const calculated = lineTotals(line);
                    const columnCount =
                      6 +
                      Number(editorShowsCost) +
                      Number(editorShowsMarkup);
                    return (
                      <tr
                        key={line.id}
                        className="border-b align-top last:border-b-0"
                      >
                        {isDescriptionLine(line) ? (
                          <>
                            <td className="p-2 text-center text-xs font-bold text-gray-400">
                              {index + 1}
                            </td>
                            <td colSpan={columnCount} className="p-2">
                              <input
                                value={line.description}
                                onChange={(event) =>
                                  updateLine(line.id, {
                                    description: event.target.value,
                                  })
                                }
                                className="h-10 w-full rounded-lg border px-3 font-semibold"
                                placeholder="Description"
                                aria-label="Description line"
                              />
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter(
                                      (item) => item.id !== line.id,
                                    ),
                                  )
                                }
                                className="h-10 w-full rounded-lg font-black text-red-600"
                              >
                                ×
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2 text-center text-xs font-bold text-gray-400">
                              {index + 1}
                            </td>
                            <td className="p-2">
                              <input
                                list={`${type}-inventory-items`}
                                value={line.inventorySearch}
                                onChange={(event) => {
                                  const inputValue = event.target.value;
                                  const match = inventory.find(
                                    (item) =>
                                      [
                                        item.partNumber || item.code,
                                        item.description || item.name,
                                      ]
                                        .filter(Boolean)
                                        .join(" - ") === inputValue,
                                  );
                                  if (match) selectInventory(line.id, match.id);
                                  else
                                    updateLine(line.id, {
                                      inventoryId: "",
                                      inventorySearch: inputValue,
                                    });
                                }}
                                placeholder="Search product or service"
                                className="h-10 w-full rounded-lg border px-3 font-semibold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={line.description}
                                onChange={(event) =>
                                  updateLine(line.id, {
                                    description: event.target.value,
                                  })
                                }
                                className="h-10 w-full rounded-lg border px-3"
                                placeholder="Description"
                              />
                              {type === "quote" && line.stockWarning && (
                                <p className="mt-1 text-[11px] font-black text-red-700">
                                  ** {line.stockWarning}
                                </p>
                              )}
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                max={MAX_QUANTITY_VALUE}
                                step="0.01"
                                value={line.quantity}
                                onChange={(event) =>
                                  updateNumericLineField(
                                    line,
                                    "quantity",
                                    Number(event.target.value),
                                  )
                                }
                                className="h-10 w-full rounded-lg border px-2 text-right"
                              />
                            </td>
                            {editorShowsCost && (
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={MAX_MONEY_VALUE}
                                  step="0.01"
                                  value={line.cost}
                                  onChange={(event) =>
                                    updateNumericLineField(
                                      line,
                                      "cost",
                                      Number(event.target.value),
                                    )
                                  }
                                  className="h-10 w-full rounded-lg border px-2 text-right"
                                />
                              </td>
                            )}
                            {editorShowsMarkup && (
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={line.markup}
                                  onChange={(event) =>
                                    updateNumericLineField(
                                      line,
                                      "markup",
                                      Number(event.target.value),
                                    )
                                  }
                                  className="h-10 w-full rounded-lg border px-2 text-right"
                                />
                              </td>
                            )}
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                max={MAX_MONEY_VALUE}
                                step="0.01"
                                value={line.priceExcl}
                                onChange={(event) =>
                                  updateNumericLineField(
                                    line,
                                    "priceExcl",
                                    Number(event.target.value),
                                  )
                                }
                                className="h-10 w-full rounded-lg border px-2 text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-black">
                              {money(calculated.totalExcl)}
                            </td>
                            <td className="p-2 text-right">
                              <span className="block font-bold">{Number(line.taxRate || 15).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}%</span>
                              <span className="text-xs text-gray-500">{money(calculated.tax)}</span>
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                disabled={lines.length === 1}
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter(
                                      (item) => item.id !== line.id,
                                    ),
                                  )
                                }
                                className="h-10 w-full rounded-lg font-black text-red-600 disabled:opacity-30"
                                aria-label="Delete line"
                              >
                                ×
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div>
              <label className="mb-2 block font-bold">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-44 w-full rounded-2xl border-2 p-5"
                placeholder="Add notes..."
              />
              {type === "invoice" &&
                documentId &&
                documentStatus !== "cancelled" && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      canRecordInvoicePayments
                        ? setShowPaymentModal(true)
                        : alert(
                            "You do not have permission to record invoice payments.",
                          )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        canRecordInvoicePayments
                          ? setShowPaymentModal(true)
                          : alert(
                              "You do not have permission to record invoice payments.",
                            );
                      }
                    }}
                    className="mt-4 inline-flex cursor-pointer rounded-xl bg-emerald-600 px-5 py-3 font-black text-white"
                  >
                    Create Payment
                  </div>
                )}
            </div>
            <div className="rounded-3xl border bg-gray-50 p-6">
              <div className="mb-4 font-black uppercase text-gray-500">
                Document Summary
              </div>
              <div className="flex justify-between border-b py-3">
                <span>Subtotal</span>
                <b>{money(totals.subtotal)}</b>
              </div>
              <div className="flex justify-between border-b py-3">
                <span>VAT</span>
                <b>{money(totals.tax)}</b>
              </div>
              <div className="flex justify-between pt-4 text-xl font-black">
                <span>Total Incl VAT</span>
                <span className="text-blue-600">{money(totals.total)}</span>
              </div>
              {type === "quote" ? (
                <div className="relative mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateOptions((current) => !current)}
                    disabled={saving || (Boolean(jobId) && !job)}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 font-black text-white disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : documentId
                        ? "Save Quote"
                        : "Create Quote"}
                    {!saving && <span aria-hidden="true">▼</span>}
                  </button>
                  {showCreateOptions && !saving && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateOptions(false);
                          void saveDocument(false);
                        }}
                        className="w-full px-5 py-4 text-left hover:bg-blue-50"
                      >
                        <span className="block font-black text-gray-900">
                          {documentId ? "Save Quote" : "Create Quote"}
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Save the quote without sending it.
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => void saveDocument(false)}
                  disabled={saving || (Boolean(jobId) && !job)}
                  className="mt-6 h-14 w-full rounded-2xl bg-blue-600 font-black text-white disabled:opacity-50"
                >
                  {saving
                    ? "Saving…"
                    : documentId
                      ? `Save ${label}`
                      : `Create ${label}`}
                </button>
              )}
            </div>
          </div>
          {type === "invoice" && invoiceAmountPaid > 0 && (
            <div className="!-mt-8 ml-auto w-full rounded-b-3xl border border-t-0 bg-emerald-50 px-6 py-4 lg:w-[420px]">
              <div className="flex items-center justify-between text-lg font-black text-emerald-800">
                <span>Paid Amount</span>
                <span>{money(invoiceAmountPaid)}</span>
              </div>
            </div>
          )}
        </fieldset>
        {type === "invoice" && documentId && (
          <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Payment Details</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Payments and receipts recorded against this invoice.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black uppercase text-gray-400">
                  Amount Paid
                </p>
                <p className="text-2xl font-black text-emerald-700">
                  {money(invoiceAmountPaid)}
                </p>
                <p className="text-sm font-bold text-gray-500">
                  Due {money(Math.max(0, totals.total - invoiceAmountPaid))}
                </p>
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-gray-50 p-6 text-center font-bold text-gray-400">
                No payments recorded.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-black uppercase text-gray-500">
                      <th className="p-3">Receipt</th>
                      <th className="p-3">Date Received</th>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-t">
                        <td className="p-3 font-black text-blue-700">
                          {payment.receiptNumber ||
                            `RCT-${payment.id.slice(0, 8).toUpperCase()}`}
                        </td>
                        <td className="p-3">{payment.dateReceived || "—"}</td>
                        <td className="p-3 font-bold">
                          {payment.reference || "—"}
                        </td>
                        <td className="p-3">{payment.description || "—"}</td>
                        <td className="p-3 text-right font-black">
                          {money(payment.amount)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            disabled={!canRecordInvoicePayments}
                            onClick={() => openPaymentEditor(payment)}
                            className="rounded-lg border px-4 py-2 font-black text-blue-700 disabled:opacity-40"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {stockLocationPicker &&
          (() => {
            const selectedInventoryItem = inventory.find(
              (item) => item.id === stockLocationPicker.inventoryId,
            );
            return (
              <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4">
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stock-location-title"
                  className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl"
                >
                  <div>
                    <h2
                      id="stock-location-title"
                      className="text-2xl font-black"
                    >
                      Select Stock Location
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedInventoryItem?.partNumber ||
                        selectedInventoryItem?.code}{" "}
                      —{" "}
                      {selectedInventoryItem?.description ||
                        selectedInventoryItem?.name}
                    </p>
                  </div>
                  <div className="mt-6 max-h-[55vh] space-y-2 overflow-y-auto">
                    {stockLocations.map((location) => {
                      const available = Number(
                        selectedInventoryItem?.warehouseStock?.[location.id] ||
                          0,
                      );
                      return (
                        <button
                          key={location.id}
                          type="button"
                          disabled={!allowNegativeStock && available <= 0}
                          onClick={() => selectInvoiceStockLocation(location)}
                          className="flex w-full items-center justify-between rounded-xl border p-4 text-left hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <span className="font-black">{location.name}</span>
                          <span
                            className={`text-sm font-bold ${available < 0 ? "text-red-600" : ""}`}
                          >
                            Available: {available.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                    {stockLocations.length === 0 && (
                      <p className="rounded-xl bg-amber-50 p-5 text-center font-semibold text-amber-800">
                        No stock locations are configured.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateLine(stockLocationPicker.lineId, {
                        inventoryId: "",
                        inventorySearch: "",
                        code: "",
                        description: "",
                        stockLocationId: "",
                        stockLocationName: "",
                        cost: 0,
                        markup: 0,
                        priceExcl: 0,
                        priceIncl: 0,
                      });
                      setStockLocationPicker(null);
                    }}
                    className="mt-6 w-full rounded-xl border px-5 py-3 font-bold"
                  >
                    Cancel Item Selection
                  </button>
                </section>
              </div>
            );
          })()}
        {showPaymentModal && (
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-payment-title"
              className="w-full max-w-3xl rounded-2xl bg-white p-7 shadow-2xl"
            >
              <h2 id="create-payment-title" className="text-xl font-black">
                Create Payment
              </h2>
              <p className="mt-5 text-sm font-black">
                Amount Due:{" "}
                {money(Math.max(0, totals.total - invoiceAmountPaid))}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="text-sm font-bold">
                  Amount Received <span className="text-red-600">*</span>
                  <input
                    autoFocus
                    type="number"
                    min="0.01"
                    max={Math.max(0, totals.total - invoiceAmountPaid)}
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    className="mt-2 h-12 w-full rounded-lg border px-3"
                  />
                </label>
                <label className="text-sm font-bold">
                  Date Received <span className="text-red-600">*</span>
                  <input
                    type="date"
                    value={paymentForm.dateReceived}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        dateReceived: event.target.value,
                      }))
                    }
                    className="mt-2 h-12 w-full rounded-lg border px-3"
                  />
                </label>
                <label className="text-sm font-bold">
                  Reference <span className="text-red-600">*</span>
                  <input
                    value={paymentForm.reference}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        reference: event.target.value,
                      }))
                    }
                    className="mt-2 h-12 w-full rounded-lg border px-3"
                  />
                </label>
              </div>
              <label className="mt-5 block text-sm font-bold">
                Description
                <textarea
                  value={paymentForm.description}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-2 h-24 w-full rounded-lg border p-3"
                />
              </label>
              <div className="mt-5 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
                <strong className="block text-indigo-700">
                  ⓘ Did you know?
                </strong>
                <span className="mt-2 block">
                  Saved payments are displayed as receipts on the invoice
                  preview and printout.
                </span>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={paymentSaving}
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-lg px-5 py-3 font-bold text-gray-600"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={paymentSaving || Number(paymentForm.amount) <= 0}
                  onClick={() => void createInvoicePayment()}
                  className="rounded-lg bg-blue-700 px-7 py-3 font-black text-white disabled:opacity-40"
                >
                  {paymentSaving ? "Creating…" : "Create"}
                </button>
              </div>
            </section>
          </div>
        )}
        <JobItemPickerModal
          jobId={jobId || ""}
          mode={jobItemPickerMode}
          onClose={() => setJobItemPickerMode(null)}
          onSelect={addJobItems}
        />
      </div>
    </main>
  );
}
