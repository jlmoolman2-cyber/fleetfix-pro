"use client";

import ModuleSearchField from "@/components/ModuleSearchField";

import Link from "next/link";
import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";

import {
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import PageHeader from "@/app/components/PageHeader";
import UserAvatar, { userDisplayName } from "@/components/shared/UserAvatar";

interface PurchaseOrder {

  id: string;

  supplier?: string;

  referenceNumber?: string;

  employee?: string;

  status?: string;

  grandTotal: number;

  createdAt?: any;

  updatedBy?: string;

  userName?: string;

  jobNumber?: string;

  itemRef?: string;

  totalQty: number;
  documentNumber?: string;
}

type DocumentType = "purchase_order" | "quote" | "invoice" | "query";
type ColumnKey = "number" | "party" | "reference" | "status" | "total" | "job" | "user" | "created";

const documentConfig: Record<DocumentType, { title: string; singular: string; code: string; collectionName: string; addHref: string }> = {
  purchase_order: { title: "Purchases", singular: "Purchase Order", code: "PO", collectionName: "purchase_orders", addHref: "/purchase-orders" },
  quote: { title: "Quotes", singular: "Quote", code: "QT", collectionName: "quotes", addHref: "/quotes/new" },
  invoice: { title: "Invoices", singular: "Invoice", code: "INV", collectionName: "invoices", addHref: "/invoices/new" },
  query: { title: "Queries", singular: "Query", code: "QRY", collectionName: "queries", addHref: "/queries/new" },
};

const statusLabel = (status: unknown) => String(status || "-")
  .toLowerCase()
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export default function PurchaseOrderListPage({
  documentType = "purchase_order",
}: {
  documentType?: DocumentType;
}) {

  const config = documentConfig[documentType];

  const [purchaseOrders, setPurchaseOrders] =
    useState<PurchaseOrder[]>([]);
  const [userProfiles, setUserProfiles] = useState<any[]>([]);

  const [search, setSearch] =
    useState("");

  const [activeTab, setActiveTab] =
    useState("all");

  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([
    "number", "party", "reference", "status", "total", "job", "user", "created",
  ]);
  const [sort, setSort] = useState<{ key: ColumnKey; direction: "asc" | "desc" }>({ key: "created", direction: "desc" });
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ColumnKey, number>>>({});

  function moveColumn(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= columnOrder.length) return;
    const next = [...columnOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setColumnOrder(next);
  }

  const columnLabels: Record<ColumnKey, string> = {
    number: `${config.singular} Number`,
    party: documentType === "purchase_order" ? "Supplier" : "Customer",
    reference: "Reference",
    status: "Status",
    total: "Total Incl",
    job: "Linked Job",
    user: "User",
    created: "Created Date",
  };

  function renderCell(column: ColumnKey, po: PurchaseOrder, index: number) {
    switch (column) {
      case "number": return <span className="font-black text-blue-600">{po.documentNumber || `${config.code}${String(index + 1).padStart(6, "0")}`}</span>;
      case "party": return documentType === "purchase_order" ? po.supplier || "-" : (po as any).customerName || po.supplier || "-";
      case "reference": return po.referenceNumber || "-";
      case "status": return statusLabel(documentType === "purchase_order"
        ? (po as any).receiptStatus === "fully_received" || (po as any).fullyReceived === true
          ? "Closed - Fully Received"
          : (po as any).receiptStatus === "partial_received" || (po as any).partiallyReceived === true || Number((po as any).receivedQty || 0) > 0
            ? "Open - Partially Received"
            : po.status || "-"
        : po.status || "-");
      case "total": return `R ${po.grandTotal.toFixed(2)}`;
      case "job": return po.jobNumber || "-";
      case "user": {
        const name = (po as any).lastChangedByName || (po as any).updatedByName || (po as any).createdByName || po.userName || po.employee || "User";
        const id = (po as any).lastChangedById || (po as any).updatedById || (po as any).createdById || (po as any).userId || "";
        const profile = userProfiles.find((user) => user.id === id) || userProfiles.find((user) => userDisplayName(user).toLowerCase() === String(name).toLowerCase()) || name;
        return <UserAvatar user={profile} />;
      }
      case "created": return po.createdAt?.toDate?.()?.toLocaleString?.() || "-";
    }
  }

  function sortValue(column: ColumnKey, po: PurchaseOrder) {
    if (column === "number") return po.documentNumber || "";
    if (column === "party") return documentType === "purchase_order" ? po.supplier || "" : (po as any).customerName || po.supplier || "";
    if (column === "reference") return po.referenceNumber || "";
    if (column === "status") return po.status || "";
    if (column === "total") return po.grandTotal || 0;
    if (column === "job") return po.jobNumber || "";
    if (column === "user") return (po as any).lastChangedByName || (po as any).createdByName || po.userName || po.employee || "";
    return po.createdAt?.seconds || po.createdAt?.toMillis?.() || 0;
  }

  function startColumnResize(event: React.MouseEvent, column: ColumnKey) {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX; const startWidth = columnWidths[column] || 180;
    const move = (moveEvent: MouseEvent) => setColumnWidths((current) => ({ ...current, [column]: Math.max(90, startWidth + moveEvent.clientX - startX) }));
    const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
  }

  useEffect(() => {

    Promise.all([
      getDocs(collection(clientDb, "users")),
      getDocs(collection(clientDb, "companies", "comp_001", "users")),
    ]).then(([globalUsers, companyUsers]) => {
      const profiles = new Map<string, any>();
      globalUsers.docs.forEach((entry) => profiles.set(entry.id, { id: entry.id, ...entry.data() }));
      companyUsers.docs.forEach((entry) => profiles.set(entry.id, { ...profiles.get(entry.id), id: entry.id, ...entry.data() }));
      setUserProfiles([...profiles.values()]);
    }).catch((error) => console.error("Unable to load user avatar colours", error));

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        "comp_001",
        config.collectionName
      ),

      (snapshot) => {

        setPurchaseOrders(

          snapshot.docs.map((doc, index) => {

            const data =
              doc.data();

            const rawStatus = String(data.status || "draft").toLowerCase();
            const normalizedStatus = documentType === "query"
              ? rawStatus
              : data.fullyReceived === true || data.fullyInvoiced === true || data.received === true || rawStatus === "closed"
              ? "closed"
              : data.approved === true || rawStatus === "open" || rawStatus === "approved"
                ? "open"
                : "draft";

            return {

              id: doc.id,

              ...data,

              documentNumber: data.purchaseOrderNumber || data.quoteNumber || data.invoiceNumber || `${config.code}${String(index + 1).padStart(6, "0")}`,

              status: normalizedStatus,

              grandTotal:
                Number(
                  data.grandTotal || data.total || 0
                ),

              totalQty:

                data.lines?.reduce(
                  (
                    sum: number,
                    line: any
                  ) =>

                    sum +
                    Number(
                      line.qty || 0
                    ),

                  0
                ) || 0,

              itemRef:
                data.lines?.[0]
                  ?.code || "",

              userName:
                data.userName ||
                data.createdByName ||
                data.employee ||
                data.updatedBy ||
                "-",

              jobNumber:
                data.jobNumber || "",
            };
          })
        );
      }
    );

    return () => unsub();

  }, [config.collectionName]);

  const filteredPOs =
    useMemo(() => {

      return purchaseOrders.filter(
        (po) => {

          const searchTerm = search.trim().toLowerCase();
          const searchableText = [
            po.supplier,
            (po as any).customerName,
            po.referenceNumber,
            po.employee,
            po.userName,
            po.jobNumber,
            (po as any).quoteNumber,
            (po as any).invoiceNumber,
            (po as any).purchaseOrderNumber,
            po.documentNumber,
            po.id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const matchesSearch = !searchTerm || searchableText.includes(searchTerm);

          if (
            activeTab === "all"
          ) {
            return matchesSearch;
          }

          return (
            matchesSearch &&
            po.status === activeTab
          );
        }
      );

    }, [
      purchaseOrders,
      search,
      activeTab,
    ]);

  const sortedPOs = useMemo(() => [...filteredPOs].sort((left, right) => {
    const leftValue = sortValue(sort.key, left);
    const rightValue = sortValue(sort.key, right);
    const result = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  }), [filteredPOs, sort]);

  const openCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "open"
    ).length;

  const draftCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "draft"
    ).length;

  const closedCount =

    purchaseOrders.filter(
      (x) =>
        x.status ===
        "closed"
    ).length;

  return (

    <div className="module-list-page bg-[#f5f7fb]">

      <div className="module-list-content relative p-6">

        <PageHeader title={config.title} subtitle={config.title.toUpperCase()} />

        <div className="module-list-content w-full">

          {/* MESSAGES */}
          <div className="
            flex
            items-center
            justify-between
            mb-3
            md:absolute
            md:right-6
            md:top-6
            md:mb-0
          ">

            <div />

            <div className="
              flex
              items-center
              gap-3
            ">

              {documentType === "purchase_order" && <Link
                href="/suppliers"
                className="
                  bg-gray-200
                  hover:bg-gray-300
                  text-gray-900
                  px-6
                  h-11
                  rounded-2xl
                  inline-flex
                  flex-col
                  items-center
                  justify-center
                  font-black
                  text-sm
                  leading-tight
                "
              >
                Suppliers
              </Link>}

              <Link
                href={config.addHref}
                className="
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  px-6
                  h-11
                  rounded-2xl
                  inline-flex
                  flex-col
                  items-center
                  justify-center
                  font-black
                  text-sm
                  text-center
                  leading-tight
                "
              >
                <span>+ Add</span>
                <span>{config.singular}</span>
              </Link>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColumnSettings((open) => !open)}
                  aria-label="Change column order"
                  title="Change column order"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-200 text-gray-900 hover:bg-gray-300"
                >
                  <Columns3 className="h-5 w-5" />
                </button>

                {showColumnSettings && (
                  <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
                    <p className="mb-3 text-sm font-black text-gray-900">Column order</p>
                    <div className="space-y-2">
                      {columnOrder.map((column, index) => (
                        <div key={column} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold">
                          <span>{columnLabels[column]}</span>
                          <span className="flex gap-1">
                            <button type="button" onClick={() => moveColumn(index, -1)} disabled={index === 0} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30" aria-label={`Move ${columnLabels[column]} left`}><ChevronUp className="h-4 w-4" /></button>
                            <button type="button" onClick={() => moveColumn(index, 1)} disabled={index === columnOrder.length - 1} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30" aria-label={`Move ${columnLabels[column]} right`}><ChevronDown className="h-4 w-4" /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* CARD */}
          <div className="
            module-list-panel
            bg-white
            border
            border-gray-200
            rounded-3xl
            shadow-sm
            overflow-hidden
          ">

            {/* TABS */}
            <div className="
              grid
              grid-cols-4
              border-b
              border-gray-200
            ">

              <button
                onClick={() =>
                  setActiveTab(
                    "all"
                  )
                }
                className={`
                  h-12
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "all"

                    ? "border-blue-600 text-blue-600 bg-blue-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                All (
                {
                  purchaseOrders.length
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "draft"
                  )
                }
                className={`
                  h-12
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "draft"

                    ? "border-orange-600 text-orange-600 bg-orange-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Draft (
                {
                  draftCount
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "open"
                  )
                }
                className={`
                  h-12
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "open"

                    ? "border-green-600 text-green-600 bg-green-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Open (
                {
                  openCount
                }
                )
              </button>

              <button
                onClick={() =>
                  setActiveTab(
                    "closed"
                  )
                }
                className={`
                  h-12
                  font-black
                  text-sm
                  border-b-2

                  ${activeTab ===
                    "closed"

                    ? "border-purple-600 text-purple-600 bg-purple-50"

                    : "border-transparent text-gray-500"
                  }
                `}
              >
                Closed (
                {
                  closedCount
                }
                )
              </button>

            </div>

            {/* SEARCH */}
            <div className={`
              p-3
              border-b
              border-gray-200
              md:absolute
              ${documentType === "purchase_order" ? "md:right-[405px]" : "md:right-[220px]"}
              md:top-6
              md:w-[420px]
              md:border-0
              md:p-0
            `}>

              <ModuleSearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${config.title.toLowerCase()} by number, ${documentType === "purchase_order" ? "supplier" : "customer"}, reference, job or user...`}
                className="w-full"
              />

            </div>

            {/* TABLE */}
            <div className="module-list-scroll">

              <table className="w-full table-fixed text-xs">

                <colgroup>{columnOrder.map((column) => <col key={column} style={{ width: columnWidths[column] || 180 }} />)}</colgroup>

                <thead>

                  <tr className="
                    border-b
                    border-gray-200
                    text-left
                    text-[10px]
                    uppercase
                    tracking-wider
                    text-gray-500
                    bg-gray-50
                  ">

                    {columnOrder.map((column) => (
                      <th key={column} className="relative px-4 py-2">
                        <button type="button" onClick={() => setSort((current) => ({ key: column, direction: current.key === column && current.direction === "asc" ? "desc" : "asc" }))} className="inline-flex max-w-full items-center gap-1 hover:text-blue-700"><span className="truncate">{columnLabels[column]}</span><span>{sort.key === column ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span></button>
                        <span onMouseDown={(event) => startColumnResize(event, column)} className="absolute right-0 top-0 h-full w-3 cursor-col-resize border-r-2 border-transparent hover:border-blue-500" title="Drag to resize column" />
                      </th>
                    ))}

                  </tr>

                </thead>

                <tbody>

                  {sortedPOs.map(
                    (po, index) => (

                      <tr
                        key={po.id}

                        onClick={() => {
                          const detailPath = documentType === "purchase_order"
                            ? `/purchase-orders/${po.id}`
                            : documentType === "quote"
                              ? `/quotes/${po.id}`
                              : documentType === "invoice"
                                ? `/invoices/${po.id}`
                                : `/queries?documentId=${po.id}`;
                          window.location.href = detailPath;
                        }}

                        className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                        "
                      >

                        {columnOrder.map((column) => (
                          <td key={column} className="truncate px-4 py-2">
                            {renderCell(column, po, index)}
                          </td>
                        ))}

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
