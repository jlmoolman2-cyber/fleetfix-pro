"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { clientDb, storage } from "@/lib/firebaseClient";
import { auditFields, creationAuditFields, getAuditActor } from "@/lib/audit";
import { COMPANY_ID } from "@/lib/company";
import JobItemPickerModal, {
  JobCardItem,
} from "@/components/jobs/JobItemPickerModal";
import { hasPermission, hasPrivilegedRole } from "@/lib/accessControl";

import { useEffect, useMemo, useState } from "react";

interface Supplier {
  id: string;

  supplierName?: string;
  supplierCode?: string;
  email?: string;
  sendPurchaseOrders?: boolean;
  purchaseOrderMessageTemplateId?: string;
}

interface InventoryItem {
  id: string;

  partNumber?: string;

  description?: string;

  sellPrice?: number;

  costPrice?: number;
}

interface FleetFixUser { id: string; firstName?: string; lastName?: string; name?: string; email?: string; active?: boolean; notificationPreferences?: Record<string, boolean>; }

interface POLine {
  inventoryId: string;
  inventorySearch?: string;

  code: string;

  description: string;

  qty: number;

  priceExcl: number;

  vat: number;

  totalExcl: number;

  totalIncl: number;

  lineType?: "item" | "description";
}

interface PurchaseOrdersPageProps {
  documentType?: "purchase_order" | "quote";
  jobId?: string;
  documentId?: string;
}

export default function PurchaseOrdersPage({
  documentType = "purchase_order",
  jobId,
  documentId,
}: PurchaseOrdersPageProps) {
  const isQuote = documentType === "quote";
  const documentLabel = isQuote ? "Quote" : "Purchase Order";
  const [jobIdFromUrl, setJobIdFromUrl] = useState("");
  const linkedJobId = jobId || jobIdFromUrl;
  const isEditing = Boolean(documentId);

  const [saving, setSaving] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showAddLineOptions, setShowAddLineOptions] = useState(false);
  const [jobItemPickerMode, setJobItemPickerMode] = useState<
    "prompt" | "select" | null
  >(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [fleetFixUsers, setFleetFixUsers] = useState<FleetFixUser[]>([]);
  const [allocatedReviewerId, setAllocatedReviewerId] = useState("");
  const [instructionMethods, setInstructionMethods] = useState<string[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<string[]>([]);
  const [instructionOptions, setInstructionOptions] = useState<string[]>([]);
  const [instructionMethod, setInstructionMethod] = useState("");
  const [paymentInstruction, setPaymentInstruction] = useState("");
  const [proceedInstruction, setProceedInstruction] = useState("");
  const [sendingInstructions, setSendingInstructions] = useState(false);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [referenceNumber, setReferenceNumber] = useState("");
  const [documentDisplayNumber, setDocumentDisplayNumber] = useState("");
  const [documentStatus, setDocumentStatus] = useState("draft");
  const [receiptStatus, setReceiptStatus] = useState("");
  const [linkedJobNumber, setLinkedJobNumber] = useState("");
  const [closingPurchaseOrder, setClosingPurchaseOrder] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canApprovePurchaseOrders, setCanApprovePurchaseOrders] =
    useState(false);
  const [canClosePurchaseOrders, setCanClosePurchaseOrders] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [actionPanel, setActionPanel] = useState<
    "messages" | "comments" | "attachments" | "history" | null
  >(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [newComment, setNewComment] = useState("");
  const [purchaseOrderData, setPurchaseOrderData] = useState<any>(null);
  const [hasLinkedGrv, setHasLinkedGrv] = useState(false);
  const [linkedGrvCount, setLinkedGrvCount] = useState(0);

  const [supplier, setSupplier] = useState("");

  const [deliveryAddress, setDeliveryAddress] = useState("");

  const [notes, setNotes] = useState("");

  const [employee, setEmployee] = useState("");

  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [lines, setLines] = useState<POLine[]>([]);

  const [selectedInventory, setSelectedInventory] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");

  useEffect(() => {
    setJobIdFromUrl(
      new URLSearchParams(window.location.search).get("jobId") || "",
    );

    const unsubInventory = onSnapshot(
      collection(clientDb, "companies", "comp_001", "inventory"),

      (snapshot) => {
        setInventory(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          })),
        );
      },
    );

    const unsubSuppliers = onSnapshot(
      collection(clientDb, "companies", "comp_001", "suppliers"),

      (snapshot) => {
        setSuppliers(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          })),
        );
      },
    );

    const unsubUsers = onSnapshot(collection(clientDb, "companies", COMPANY_ID, "users"), (snapshot) => {
      setFleetFixUsers(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) })).filter((entry) => entry.active !== false));
    });
    void getDoc(doc(clientDb, "companies", COMPANY_ID, "purchase_order_settings", "general")).then((snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setInstructionMethods(Array.isArray(data.instructionMethods) ? data.instructionMethods : []);
      setPaymentOptions(Array.isArray(data.paymentOptions) ? data.paymentOptions : []);
      setInstructionOptions(Array.isArray(data.instructionOptions) ? data.instructionOptions : ["Proceed", "Cancelled", "Customer Sending Parts", "Await Delivery", "Collect From Courier on Arrival"]);
    });

    if (documentId) {
      getDoc(
        doc(
          clientDb,
          "companies",
          "comp_001",
          isQuote ? "quotes" : "purchase_orders",
          documentId,
        ),
      ).then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as any;
        setPurchaseOrderData(data);
        setSupplier(data.supplier || "");
        setReferenceNumber(data.referenceNumber || "");
        setDeliveryAddress(data.deliveryAddress || "");
        setNotes(data.notes || "");
        setEmployee(data.employee || "");
        setAllocatedReviewerId(data.allocatedReviewerId || "");
        setInstructionMethod(data.instructionMethod || "");
        setPaymentInstruction(data.paymentInstruction || "");
        setProceedInstruction(data.proceedInstruction || "");
        setDocumentDisplayNumber(data.purchaseOrderNumber || data.quoteNumber || "");
        setPurchaseDate(
          data.purchaseDate || new Date().toISOString().split("T")[0],
        );
        setDeliveryDate(
          data.deliveryDate || new Date().toISOString().split("T")[0],
        );
        setDocumentStatus(data.status || "draft");
        setReceiptStatus(
          data.receiptStatus ||
          (data.fullyReceived
            ? "fully_received"
            : data.partiallyReceived ||
              Number(data.receivedQty || 0) > 0 ||
              Object.values(data.receivedQuantities || {}).some(
                (quantity) => Number(quantity) > 0,
              )
              ? "partial_received"
              : ""),
        );
        setLines(
          Array.isArray(data.lines)
            ? data.lines.map((line: POLine) => ({
              ...line,
              lineType:
                line.lineType ||
                ((line as any).type === "description" ||
                  (line as any).isDescription === true
                  ? "description"
                  : "") ||
                (!line.inventoryId && !line.code && !Number(line.priceExcl)
                  ? "description"
                  : "item"),
            }))
            : [],
        );
        setJobIdFromUrl(data.jobId || "");
        setLinkedJobNumber(data.jobNumber || "");
      });
      getDocs(
        collection(
          clientDb,
          "companies",
          "comp_001",
          isQuote ? "quotes" : "purchase_orders",
        ),
      ).then((snapshot) => {
        const documentIndex = snapshot.docs.findIndex(
          (documentSnapshot) => documentSnapshot.id === documentId,
        );
        if (documentIndex < 0) return;
        const storedNumber = snapshot.docs[documentIndex].data().purchaseOrderNumber || snapshot.docs[documentIndex].data().quoteNumber;
        setDocumentDisplayNumber(storedNumber || `${isQuote ? "QT" : "PO"}${String(documentIndex + 1).padStart(6, "0")}`);
      });
      if (!isQuote)
        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "inventory_transactions",
          ),
        ).then((snapshot) => {
          const linkedTransactions = snapshot.docs
            .map((entry) => entry.data())
            .filter(
              (entry) =>
                entry.type === "grv" && entry.purchaseOrderId === documentId,
            );
          const batches = new Set(
            linkedTransactions.map(
              (entry) =>
                entry.grvBatchId ||
                `${entry.reference || "GRV"}:${entry.createdAt?.seconds || "legacy"}`,
            ),
          );
          setHasLinkedGrv(linkedTransactions.length > 0);
          setLinkedGrvCount(batches.size);
        });
    }

    return () => {
      unsubInventory();
      unsubSuppliers();
      unsubUsers();
    };
  }, [documentId, isQuote]);

  useEffect(() => {
    let active = true;
    async function loadCurrentUserRole() {
      const auth = getAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      let userData: any = null;
      if (user) {
        const [companyUser, globalUser] = await Promise.all([
          getDoc(doc(clientDb, "companies", COMPANY_ID, "users", user.uid)),
          getDoc(doc(clientDb, "users", user.uid)),
        ]);
        const globalData = globalUser.exists() ? globalUser.data() : {};
        const companyData = companyUser.exists() ? companyUser.data() : {};
        userData = {
          ...globalData,
          ...companyData,
          permissions: {
            ...(globalData.permissions || {}),
            ...(companyData.permissions || {}),
          },
        };
      }
      const role = String(
        userData?.primaryRole || userData?.role || "",
      ).toLowerCase();
      if (active) {
        setIsAdmin(hasPrivilegedRole(role));
        setCanApprovePurchaseOrders(
          hasPrivilegedRole(role) ||
          hasPermission(userData?.permissions, "Approve purchase orders"),
        );
        setCanClosePurchaseOrders(
          hasPrivilegedRole(role) ||
          hasPermission(userData?.permissions, "Close purchase orders"),
        );
      }
    }
    void loadCurrentUserRole();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!linkedJobId) {
      setLinkedJobNumber("");
      return;
    }
    getDoc(doc(clientDb, "companies", "comp_001", "jobs", linkedJobId)).then(
      (snapshot) => {
        if (snapshot.exists()) {
          setLinkedJobNumber(String(snapshot.data().jobNumber || snapshot.id));
        }
      },
    );
  }, [linkedJobId]);

  useEffect(() => {
    if (linkedJobId && !documentId) setJobItemPickerMode("prompt");
  }, [documentId, linkedJobId]);

  function addLine() {
    setLines((current) => [
      ...current,
      {
        lineType: "item",
        inventoryId: "",
        inventorySearch: "",
        code: "",
        description: "",
        qty: 1,
        priceExcl: 0,
        vat: 0,
        totalExcl: 0,
        totalIncl: 0,
      },
    ]);
  }

  function selectLineInventory(index: number, item: InventoryItem) {
    const priceExcl = Number(item.costPrice || 0);
    const updated = [...lines];
    updated[index] = {
      ...updated[index],
      lineType: "item",
      inventoryId: item.id,
      inventorySearch: [item.partNumber, item.description]
        .filter(Boolean)
        .join(" - "),
      code: item.partNumber || "",
      description: item.description || "",
      qty: Number(updated[index]?.qty || 1),
      priceExcl,
    };
    updated[index].totalExcl = Number(
      (updated[index].qty * priceExcl).toFixed(2),
    );
    updated[index].vat = Number((updated[index].totalExcl * 0.15).toFixed(2));
    updated[index].totalIncl = Number(
      (updated[index].totalExcl + updated[index].vat).toFixed(2),
    );
    const hasOpenItemLine = updated.some(
      (line, lineIndex) =>
        lineIndex !== index &&
        line.lineType === "item" &&
        !line.inventoryId &&
        !line.description &&
        !line.code,
    );
    if (index === updated.length - 1 && !hasOpenItemLine) {
      updated.push({
        lineType: "item",
        inventoryId: "",
        inventorySearch: "",
        code: "",
        description: "",
        qty: 1,
        priceExcl: 0,
        vat: 0,
        totalExcl: 0,
        totalIncl: 0,
      });
    }
    setLines(updated);
  }

  function handleExactPartNumberEnter(event: React.KeyboardEvent<HTMLElement>) {
    if (
      event.key !== "Enter" ||
      !(event.target instanceof HTMLInputElement) ||
      event.target.getAttribute("list") !== "purchase-order-inventory-items"
    )
      return;
    const entered = event.target.value.trim().toLowerCase();
    const item = inventory.find(
      (entry) =>
        String(entry.partNumber || "")
          .trim()
          .toLowerCase() === entered,
    );
    if (!item) return;
    const row = event.target.closest("tr");
    if (!row) return;
    const index = row.rowIndex - 1;
    if (!lines[index]) return;
    event.preventDefault();
    event.stopPropagation();
    selectLineInventory(index, item);
  }

  function addDescriptionLine() {
    setLines((current) => [
      ...current,
      {
        lineType: "description",
        inventoryId: "",
        code: "",
        description: "",
        qty: 0,
        priceExcl: 0,
        vat: 0,
        totalExcl: 0,
        totalIncl: 0,
      },
    ]);
  }

  function addJobItems(items: JobCardItem[]) {
    const nextLines = items.map((item) => {
      const qty = Number(item.qty ?? item.quantity ?? 1);
      const priceExcl = Number(item.sellPrice ?? item.priceExcl ?? 0);
      const totalExcl = qty * priceExcl;
      const vat = totalExcl * 0.15;
      return {
        lineType: "item" as const,
        inventoryId: item.inventoryId || "",
        inventorySearch: [item.partNumber || item.code, item.description]
          .filter(Boolean)
          .join(" - "),
        code: item.partNumber || item.code || "",
        description: item.description || "",
        qty,
        priceExcl,
        vat,
        totalExcl,
        totalIncl: totalExcl + vat,
      };
    });
    setLines((current) => [...current, ...nextLines]);
    setJobItemPickerMode(null);
  }

  function updateLine(index: number, field: string, value: any) {
    const updated = [...lines];

    updated[index] = {
      ...updated[index],

      [field]: value,
    };

    updated[index].totalExcl = Number(
      (updated[index].qty * updated[index].priceExcl).toFixed(2),
    );

    updated[index].vat = Number((updated[index].totalExcl * 0.15).toFixed(2));

    updated[index].totalIncl = Number(
      (updated[index].totalExcl + updated[index].vat).toFixed(2),
    );

    setLines(updated);
  }

  async function openPurchaseOrderPanel(
    panel: "messages" | "comments" | "attachments" | "history",
  ) {
    if (!documentId) return;
    setShowActions(false);
    setActionPanel(panel);
    if (panel === "messages") {
      const snapshot = await getDocs(
        collection(clientDb, "companies", COMPANY_ID, "communicationQueue"),
      );
      const messages = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as any)
        .filter(
          (item: any) =>
            item.purchaseOrderId === documentId ||
            (item.documentId === documentId &&
              item.documentType === "purchase_order"),
        )
        .sort(
          (a: any, b: any) =>
            Number(
              b.sentAt?.seconds ||
              b.deliveredAt?.seconds ||
              b.createdAt?.seconds ||
              0,
            ) -
            Number(
              a.sentAt?.seconds ||
              a.deliveredAt?.seconds ||
              a.createdAt?.seconds ||
              0,
            ),
        );
      setActionItems(messages);
      setExpandedMessageIds(messages.map((item: any) => item.id));
    } else {
      const snapshot = await getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "purchase_orders",
          documentId,
          panel,
        ),
      );
      setActionItems(
        snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
      );
    }
  }

  async function savePurchaseOrderComment() {
    if (!documentId || !newComment.trim()) return;
    const user = getAuth().currentUser;
    const entry = {
      comment: newComment.trim(),
      createdAt: serverTimestamp(),
      createdById: user?.uid || "",
      createdByName: user?.displayName || user?.email || "User",
    };
    const saved = await addDoc(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "purchase_orders",
        documentId,
        "comments",
      ),
      entry,
    );
    setActionItems((current) => [
      ...current,
      { id: saved.id, ...entry, createdAt: new Date() },
    ]);
    setNewComment("");
  }

  async function uploadPurchaseOrderAttachments(files: FileList | null) {
    if (!documentId || !files?.length) return;
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `companies/${COMPANY_ID}/purchase_orders/${documentId}/attachments/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: file.type || "application/octet-stream",
      });
      const item = {
        name: file.name,
        url: await getDownloadURL(storageRef),
        storagePath,
        size: file.size,
        createdAt: serverTimestamp(),
      };
      const saved = await addDoc(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "purchase_orders",
          documentId,
          "attachments",
        ),
        item,
      );
      setActionItems((current) => [
        ...current,
        { id: saved.id, ...item, createdAt: new Date() },
      ]);
    }
  }

  async function cancelPurchaseOrder() {
    if (!documentId || !confirm("Cancel this purchase order?")) return;
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "purchase_orders", documentId),
      {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    await addPurchaseOrderHistory("CANCELLED", "Purchase order cancelled.");
    setDocumentStatus("cancelled");
    setShowActions(false);
  }

  async function copyPurchaseOrder() {
    if (!documentId || !purchaseOrderData) return;
    const {
      approvedAt,
      approvedById,
      approvedByName,
      closedAt,
      cancelledAt,
      receivedAt,
      ...copy
    } = purchaseOrderData;
    const created = await addDoc(
      collection(clientDb, "companies", COMPANY_ID, "purchase_orders"),
      {
        ...copy,
        status: "draft",
        approved: false,
        received: false,
        referenceNumber: "",
        ...creationAuditFields(),
      },
    );
    const actor = getAuditActor();
    await addDoc(collection(created, "history"), {
      action: "CREATED_FROM_COPY",
      details: `Purchase order copied from ${documentDisplayNumber || documentId}.`,
      status: "draft",
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      createdAt: serverTimestamp(),
    });
    window.location.href = `/purchase-orders/${created.id}`;
  }

  async function addPurchaseOrderHistory(action: string, details: string) {
    if (!documentId) return;
    const actor = getAuditActor();
    await addDoc(
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "purchase_orders",
        documentId,
        "history",
      ),
      {
        action,
        details,
        status: documentStatus,
        userId: actor.userId,
        userName: actor.userName,
        userEmail: actor.userEmail,
        createdAt: serverTimestamp(),
      },
    );
  }

  async function markPurchaseOrderReceived() {
    if (
      !documentId ||
      !confirm("Mark this purchase order as received and close it?")
    )
      return;
    setClosingPurchaseOrder(true);
    try {
      await updateDoc(
        doc(clientDb, "companies", "comp_001", "purchase_orders", documentId),
        {
          status: "closed",
          receiptStatus: "fully_received",
          fullyReceived: true,
          partiallyReceived: false,
          received: true,
          receivedAt: serverTimestamp(),
          closedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...auditFields("PROCESS"),
        },
      );
      await addPurchaseOrderHistory(
        "FULLY_RECEIVED",
        "Purchase order marked fully received and closed.",
      );
      setDocumentStatus("closed");
      setReceiptStatus("fully_received");
      alert("Purchase order received and moved to the Closed tab.");
    } finally {
      setClosingPurchaseOrder(false);
    }
  }

  async function approvePurchaseOrder() {
    if (!documentId || !canApprovePurchaseOrders || documentStatus !== "draft")
      return alert(
        "You do not have permission to approve this purchase order.",
      );
    if (!confirm("Approve this purchase order and move it to Open?")) return;
    await updateDoc(
      doc(clientDb, "companies", "comp_001", "purchase_orders", documentId),
      {
        status: "open",
        approved: true,
        approvedAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    await addPurchaseOrderHistory(
      "APPROVED",
      "Purchase order approved and moved to Open.",
    );
    setDocumentStatus("open");
    alert("Purchase order approved and moved to Open.");
  }

  async function approveAndSendPurchaseOrder() {
    if (!documentId || isQuote) return;
    if (!canApprovePurchaseOrders) {
      alert("You do not have permission to approve and send purchase orders.");
      return;
    }
    if (!["draft", "open"].includes(documentStatus)) {
      alert("Only Draft or Open purchase orders can be sent.");
      return;
    }
    if (!confirm(`${documentStatus === "draft" ? "Approve this purchase order and" : ""} open the Compose Message screen?`)) return;

    try {
      setSaving(true);
      const documentLines = lines
        .filter((line) => line.lineType === "description" ? Boolean(line.description.trim()) : Boolean(line.inventoryId || line.code || line.description.trim()))
        .map((line) => line.lineType === "description"
          ? { ...line, lineType: "description" as const, description: line.description.trim(), inventoryId: "", code: "", qty: 0, priceExcl: 0, vat: 0, totalExcl: 0, totalIncl: 0 }
          : { ...line, lineType: "item" as const });
      if (documentLines.length === 0) {
        alert("Add at least one purchase order line.");
        return;
      }

      const purchaseOrderRef = doc(clientDb, "companies", COMPANY_ID, "purchase_orders", documentId);
      const wasDraft = documentStatus === "draft";
      const selectedSupplier = suppliers.find((entry) => entry.supplierName === supplier);
      if (!selectedSupplier) {
        alert("Select a valid supplier before composing the purchase order message.");
        return;
      }
      await updateDoc(purchaseOrderRef, {
        supplier,
        supplierId: selectedSupplier.id,
        referenceNumber,
        deliveryAddress,
        notes,
        employee,
        purchaseDate,
        deliveryDate,
        lines: documentLines,
        subtotal,
        vatTotal,
        grandTotal,
        status: "open",
        approved: true,
        ...(wasDraft ? { approvedAt: serverTimestamp() } : {}),
        ...auditFields("UPDATE"),
      });
      if (wasDraft) await addPurchaseOrderHistory("APPROVED", "Purchase order approved and moved to Open before composing a message.");
      setDocumentStatus("open");
      window.dispatchEvent(new Event("fleetfix:changes-saved"));
      window.location.href = `/messages/compose?module=Purchase%20Order&documentId=${documentId}${linkedJobId ? `&jobId=${linkedJobId}` : ""}`;
    } catch (error) {
      console.error("Unable to approve and send the purchase order:", error);
      alert("Unable to approve and send the purchase order.");
    } finally {
      setSaving(false);
    }
  }

  async function purchaseOrderNotificationRecipients(jobIdValue: string, creatorId: string, reviewerId: string) {
    const recipientIds = new Set<string>();
    if (creatorId) recipientIds.add(creatorId);
    if (reviewerId) recipientIds.add(reviewerId);
    fleetFixUsers.forEach((entry) => {
      if (entry.active !== false && entry.notificationPreferences?.purchase_orders !== false) recipientIds.add(entry.id);
    });
    if (jobIdValue) {
      const jobSnapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", jobIdValue));
      const jobData = jobSnapshot.exists() ? jobSnapshot.data() : {};
      (Array.isArray(jobData.assignedUserIds) ? jobData.assignedUserIds : []).forEach((id: any) => id && recipientIds.add(String(id)));
      (Array.isArray(jobData.assignedUsers) ? jobData.assignedUsers : []).forEach((entry: any) => {
        const id = typeof entry === "string" ? entry : entry?.id || entry?.userId || entry?.uid;
        if (id) recipientIds.add(String(id));
      });
    }
    return Array.from(recipientIds);
  }

  function purchaseOrderCreatorId(data: any) {
    if (data?.createdById) return String(data.createdById);
    const email = String(data?.createdByEmail || "").trim().toLowerCase();
    return fleetFixUsers.find((entry) => String(entry.email || "").trim().toLowerCase() === email)?.id || "";
  }

  async function sendPurchaseOrderInstructions() {
    if (!documentId || isQuote) return;
    const user = getAuth().currentUser;
    if (allocatedReviewerId && user?.uid !== allocatedReviewerId && !canApprovePurchaseOrders) return alert("Only the allocated reviewer or a user with Purchase Order Approval permission can issue instructions.");
    if (documentStatus === "draft" && !canApprovePurchaseOrders) return alert("This purchase order still requires approval by a user with Purchase Order Approval permission.");
    if (!instructionMethod) return alert("Select an instruction method.");
    if (!paymentInstruction) return alert("Select a payment instruction.");
    if (!proceedInstruction) return alert("Select the final purchase instruction.");
    if (!supplier) return alert("Select a supplier before sending instructions.");
    const documentLines = lines
      .filter((line) => line.lineType === "description" ? Boolean(line.description.trim()) : Boolean(line.inventoryId || line.code || line.description.trim()))
      .map((line) => line.lineType === "description"
        ? { ...line, lineType: "description" as const, description: line.description.trim(), inventoryId: "", code: "", qty: 0, priceExcl: 0, vat: 0, totalExcl: 0, totalIncl: 0 }
        : { ...line, lineType: "item" as const });
    if (documentLines.length === 0) return alert("Add at least one purchase order line before sending instructions.");
    const selectedSupplier = suppliers.find((entry) => entry.supplierName === supplier);
    if (!selectedSupplier) return alert("Select a valid supplier before sending instructions.");
    if (!confirm(`${documentStatus === "draft" ? "Approve this purchase order and " : ""}send the method and payment instructions?`)) return;
    try {
      setSendingInstructions(true);
      const approvedNow = documentStatus === "draft";
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "purchase_orders", documentId), {
        supplier,
        supplierId: selectedSupplier.id,
        jobId: linkedJobId,
        jobNumber: linkedJobNumber,
        referenceNumber,
        deliveryAddress,
        notes,
        employee,
        purchaseDate,
        deliveryDate,
        lines: documentLines,
        subtotal,
        vatTotal,
        grandTotal,
        allocatedReviewerId,
        allocatedReviewerName: (() => { const reviewer = fleetFixUsers.find((entry) => entry.id === allocatedReviewerId); return reviewer ? (reviewer.name || `${reviewer.firstName || ""} ${reviewer.lastName || ""}`.trim() || reviewer.email || "") : ""; })(),
        status: "open", approved: true, ...(approvedNow ? { approvedAt: serverTimestamp() } : {}),
        instructionMethod, paymentInstruction, proceedInstruction, instructionsIssued: true, instructionsIssuedAt: serverTimestamp(),
        purchaseInstructionsInternalOnly: true,
        instructionsIssuedById: user?.uid || "", instructionsIssuedByName: user?.displayName || user?.email || "Authorized user",
        updatedAt: serverTimestamp(), ...auditFields("UPDATE"),
      });
      await addPurchaseOrderHistory("INSTRUCTIONS_ISSUED", `Method: ${instructionMethod}. Payment: ${paymentInstruction}. Instruction: ${proceedInstruction}.`);
      const recipientIds = await purchaseOrderNotificationRecipients(linkedJobId, purchaseOrderCreatorId(purchaseOrderData), allocatedReviewerId);
      const number = documentDisplayNumber || purchaseOrderData?.purchaseOrderNumber || documentId;
      await Promise.all(recipientIds.map(async (recipientId) => {
        const recipient = fleetFixUsers.find((entry) => entry.id === recipientId);
        await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
          type: "purchase_order_instructions", title: `${linkedJobNumber ? `Job ${linkedJobNumber} - ` : ""}Purchase Order ${number} approved`,
          message: `METHOD: ${instructionMethod} | PAYMENT: ${paymentInstruction} | INSTRUCTION: ${proceedInstruction}`,
          jobId: linkedJobId, jobNumber: linkedJobNumber, purchaseOrderId: documentId, purchaseOrderNumber: number,
          supplierName: supplier, instructionMethod, paymentInstruction, proceedInstruction, approved: true, approvalStatus: "approved",
          internalOnly: true,
          recipientId, recipientName: recipient?.name || `${recipient?.firstName || ""} ${recipient?.lastName || ""}`.trim() || recipient?.email || "FleetFix user",
          createdById: user?.uid || "", createdByName: user?.displayName || user?.email || "Authorized user",
          sourcePath: `/purchase-orders/${documentId}`, status: "active", finalized: false, createdAt: serverTimestamp(),
        });
      }));
      setDocumentStatus("open");
      setPurchaseOrderData((current: any) => ({ ...current, supplier, supplierId: selectedSupplier.id, referenceNumber, deliveryAddress, notes, employee, purchaseDate, deliveryDate, lines: documentLines, subtotal, vatTotal, grandTotal, allocatedReviewerId, approved: true, instructionMethod, paymentInstruction, proceedInstruction, instructionsIssued: true }));
      window.dispatchEvent(new Event("fleetfix:changes-saved"));
      alert("Purchase order instructions sent to the relevant users.");
    } catch (error) {
      console.error("Unable to send purchase order instructions", error);
      alert("Unable to send the purchase order instructions.");
    } finally { setSendingInstructions(false); }
  }

  async function manuallyClosePurchaseOrder() {
    if (!documentId || !canClosePurchaseOrders || documentStatus !== "open")
      return alert("You do not have permission to close this purchase order.");
    if (!confirm("Manually close this purchase order?")) return;
    await updateDoc(
      doc(clientDb, "companies", "comp_001", "purchase_orders", documentId),
      {
        status: "closed",
        manuallyClosed: true,
        closedAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      },
    );
    await addPurchaseOrderHistory("CLOSED", "Purchase order manually closed.");
    setDocumentStatus("closed");
    alert("Purchase order moved to Closed.");
  }

  const subtotal = useMemo(() => {
    return lines.reduce((sum, line) => sum + line.totalExcl, 0);
  }, [lines]);

  const vatTotal = useMemo(() => {
    return lines.reduce((sum, line) => sum + line.vat, 0);
  }, [lines]);

  const grandTotal = subtotal + vatTotal;
  const purchaseOrderCanBeAmended =
    isQuote || !documentId || ["draft", "open"].includes(documentStatus);
  async function createPO(approveAfterCreate = false) {
    try {
      if (!purchaseOrderCanBeAmended) {
        alert("Only Draft or Open purchase orders can be amended.");
        return;
      }
      if (approveAfterCreate && !canApprovePurchaseOrders) {
        alert("You do not have permission to approve purchase orders.");
        return;
      }

      const documentLines = lines
        .filter((line) =>
          line.lineType === "description"
            ? Boolean(line.description.trim())
            : Boolean(line.inventoryId || line.code || line.description.trim()),
        )
        .map((line) =>
          line.lineType === "description"
            ? {
              ...line,
              lineType: "description" as const,
              description: line.description.trim(),
              inventoryId: "",
              code: "",
              qty: 0,
              priceExcl: 0,
              vat: 0,
              totalExcl: 0,
              totalIncl: 0,
            }
            : { ...line, lineType: "item" as const },
        );

      if (!supplier) {
        alert("Select a supplier before creating the purchase order.");
        return;
      }

      if (!isQuote && linkedJobId && !allocatedReviewerId) {
        alert("Select an allocated purchase order reviewer for this job-related order.");
        return;
      }

      if (documentLines.length === 0) {
        alert("Add at least one purchase order line.");
        return;
      }

      setSaving(true);

      const selectedSupplier = suppliers.find(
        (entry) => entry.supplierName === supplier,
      );
      const status = approveAfterCreate ? "open" : "draft";
      let allocatedPurchaseOrderNumber = "";
      if (!isQuote && !documentId) {
        allocatedPurchaseOrderNumber = await runTransaction(
          clientDb,
          async (transaction) => {
            const numberSettingsRef = doc(
              clientDb,
              "companies",
              "comp_001",
              "purchase_order_settings",
              "general",
            );
            const snapshot = await transaction.get(numberSettingsRef);
            const numberSettings = snapshot.exists() ? snapshot.data() : {};
            if (numberSettings.numberingEnabled === false) return "";
            const current = String(numberSettings.currentSequence ?? "00000");
            const width = Math.max(1, current.length);
            const next = String((Number(current) || 0) + 1).padStart(
              width,
              "0",
            );
            const prefix = String(numberSettings.prefix || "PO")
              .trim()
              .toUpperCase();
            transaction.set(
              numberSettingsRef,
              {
                numberingEnabled: true,
                prefix,
                currentSequence: next,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
            return `${prefix}${next}`;
          },
        );
      }

      const jobNumber = linkedJobId
        ? (
          await getDoc(
            doc(clientDb, "companies", "comp_001", "jobs", linkedJobId),
          )
        ).data()?.jobNumber || ""
        : "";

      if (documentId) {
        await updateDoc(
          doc(
            clientDb,
            "companies",
            "comp_001",
            isQuote ? "quotes" : "purchase_orders",
            documentId,
          ),
          {
            supplier,
            supplierId: selectedSupplier?.id || "",
            jobId: linkedJobId,
            jobNumber,
            referenceNumber,
            deliveryAddress,
            notes,
            employee,
            allocatedReviewerId,
            allocatedReviewerName: (() => { const user = fleetFixUsers.find((entry) => entry.id === allocatedReviewerId); return user ? (user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "") : ""; })(),
            purchaseDate,
            deliveryDate,
            lines: documentLines,
            subtotal,
            vatTotal,
            grandTotal,
            documentPrintPath: `/documents/${isQuote ? "quote" : "purchase_order"}/${documentId}`,
            updatedAt: serverTimestamp(),
            ...auditFields("UPDATE"),
          },
        );
        if (!isQuote)
          await addPurchaseOrderHistory(
            "EDITED",
            "Purchase order details or item lines updated.",
          );
        if (!isQuote && allocatedReviewerId && allocatedReviewerId !== purchaseOrderData?.allocatedReviewerId) {
          const recipients = await purchaseOrderNotificationRecipients(linkedJobId, purchaseOrderCreatorId(purchaseOrderData), allocatedReviewerId);
          await Promise.all(recipients.map(async (recipientId) => {
            const recipient = fleetFixUsers.find((entry) => entry.id === recipientId);
            await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
              type: "purchase_order_review", title: `Purchase order ${documentDisplayNumber || documentId} requires review`,
              message: `${jobNumber ? `Job ${jobNumber} - ` : ""}Review the purchase order, approve it if authorized, and provide method and payment instructions.`,
              jobId: linkedJobId, jobNumber, purchaseOrderId: documentId, purchaseOrderNumber: documentDisplayNumber, internalOnly: true,
              recipientId, recipientName: recipient?.name || `${recipient?.firstName || ""} ${recipient?.lastName || ""}`.trim() || recipient?.email || "FleetFix user",
              sourcePath: `/purchase-orders/${documentId}`, status: "active", finalized: false, ...creationAuditFields(),
            });
          }));
        }
        alert(`${documentLabel} updated.`);
        if (window.history.length > 1) window.history.back();
        else window.location.href = "/purchase-orders/list";
        return;
      }

      const documentRef = await addDoc(
        collection(
          clientDb,
          "companies",
          "comp_001",
          isQuote ? "quotes" : "purchase_orders",
        ),

        {
          supplier,
          supplierId: selectedSupplier?.id || "",

          jobId: linkedJobId,

          jobNumber,

          referenceNumber,

          deliveryAddress,

          notes,

          employee,
          allocatedReviewerId,
          allocatedReviewerName: (() => { const user = fleetFixUsers.find((entry) => entry.id === allocatedReviewerId); return user ? (user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "") : ""; })(),

          purchaseDate,

          deliveryDate,

          lines: documentLines,

          subtotal,

          vatTotal,

          grandTotal,

          status,

          ...(!isQuote && approveAfterCreate ? {
            approved: true,
            approvedAt: serverTimestamp(),
          } : {}),

          ...creationAuditFields(),
        },
      );

      const documentNumber =
        allocatedPurchaseOrderNumber || documentDisplayNumber || documentRef.id;
      if (!isQuote) {
        await updateDoc(documentRef, {
          purchaseOrderNumber: documentNumber,
          documentPrintPath: `/documents/purchase_order/${documentRef.id}`,
          updatedAt: serverTimestamp(),
        });
        const actor = getAuditActor();
        await addDoc(collection(documentRef, "history"), {
          action: approveAfterCreate ? "CREATED_AND_APPROVED" : "CREATED",
          details: approveAfterCreate
            ? "Purchase order created, approved and moved to Open."
            : "Purchase order created as Draft.",
          status,
          userId: actor.userId,
          userName: actor.userName,
          userEmail: actor.userEmail,
          createdAt: serverTimestamp(),
        });
        const recipients = await purchaseOrderNotificationRecipients(linkedJobId, actor.userId, allocatedReviewerId);
        await Promise.all(recipients.map(async (recipientId) => {
          const recipient = fleetFixUsers.find((entry) => entry.id === recipientId);
          await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
            type: "purchase_order_review", title: `Purchase order ${documentNumber} requires review`,
            message: `${jobNumber ? `Job ${jobNumber} - ` : ""}Review the purchase order, approve it if authorized, and provide method and payment instructions.`,
            jobId: linkedJobId, jobNumber, purchaseOrderId: documentRef.id, purchaseOrderNumber: documentNumber, internalOnly: true,
            recipientId, recipientName: recipient?.name || `${recipient?.firstName || ""} ${recipient?.lastName || ""}`.trim() || recipient?.email || "FleetFix user",
            sourcePath: `/purchase-orders/${documentRef.id}`, status: "active", finalized: false, ...creationAuditFields(),
          });
        }));
      }

      if (linkedJobId) {
        const linkedItem = {
          id: documentRef.id,
          referenceNumber: referenceNumber.trim(),
          ...(!isQuote ? { purchaseOrderNumber: documentNumber } : {}),
          status,
          total: grandTotal,
          createdAt: new Date().toISOString(),
        };

        await updateDoc(
          doc(clientDb, "companies", "comp_001", "jobs", linkedJobId),
          {
            [isQuote ? "quotes" : "purchaseOrders"]: arrayUnion(linkedItem),
            updatedAt: serverTimestamp(),
          },
        );
      }

      window.dispatchEvent(new Event("fleetfix:changes-saved"));
      alert(
        approveAfterCreate
          ? `${documentLabel} created and approved.`
          : `${documentLabel} Created`,
      );

      window.location.href = isQuote
        ? `/quotes/${documentRef.id}`
        : `/purchase-orders/${documentRef.id}`;
    } catch (error) {
      console.error(error);

      alert("Failed to create PO");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-[#f5f7fb] p-6"
      onKeyDownCapture={handleExactPartNumberEnter}
    >
      <div className="w-full max-w-none">
        {/* HEADER */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
              {isQuote ? "Quotes" : "Purchases"}
            </div>
            <h1 className="text-4xl font-black text-gray-900">
              {isEditing
                ? `Edit ${documentLabel}${documentDisplayNumber ? ` ${documentDisplayNumber}` : ""}`
                : `Create ${documentLabel}`}
            </h1>
            {!isQuote && documentId && (
              <span
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ${receiptStatus === "fully_received" ? "bg-emerald-100 text-emerald-800" : receiptStatus === "partial_received" ? "bg-amber-100 text-amber-800" : documentStatus === "open" ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700"}`}
              >
                {receiptStatus === "fully_received"
                  ? "Closed - Fully Received"
                  : receiptStatus === "partial_received"
                    ? "Open - Partially Received"
                    : documentStatus}
              </span>
            )}
          </div>

          {documentId && (
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href={`/documents/${isQuote ? "quote" : "purchase_order"}/${documentId}`}
                className="rounded-xl border bg-white px-4 py-3 font-bold text-blue-700"
              >
                Preview
              </Link>
              {!isQuote && hasLinkedGrv && (
                <Link
                  href={`/grv/purchase-order/${documentId}`}
                  className="rounded-xl bg-amber-500 px-4 py-3 font-bold text-white hover:bg-amber-600"
                >
                  GRV <span className="text-xs">({linkedGrvCount})</span>
                </Link>
              )}
              <Link
                href={`/documents/${isQuote ? "quote" : "purchase_order"}/${documentId}?print=1`}
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
              >
                Print / PDF
              </Link>
              {!isQuote && documentStatus === "open" && (
                <Link
                  href={`/messages/compose?module=Purchase%20Order&documentId=${documentId}${linkedJobId ? `&jobId=${linkedJobId}` : ""}`}
                  className="rounded-xl bg-sky-600 px-4 py-3 font-bold text-white hover:bg-sky-700"
                >
                  Send PO
                </Link>
              )}
              {!isQuote && canApprovePurchaseOrders && ["draft", "open"].includes(documentStatus) && (
                <button
                  type="button"
                  onClick={() => void approveAndSendPurchaseOrder()}
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-50"
                >
                  {saving ? "Processing..." : "Approve & Send PO"}
                </button>
              )}
              {!isQuote &&
                canApprovePurchaseOrders &&
                documentStatus === "draft" && (
                  <button
                    type="button"
                    onClick={() => void approvePurchaseOrder()}
                    className="rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700"
                  >
                    Approve
                  </button>
                )}
              {!isQuote && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowActions((current) => !current)}
                    className="rounded-xl bg-blue-500 px-4 py-3 font-bold text-white hover:bg-blue-600"
                  >
                    Actions ▼
                  </button>
                  {showActions && (
                    <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-2xl border bg-white py-2 shadow-xl">
                      {documentStatus === "open" && (
                        <Link
                          href={`/grv?purchaseOrderId=${documentId}`}
                          className="block px-5 py-3 font-bold text-gray-800 hover:bg-gray-100"
                        >
                          GRV
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => void openPurchaseOrderPanel("messages")}
                        className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                      >
                        Messages
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPurchaseOrderPanel("comments")}
                        className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                      >
                        Comments
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void openPurchaseOrderPanel("attachments")
                        }
                        className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                      >
                        Attachments
                      </button>
                      <button
                        type="button"
                        onClick={() => void openPurchaseOrderPanel("history")}
                        className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                      >
                        History
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyPurchaseOrder()}
                        className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                      >
                        Copy Purchase Order
                      </button>
                      {documentStatus !== "cancelled" &&
                        documentStatus !== "closed" && (
                          <button
                            type="button"
                            onClick={() => void cancelPurchaseOrder()}
                            className="block w-full px-5 py-3 text-left font-bold text-red-700 hover:bg-red-50"
                          >
                            Cancel Purchase Order
                          </button>
                        )}
                      {canClosePurchaseOrders && documentStatus === "open" && (
                        <button
                          type="button"
                          onClick={() => void manuallyClosePurchaseOrder()}
                          className="block w-full px-5 py-3 text-left font-bold hover:bg-gray-100"
                        >
                          Close Purchase Order
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!purchaseOrderCanBeAmended && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 font-bold text-amber-900">
            This purchase order is locked. Only purchase orders with Draft or
            Open status can be amended.
          </div>
        )}

        {/* MAIN */}
        <div
          className={`rounded-3xl border border-gray-300 bg-white p-5 shadow-sm md:p-7 ${purchaseOrderCanBeAmended ? "" : "pointer-events-none opacity-75"}`}
        >
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            {/* DOCUMENT DETAILS */}
            <div
              className="
              rounded-3xl
              border
              border-grtyay-EDS 
              bg-gray-50
              p-5
              xl:col-span-3
            "
            >
              <h2 className="mb-5 text-xl font-black text-gray-900">
                {documentLabel} Details
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Supplier *
                  </label>
                  <select
                    value={supplier}
                    onChange={(event) => setSupplier(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                    "
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((entry) => (
                      <option key={entry.id} value={entry.supplierName}>
                        {entry.supplierName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                    "
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                    "
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(event) => setDeliveryDate(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                    "
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Employee
                  </label>
                  <input
                    type="text"
                    value={employee}
                    onChange={(event) => setEmployee(event.target.value)}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                    "
                  />
                </div>

                {!isQuote && <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">Allocated Purchase Order Reviewer {linkedJobId ? "*" : ""}</label>
                  <select value={allocatedReviewerId} onChange={(event) => setAllocatedReviewerId(event.target.value)} className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5">
                    <option value="">Select user to review and instruct</option>
                    {fleetFixUsers.map((user) => <option key={user.id} value={user.id}>{user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unnamed User"}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">This user receives a notification when the purchase order is created or allocated.</p>
                </div>}

                <div>
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Delivery Address
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                    rows={2}
                    className="
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      p-5
                    "
                  />
                </div>
              </div>
            </div>

            {/* LEFT */}
            <div className="space-y-5 xl:col-span-3">
              {linkedJobId && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
                  <div className="text-xs font-black uppercase tracking-wide text-blue-500">
                    Linked Job
                  </div>
                  <Link
                    href={`/jobs/${linkedJobId}`}
                    className="mt-1 inline-block text-lg font-black text-blue-700 hover:underline"
                  >
                    {linkedJobNumber || linkedJobId}
                  </Link>
                </div>
              )}

              {!isQuote && documentId && ["draft", "open"].includes(documentStatus) && (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-indigo-950">Approval and Purchase Instructions</h2><span className="rounded-full bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">Internal Use Only</span></div><p className="mt-1 text-sm text-indigo-700">Review the order, approve it when required, then issue internal method and payment instructions. These details are not included on supplier documents or supplier messages.</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${documentStatus === "open" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{documentStatus === "open" ? "Approved" : "Approval required"}</span>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="text-sm font-black text-gray-700">1. Method<select value={instructionMethod} onChange={(event) => setInstructionMethod(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4 font-bold"><option value="">Select configured method</option>{instructionMethods.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                    <label className="text-sm font-black text-gray-700">2. Payment<select value={paymentInstruction} onChange={(event) => setPaymentInstruction(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4 font-bold"><option value="">Select configured payment option</option>{paymentOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                    <label className="text-sm font-black text-gray-700">3. Instruction<select value={proceedInstruction} onChange={(event) => setProceedInstruction(event.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4 font-bold"><option value="">Select configured instruction</option>{instructionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold text-indigo-700">Draft orders can only be approved by users with Purchase Order Approval permission.</p><button type="button" onClick={() => void sendPurchaseOrderInstructions()} disabled={sendingInstructions} className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white disabled:opacity-50">{sendingInstructions ? "Sending..." : documentStatus === "draft" ? "Approve & Send Instructions" : "Send Instructions"}</button></div>
                </section>
              )}

              {/* SUPPLIER */}
              <div className="hidden">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Supplier *
                </label>

                <select
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                >
                  <option value="">Select supplier</option>

                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.supplierName}>
                      {supplier.supplierName}
                    </option>
                  ))}
                </select>
              </div>

              {/* DELIVERY ADDRESS */}
              <div className="hidden">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Delivery Address
                </label>

                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />
              </div>

              {/* ADD LINE */}
              <div
                className="
                relative
                border
                border-gray-200
                rounded-t-3xl
                p-5
                bg-gray-50
              "
              >
                <div className="mb-4">
                  <h2 className="text-xl font-black text-gray-900">
                    Item Details
                  </h2>
                  <p className="text-sm text-gray-500">
                    Add inventory, job-card items, or a description.
                  </p>
                </div>

                <div className="hidden">
                  <div className="hidden md:col-span-3">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Inventory Item
                    </label>
                    <input
                      type="text"
                      list="purchase-order-inventory-items"
                      placeholder="Search or select an inventory item..."
                      value={inventorySearch}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInventorySearch(value);
                        const matchedItem = inventory.find(
                          (item) =>
                            [item.partNumber, item.description]
                              .map((part) => String(part || "").trim())
                              .filter(Boolean)
                              .join(" - ") === value,
                        );
                        setSelectedInventory(matchedItem?.id || "");
                      }}
                      className="h-14 w-full rounded-2xl border-2 border-gray-200 px-5 outline-none focus:border-blue-500"
                    />
                    <datalist id="purchase-order-inventory-items">
                      {inventory.map((item) => (
                        <option
                          key={item.id}
                          value={[item.partNumber, item.description]
                            .map((part) => String(part || "").trim())
                            .filter(Boolean)
                            .join(" - ")}
                        />
                      ))}
                    </datalist>
                  </div>

                  <div className="relative flex items-end">
                    <button
                      type="button"
                      onClick={() =>
                        setShowAddLineOptions((current) => !current)
                      }
                      className="
                        w-full
                        h-14
                        rounded-2xl
                        bg-blue-600
                        hover:bg-blue-700
                        text-white
                        font-black
                      "
                    >
                      Add Line ▾
                    </button>

                    {showAddLineOptions && (
                      <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-2xl border bg-white shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            addLine();
                            setShowAddLineOptions(false);
                          }}
                          className="block w-full px-5 py-3 text-left font-bold hover:bg-blue-50"
                        >
                          Add Item
                        </button>
                        <button
                          type="button"
                          disabled={!linkedJobId}
                          title={
                            !linkedJobId
                              ? "Link a job to add job items"
                              : undefined
                          }
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
                            addDescriptionLine();
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
              </div>

              {/* TABLE */}
              <div className="!-mt-5 overflow-x-auto rounded-b-3xl border border-gray-200 bg-white">
                <table className="w-full min-w-[1050px] table-fixed">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-black uppercase text-gray-500">
                      <th className="w-12 p-3 text-center">#</th>
                      <th className="w-64 p-3">Product / Service</th>
                      <th className="w-80 p-3">Description</th>
                      <th className="w-24 p-3 text-right">Qty</th>
                      <th className="w-28 p-3 text-right">Rate</th>
                      <th className="w-28 p-3 text-right">Amount</th>
                      <th className="w-20 p-3 text-right">VAT</th>
                      <th className="w-16 p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-100 align-top last:border-b-0"
                      >
                        {line.lineType === "description" ? (
                          <>
                            <td className="p-2 text-center text-xs font-bold text-gray-400">
                              {index + 1}
                            </td>
                            <td colSpan={6} className="p-2">
                              <input
                                value={line.description}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    "description",
                                    event.target.value,
                                  )
                                }
                                placeholder="Description"
                                className="h-10 w-full rounded-lg border border-gray-200 px-3 font-semibold"
                              />
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter(
                                      (_, lineIndex) => lineIndex !== index,
                                    ),
                                  )
                                }
                                className="h-10 w-full font-black text-red-600"
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
                                list="purchase-order-inventory-items"
                                value={
                                  line.inventorySearch ??
                                  [line.code, line.description]
                                    .filter(Boolean)
                                    .join(" - ")
                                }
                                onChange={(event) => {
                                  const inputValue = event.target.value;
                                  const item = inventory.find(
                                    (entry) =>
                                      [entry.partNumber, entry.description]
                                        .filter(Boolean)
                                        .join(" - ") === inputValue,
                                  );
                                  if (item) selectLineInventory(index, item);
                                  else {
                                    const updated = [...lines];
                                    updated[index] = {
                                      ...updated[index],
                                      inventoryId: "",
                                      inventorySearch: inputValue,
                                    };
                                    setLines(updated);
                                  }
                                }}
                                placeholder="Search product or service"
                                className="h-10 w-full rounded-lg border border-gray-200 px-3 font-semibold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={line.description}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    "description",
                                    event.target.value,
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-gray-200 px-3"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={line.qty}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    "qty",
                                    Number(event.target.value),
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-gray-200 px-2 text-right"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                value={line.priceExcl}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    "priceExcl",
                                    Number(event.target.value),
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-gray-200 px-2 text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-black">
                              R {line.totalExcl.toFixed(2)}
                            </td>
                            <td className="p-2 text-right">
                              <span className="block font-bold">15%</span>
                              <span className="text-xs text-gray-500">
                                R {line.vat.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter(
                                      (_, lineIndex) => lineIndex !== index,
                                    ),
                                  )
                                }
                                className="h-10 w-full font-black text-red-600"
                                aria-label="Delete line"
                              >
                                ×
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="relative mt-3 inline-block">
                <button
                  type="button"
                  onClick={() => setShowAddLineOptions((current) => !current)}
                  className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700"
                >
                  + Add Line ▾
                </button>
                {showAddLineOptions && (
                  <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-56 overflow-hidden rounded-2xl border bg-white shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        addLine();
                        setShowAddLineOptions(false);
                      }}
                      className="block w-full px-5 py-3 text-left font-bold hover:bg-blue-50"
                    >
                      Add Item
                    </button>
                    <button
                      type="button"
                      disabled={!linkedJobId}
                      title={
                        !linkedJobId ? "Link a job to add job items" : undefined
                      }
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
                        addDescriptionLine();
                        setShowAddLineOptions(false);
                      }}
                      className="block w-full border-t px-5 py-3 text-left font-bold hover:bg-blue-50"
                    >
                      Add Description
                    </button>
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                      <th className="py-4">Code</th>

                      <th>Description</th>

                      <th>Qty</th>

                      <th>Price Excl</th>

                      <th>VAT</th>

                      <th>Total Incl</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index} className="border-b border-gray-100">
                        {line.lineType === "description" ? (
                          <>
                            <td colSpan={4} className="py-3 pr-4">
                              <input
                                type="text"
                                value={line.description}
                                onChange={(event) =>
                                  updateLine(
                                    index,
                                    "description",
                                    event.target.value,
                                  )
                                }
                                placeholder="Description"
                                aria-label="Description line"
                                className="h-12 w-full rounded-xl border border-gray-200 px-4"
                              />
                            </td>
                            <td aria-hidden="true" />
                            <td aria-hidden="true" />
                          </>
                        ) : (
                          <>
                            <td className="py-4 font-black text-blue-600">
                              {line.code}
                            </td>

                            <td>{line.description}</td>

                            <td>
                              <input
                                type="number"
                                value={line.qty}
                                onChange={(e) =>
                                  updateLine(
                                    index,
                                    "qty",
                                    Number(e.target.value),
                                  )
                                }
                                className="
                                appearance-none
                                w-24
                                h-12
                                rounded-xl
                                border
                                border-gray-200
                                px-4
                              "
                              />
                            </td>

                            <td>
                              <input
                                type="number"
                                value={line.priceExcl}
                                onChange={(e) =>
                                  updateLine(
                                    index,
                                    "priceExcl",
                                    Number(e.target.value),
                                  )
                                }
                                className="
                                appearance-none
                                w-32
                                h-12
                                rounded-xl
                                border
                                border-gray-200
                                px-4
                              "
                              />
                            </td>

                            <td>R {line.vat.toFixed(2)}</td>

                            <td className="font-black">
                              R {line.totalIncl.toFixed(2)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* NOTES */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-4 xl:col-span-3 xl:ml-auto xl:w-[380px]">
              {/* REF */}
              <div className="hidden">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Reference Number
                </label>

                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />
              </div>

              {/* DATES */}
              <div className="hidden">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Purchase Date
                  </label>

                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="
                      w-full
                      h-14
                      rounded-2xl
                      border-2
                      border-gray-200
                      px-5
                    "
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Delivery Date
                  </label>

                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="
                      w-full
                      h-14
                      rounded-2xl
                      border-2
                      border-gray-200
                      px-5
                    "
                  />
                </div>
              </div>

              {/* EMPLOYEE */}
              <div className="hidden">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Employee
                </label>

                <input
                  type="text"
                  value={employee}
                  onChange={(e) => setEmployee(e.target.value)}
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />
              </div>

              {/* TOTALS */}
              <div
                className="
                bg-gray-50
                rounded-3xl
                border
                border-gray-200
                p-6
                space-y-4
              "
              >
                <div className="flex items-center justify-between">
                  <div className="text-gray-500 font-bold">
                    Subtotal Excl VAT
                  </div>

                  <div className="font-black">R {subtotal.toFixed(2)}</div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-gray-500 font-bold">VAT</div>

                  <div className="font-black">R {vatTotal.toFixed(2)}</div>
                </div>

                <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                  <div className="text-xl font-black text-gray-900">
                    Total Incl VAT
                  </div>

                  <div className="text-3xl font-black text-blue-600">
                    R {grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* SAVE */}
              {isEditing ? (
                <button
                  onClick={() => createPO(false)}
                  disabled={saving}
                  className="h-16 w-full rounded-3xl bg-blue-600 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : `Save ${documentLabel}`}
                </button>
              ) : isQuote ? (
                <button
                  onClick={() => createPO(false)}
                  disabled={saving}
                  className="h-16 w-full rounded-3xl bg-blue-600 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Creating..." : `Create ${documentLabel}`}
                </button>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCreateOptions((current) => !current)}
                    disabled={saving}
                    className="flex h-16 w-full items-center justify-center gap-3 rounded-3xl bg-blue-600 text-lg font-black text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create Purchase Order"}
                    {!saving && <span aria-hidden="true">▼</span>}
                  </button>

                  {showCreateOptions && !saving && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateOptions(false);
                          void createPO(false);
                        }}
                        className="w-full px-5 py-4 text-left hover:bg-blue-50"
                      >
                        <span className="block font-black text-gray-900">
                          Create Purchase Order
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Create the purchase order as a draft only.
                        </span>
                      </button>
                      {canApprovePurchaseOrders && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateOptions(false);
                            void createPO(true);
                          }}
                          className="w-full border-t border-gray-200 px-5 py-4 text-left hover:bg-indigo-50"
                        >
                          <span className="block font-black text-indigo-700">
                            Create &amp; Approve Purchase Order
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            Create the purchase order and move it directly to Open.
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {actionPanel && (
          <div className="fixed inset-0 z-[420] flex items-center justify-center bg-black/50 p-4">
            <section className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-center justify-between border-b p-6">
                <h2 className="text-2xl font-black capitalize">
                  Purchase Order {actionPanel}
                </h2>
                <button
                  type="button"
                  onClick={() => setActionPanel(null)}
                  className="rounded-xl border px-4 py-2 font-bold"
                >
                  Close
                </button>
              </header>
              {actionPanel === "comments" && (
                <div className="border-b p-5">
                  <textarea
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    data-enter-newline="true"
                    rows={3}
                    placeholder="Enter a comment..."
                    className="w-full rounded-xl border p-3"
                  />
                  <button
                    type="button"
                    onClick={() => void savePurchaseOrderComment()}
                    className="mt-3 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white"
                  >
                    Save Comment
                  </button>
                </div>
              )}
              {actionPanel === "attachments" && (
                <div className="border-b p-5">
                  <label className="block rounded-xl border border-dashed p-4 text-sm font-bold">
                    Attach Files
                    <input
                      type="file"
                      multiple
                      onChange={(event) =>
                        void uploadPurchaseOrderAttachments(event.target.files)
                      }
                      className="mt-2 block w-full"
                    />
                  </label>
                </div>
              )}
              <div className="overflow-y-auto p-5">
                {actionItems.length === 0 ? (
                  <p className="p-8 text-center font-bold text-gray-400">
                    No {actionPanel} recorded.
                  </p>
                ) : (
                  actionItems.map((item) => (
                    <article
                      key={item.id}
                      className={`${actionPanel === "messages" ? "mb-4 overflow-hidden rounded-xl border bg-slate-50 last:mb-0" : "border-b py-4 last:border-0"}`}
                    >
                      {actionPanel === "messages" ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMessageIds((current) =>
                                current.includes(item.id)
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              )
                            }
                            className="grid w-full grid-cols-[1fr_auto] gap-4 p-4 text-left hover:bg-slate-100"
                          >
                            <div className="grid min-w-0 gap-1 text-sm md:grid-cols-[70px_1fr]">
                              <span className="font-bold">To:</span>
                              <span className="truncate font-black">
                                {item.recipientName ||
                                  item.recipientEmail ||
                                  "Supplier"}
                                {item.recipientEmail
                                  ? `  [${item.recipientEmail}]`
                                  : ""}
                              </span>
                              <span className="font-bold">Subject:</span>
                              <span className="font-black">
                                {item.subject ||
                                  item.communicationName ||
                                  "Purchase Order message"}
                              </span>
                            </div>
                            <div className="flex items-start gap-3">
                              <span className="whitespace-nowrap text-xs font-bold text-gray-500">
                                {formatPurchaseOrderMessageDate(
                                  item.sentAt ||
                                  item.deliveredAt ||
                                  item.createdAt,
                                )}
                              </span>
                              <span
                                className={`rounded-md px-3 py-1 text-[10px] font-black uppercase ${["delivered", "sent", "completed"].includes(String(item.state || item.status).toLowerCase()) ? "bg-emerald-500 text-white" : String(item.state || item.status).toLowerCase() === "failed" ? "bg-red-500 text-white" : "bg-amber-100 text-amber-800"}`}
                              >
                                {item.state || item.status || "Pending"}
                              </span>
                              <span className="font-black">
                                {expandedMessageIds.includes(item.id)
                                  ? "⌃"
                                  : "⌄"}
                              </span>
                            </div>
                          </button>
                          {expandedMessageIds.includes(item.id) && (
                            <div className="border-t bg-white p-5">
                              <div
                                className="message-preview text-sm leading-6"
                                dangerouslySetInnerHTML={{
                                  __html: sanitizePurchaseOrderMessageHtml(
                                    item.body ||
                                    item.htmlBody ||
                                    item.message ||
                                    "<p>No message body was stored.</p>",
                                  ),
                                }}
                              />
                              {Array.isArray(item.attachments) &&
                                item.attachments.length > 0 && (
                                  <div className="mt-5 border-t pt-4">
                                    <p className="mb-2 text-xs font-black uppercase text-gray-400">
                                      Attachments
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {item.attachments.map(
                                        (attachment: any, index: number) => (
                                          <a
                                            key={attachment.url || index}
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
                                          >
                                            {attachment.name ||
                                              `Attachment ${index + 1}`}
                                          </a>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}
                        </>
                      ) : actionPanel === "comments" ? (
                        <>
                          <p className="whitespace-pre-wrap text-sm">
                            {item.comment}
                          </p>
                          <p className="mt-2 text-xs font-bold text-gray-400">
                            {item.createdByName || "User"}
                          </p>
                        </>
                      ) : actionPanel === "history" ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-black">
                              {String(item.action || "CHANGE").replaceAll(
                                "_",
                                " ",
                              )}
                            </p>
                            <span className="text-xs font-bold text-gray-400">
                              {formatPurchaseOrderMessageDate(item.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-700">
                            {item.details || "Purchase order updated."}
                          </p>
                          <p className="mt-2 text-xs font-bold text-blue-700">
                            {item.userName || "Unknown User"}
                            {item.status ? ` · ${item.status}` : ""}
                          </p>
                        </>
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-blue-700 hover:underline"
                        >
                          {item.name || "Attachment"}
                        </a>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        <JobItemPickerModal
          jobId={linkedJobId || ""}
          mode={jobItemPickerMode}
          onClose={() => setJobItemPickerMode(null)}
          onSelect={addJobItems}
        />
      </div>
    </div>
  );
}

function formatPurchaseOrderMessageDate(value: any) {
  const date =
    value?.toDate?.() ||
    (value instanceof Date ? value : value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-ZA", { hour12: false })
    : "Pending";
}

function sanitizePurchaseOrderMessageHtml(value: string) {
  if (typeof window === "undefined") return "";
  const parsed = new DOMParser().parseFromString(String(value), "text/html");
  parsed
    .querySelectorAll("script, iframe, object, embed, form")
    .forEach((element) => element.remove());
  parsed.querySelectorAll("*").forEach((element) =>
    Array.from(element.attributes).forEach((attribute) => {
      if (
        attribute.name.toLowerCase().startsWith("on") ||
        /^(javascript|data):/i.test(attribute.value.trim())
      )
        element.removeAttribute(attribute.name);
    }),
  );
  return parsed.body.innerHTML;
}
