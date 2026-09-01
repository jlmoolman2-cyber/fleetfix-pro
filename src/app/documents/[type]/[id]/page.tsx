"use client";

import Link from "next/link";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { documentLineColumns } from "@/components/admin/DocumentLineColumnSettings";

const documentConfig: Record<
  string,
  { collectionName: string; label: string; back: string }
> = {
  purchase_order: {
    collectionName: "purchase_orders",
    label: "Purchase Order",
    back: "/purchases",
  },
  quote: { collectionName: "quotes", label: "Quote", back: "/quotes" },
  invoice: { collectionName: "invoices", label: "Invoice", back: "/invoices" },
};

const value = (input: any) =>
  input === null || input === undefined || input === "" ? "—" : String(input);
const money = (input: any) => `R ${(Number(input) || 0).toFixed(2)}`;
const dateValue = (input: any) =>
  input?.toDate?.()?.toLocaleString?.("en-ZA") ||
  (input ? new Date(input).toLocaleString("en-ZA") : "—");

export default function BusinessDocumentPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = use(params);
  const searchParams = useSearchParams();
  const purchaseOrderTemplate =
    type === "purchase_order" && searchParams.get("template") === "supplier"
      ? "supplier"
      : "internal";
  const showLinkedJobDetails =
    type !== "purchase_order" || purchaseOrderTemplate === "internal";
  const config = documentConfig[type];
  const [documentData, setDocumentData] = useState<any>(null);
  const [company, setCompany] = useState<any>({});
  const [job, setJob] = useState<any>(null);
  const [party, setParty] = useState<any>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [lineColumnIds, setLineColumnIds] = useState<string[]>([
    "code",
    "description",
    "quantity",
    "priceExcl",
    "taxRate",
    "totalIncl",
  ]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!config) {
      setLoading(false);
      return;
    }
    Promise.all([
      getDoc(doc(clientDb, "companies", COMPANY_ID, config.collectionName, id)),
      getDoc(doc(clientDb, "companies", COMPANY_ID)),
      getDocs(
        collection(clientDb, "companies", COMPANY_ID, config.collectionName),
      ),
      getDoc(doc(clientDb, "companies", COMPANY_ID, "documentSettings", type)),
      getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          config.collectionName,
          id,
          "payments",
        ),
      ),
    ])
      .then(
        async ([
          documentSnapshot,
          companySnapshot,
          documentsSnapshot,
          settingsSnapshot,
          paymentsSnapshot,
        ]) => {
          if (!documentSnapshot.exists()) return;
          const data = {
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          } as any;
          setDocumentData(data);
          const documentIndex = documentsSnapshot.docs.findIndex(
            (snapshot) => snapshot.id === id,
          );
          if (documentIndex >= 0) {
            const prefix =
              type === "purchase_order"
                ? "PO"
                : type === "quote"
                  ? "QT"
                  : "INV";
            setDocumentNumber(
              `${prefix}${String(documentIndex + 1).padStart(6, "0")}`,
            );
          }
          if (companySnapshot.exists()) setCompany(companySnapshot.data());
          if (settingsSnapshot.exists()) {
            const settings = settingsSnapshot.data();
            if (Array.isArray(settings.printLineColumns))
              setLineColumnIds(settings.printLineColumns);
            else if (Array.isArray(settings.lineColumns))
              setLineColumnIds(settings.lineColumns);
          }
          setPayments(
            paymentsSnapshot.docs.map((snapshot) => ({
              id: snapshot.id,
              ...snapshot.data(),
            })),
          );
          if (data.jobId) {
            const jobSnapshot = await getDoc(
              doc(clientDb, "companies", COMPANY_ID, "jobs", data.jobId),
            );
            if (jobSnapshot.exists())
              setJob({ id: jobSnapshot.id, ...jobSnapshot.data() });
          }
          const partyCollection =
            type === "purchase_order" ? "suppliers" : "customers";
          const partyId =
            type === "purchase_order" ? data.supplierId : data.customerId;
          if (partyId) {
            const partySnapshot = await getDoc(
              doc(clientDb, "companies", COMPANY_ID, partyCollection, partyId),
            );
            if (partySnapshot.exists())
              setParty({ id: partySnapshot.id, ...partySnapshot.data() });
          }
        },
      )
      .finally(() => setLoading(false));
  }, [config, id, type]);

  useEffect(() => {
    if (
      !loading &&
      new URLSearchParams(window.location.search).get("print") === "1"
    ) {
      window.setTimeout(() => window.print(), 300);
    }
  }, [loading]);

  if (loading) return <main className="p-8">Loading document…</main>;
  if (!config || !documentData)
    return <main className="p-8">Document not found.</main>;

  const number =
    documentNumber ||
    documentData.purchaseOrderNumber ||
    documentData.quoteNumber ||
    documentData.invoiceNumber ||
    `${type === "purchase_order" ? "PO" : type === "quote" ? "QT" : "INV"}-${id.slice(0, 8).toUpperCase()}`;
  const lines = Array.isArray(documentData.lines) ? documentData.lines : [];
  const showLineColumn = (columnId: string) => lineColumnIds.includes(columnId);
  const printColumns = documentLineColumns.filter((column) =>
    showLineColumn(column.id),
  );
  const numericColumnIds = ["quantity", "cost", "markup", "priceExcl", "priceIncl", "discount", "taxRate", "profit", "totalExcl", "totalIncl"];
  const fixedColumnWidth = printColumns.reduce((width, column) => width + (column.id === "description" ? 34 : column.id === "code" ? 13 : column.id === "quantity" ? 8 : 0), 0);
  const flexibleColumnCount = printColumns.filter((column) => !["description", "code", "quantity"].includes(column.id)).length;
  const printColumnWidth = (columnId: string) => columnId === "description"
    ? "34%"
    : columnId === "code"
      ? "13%"
      : columnId === "quantity"
        ? "8%"
        : `${Math.max(4, (100 - fixedColumnWidth) / Math.max(1, flexibleColumnCount))}%`;
  const calculated = lines.map((line: any) => {
    const quantity = Math.min(10000, Math.max(0, Number(line.quantity ?? line.qty ?? 0)));
    const taxRate = Math.min(15, Math.max(0, Number(line.taxRate ?? 15)));
    const priceIncl = Math.min(999999.99, Math.max(0, Number(line.priceIncl ?? line.totalIncl ?? 0)));
    const unitExcl = Number(
      line.priceExcl ??
        line.priceExclVat ??
        line.price ??
        priceIncl / (1 + taxRate / 100),
    );
    const discount = Math.min(99.99, Math.max(0, Number(line.discount ?? 0)));
    const totalExcl = Math.min(999999.99, Number(
      line.totalExcl ?? unitExcl * quantity * (1 - discount / 100),
    ));
    const totalIncl = Math.min(999999.99, Number(
      line.lineTotalIncl ?? line.totalIncl ?? totalExcl * (1 + taxRate / 100),
    ));
    const lineType =
      line.lineType ||
      line.type ||
      (line.isDescription === true ? "description" : "") ||
      (!line.inventoryId &&
      !line.code &&
      !Number(line.cost) &&
      !Number(line.priceExcl) &&
      !Number(line.priceIncl)
        ? "description"
        : "item");
    return {
      ...line,
      quantity,
      taxRate,
      unitExcl,
      totalExcl,
      totalIncl,
      lineType,
    };
  });
  const subtotal = Number(
    documentData.subtotal ??
      calculated.reduce((sum: number, line: any) => sum + line.totalExcl, 0),
  );
  const total = Number(
    documentData.grandTotal ??
      documentData.total ??
      calculated.reduce((sum: number, line: any) => sum + line.totalIncl, 0),
  );
  const vat = Number(
    documentData.vatTotal ?? documentData.vat ?? total - subtotal,
  );
  const partyName =
    type === "purchase_order"
      ? documentData.supplier || party?.supplierName || "Supplier"
      : documentData.customerName ||
        party?.companyName ||
        party?.customerName ||
        "Customer";
  const partyAddress = [
    party?.physicalAddress,
    party?.address,
    party?.billingAddress,
    party?.postalAddress,
    documentData.deliveryAddress,
  ]
    .filter(
      (entry, index, entries) => entry && entries.indexOf(entry) === index,
    )
    .join("\n");

  return (
    <main className="business-document-page bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-between rounded-xl bg-white p-3 shadow print:hidden">
        <Link
          href={config.back}
          className="rounded-lg border px-4 py-2 font-bold"
        >
          ← Back
        </Link>
        <div className="flex flex-wrap gap-2">
          {type === "purchase_order" && (
            <>
              <Link
                href={`/documents/purchase_order/${id}?template=internal`}
                className={`rounded-lg border px-4 py-2 font-bold ${purchaseOrderTemplate === "internal" ? "border-blue-500 bg-blue-500 !text-white" : "border-slate-300 bg-white !text-slate-900"}`}
              >
                Internal Template
              </Link>
              <Link
                href={`/documents/purchase_order/${id}?template=supplier`}
                className={`rounded-lg border px-4 py-2 font-bold ${purchaseOrderTemplate === "supplier" ? "border-blue-500 bg-blue-500 !text-white" : "border-slate-300 bg-white !text-slate-900"}`}
              >
                Supplier Template
              </Link>
            </>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
      <article className="job-card-a4 mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-[8mm] text-slate-900 shadow print:shadow-none">
        <header className="flex items-start justify-between gap-5 border-b-2 border-[#164e7a] pb-4">
          <div className="flex min-w-0 items-start gap-4">
            {company.logo && (
              <img
                src={company.logo}
                alt="Company logo"
                className="h-16 w-20 object-contain"
              />
            )}
            <div>
              <h1 className="text-xl font-black text-[#164e7a]">
                {company.companyName || "FleetFix Pro - NVTS"}
              </h1>
              <div className="mt-1 max-w-[390px] whitespace-pre-line text-[8px] text-slate-500">
                {[
                  company.physicalAddress,
                  company.telephone,
                  company.email,
                  company.website,
                  company.vatNumber ? `VAT: ${company.vatNumber}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black">{config.label}</div>
            <div className="text-sm font-black text-blue-600">{number}</div>
          </div>
        </header>

        <Section
          title={
            type === "purchase_order"
              ? "Supplier Details"
              : "Customer and Contact Details"
          }
        >
          <div className="grid grid-cols-2 grid-rows-[auto_40px_40px_auto]">
            <Cell
              label={type === "purchase_order" ? "Supplier" : "Customer"}
              text={partyName}
              valueClassName="text-[11px] font-bold"
              cellClassName="col-start-1 row-start-1"
            />
            <Cell
              label="Telephone"
              text={
                documentData.customerContactTelephone ||
                party?.contactNumber ||
                party?.telephone ||
                party?.phone ||
                job?.customerContactNumber
              }
              valueClassName="text-[11px] font-normal"
              cellClassName="col-start-2 row-start-1"
            />
            <Cell
              label={`${type === "purchase_order" ? "Supplier" : "Customer"} Address`}
              text={partyAddress}
              valueClassName="text-[11px] font-normal leading-tight"
              cellClassName="col-start-1 row-start-2 row-span-2"
            />
            <Cell
              label="Email"
              text={
                documentData.customerContactEmail ||
                party?.email ||
                party?.contactEmail ||
                job?.customerContactEmail
              }
              valueClassName="text-[11px] font-normal"
              cellClassName="col-start-2 row-start-2"
            />
            <div
              className="col-start-2 row-start-3 border-r border-t border-slate-300"
              aria-hidden="true"
            />
            <Cell
              label="VAT Number"
              text={party?.vatNumber}
              valueClassName="text-[11px] font-normal"
              cellClassName="col-start-1 row-start-4"
            />
            <Cell
              label="Reference"
              text={documentData.referenceNumber}
              valueClassName="text-[11px] font-normal"
              cellClassName="col-start-2 row-start-4"
            />
          </div>
        </Section>
        <section
          className={`mt-2 grid ${showLinkedJobDetails ? "grid-cols-3" : "grid-cols-2"} overflow-hidden rounded-md border border-slate-400 text-[8px]`}
        >
          <CompactCell label="Status" text={documentData.status || "Draft"} />
          <CompactCell
            label="Created"
            text={dateValue(
              documentData.createdAt || documentData.purchaseDate,
            )}
          />
          {showLinkedJobDetails && (
            <CompactCell
              label="Linked Job"
              text={job?.jobNumber || documentData.jobNumber || "Not linked"}
            />
          )}
        </section>
        {showLinkedJobDetails && job && (
          <Section title="Linked Job Details">
            <div className="grid grid-cols-4 text-[8px]">
              <CompactCell label="Job Number" text={job.jobNumber || job.id} />
              <CompactCell label="Customer" text={job.customerName} />
              <CompactCell
                label="Vehicle"
                text={[job.vehicleRegNo, job.vehicleFleetNo]
                  .filter(Boolean)
                  .join(" / ")}
              />
              <CompactCell
                label="Location"
                text={
                  typeof job.location === "object"
                    ? job.location?.name
                    : job.location
                }
              />
            </div>
          </Section>
        )}
        <Section title={`${config.label} Items`}>
          <div className="overflow-hidden">
            <table className="w-full table-fixed border-collapse text-[8px]">
              <thead>
                <tr className="bg-slate-200 uppercase">
                  {printColumns.map((column) => (
                    <th
                      key={column.id}
                      style={{ width: printColumnWidth(column.id) }}
                      className={`px-1.5 py-2 ${numericColumnIds.includes(column.id) ? "whitespace-nowrap text-right tabular-nums" : "text-left"}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calculated.map((line: any, index: number) => (
                  <tr
                    key={line.id || index}
                    className="border-t border-slate-300"
                  >
                    {line.lineType === "description" ? (
                      <>
                        <td
                          colSpan={Math.min(4, printColumns.length)}
                          className="p-2 font-medium"
                        >
                          {value(line.description)}
                        </td>
                        {Array.from(
                          {
                            length: Math.max(
                              0,
                              printColumns.length -
                                Math.min(4, printColumns.length),
                            ),
                          },
                          (_, blankIndex) => (
                            <td key={blankIndex} aria-hidden="true" />
                          ),
                        )}
                      </>
                    ) : (
                      printColumns.map((column) => (
                        <td
                          key={column.id}
                          className={`px-1.5 py-2 ${numericColumnIds.includes(column.id) ? "whitespace-nowrap text-right tabular-nums" : ""} ${column.id === "description" ? "whitespace-normal break-words" : ""} ${column.id === "code" ? "font-bold text-[#164e7a]" : ""}`}
                        >
                          {column.id === "code" ? (
                            value(line.code || line.partNumber)
                          ) : column.id === "description" ? (
                            <>
                              <span>
                                {value(line.description)}
                                {type === "quote" && line.stockWarning ? " **" : ""}
                              </span>
                              {type === "quote" && line.stockWarning && (
                                <strong className="mt-1 block text-[7px] font-black text-red-700">
                                  ** {line.stockWarning}
                                </strong>
                              )}
                            </>
                          ) : column.id === "quantity" ? (
                            line.quantity
                          ) : column.id === "cost" ? (
                            money(line.cost)
                          ) : column.id === "markup" ? (
                            `${Number(line.markup || 0).toFixed(2)}%`
                          ) : column.id === "priceExcl" ? (
                            money(line.unitExcl)
                          ) : column.id === "priceIncl" ? (
                            money(line.priceIncl)
                          ) : column.id === "discount" ? (
                            `${Number(line.discount || 0).toFixed(2)}%`
                          ) : column.id === "taxRate" ? (
                            `${line.taxRate}%`
                          ) : column.id === "profit" ? (
                            money(
                              line.totalExcl -
                                Number(line.cost || 0) * line.quantity,
                            )
                          ) : column.id === "totalExcl" ? (
                            money(line.totalExcl)
                          ) : (
                            money(line.totalIncl)
                          )}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <div className="mt-3 grid grid-cols-[1fr_220px] gap-4">
          <Section title="Notes">
            <div className="min-h-24 whitespace-pre-wrap p-3 text-[9px]">
              {documentData.notes || "No notes recorded."}
            </div>
          </Section>
          <Section title="Document Summary">
            <div className="p-3 text-[9px]">
              <Summary label="Subtotal Excl VAT" amount={subtotal} />
              <Summary label="VAT" amount={vat} />
              <div className="mt-2 flex justify-between border-t-2 border-[#164e7a] pt-2 text-sm font-black">
                <span>Total Incl VAT</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </Section>
        </div>
        {type === "quote" && documentData.approved && (
          <Section title="Quote Acceptance">
            <div className="grid grid-cols-2 gap-5 p-4 text-[9px]">
              <div>
                <p className="text-[7px] font-black uppercase text-slate-500">
                  Approved By
                </p>
                <p className="mt-1 text-sm font-black">
                  {documentData.customerApprovedByName ||
                    documentData.approvedByName ||
                    "Authorized user"}
                </p>
                <p className="mt-1 text-slate-500">
                  {dateValue(
                    documentData.customerApprovedAt || documentData.approvedAt,
                  )}
                </p>
              </div>
              <div>
                {documentData.customerApprovalSignature ? (
                  <img
                    src={documentData.customerApprovalSignature}
                    alt="Customer approval signature"
                    className="h-20 w-full object-contain"
                  />
                ) : (
                  <p className="border-b border-slate-500 pb-2 text-right">
                    Internally approved
                  </p>
                )}
              </div>
            </div>
          </Section>
        )}
        <footer className="mt-6 border-t pt-2 text-right text-[8px] text-slate-400">
          {config.label} {number} · Generated{" "}
          {new Date().toLocaleString("en-ZA")}
        </footer>
      </article>
      {type === "invoice" &&
        payments.map((payment, index) => (
          <article
            key={payment.id}
            className="job-card-a4 job-card-page-break mx-auto mt-6 min-h-[297mm] w-full max-w-[210mm] bg-white p-[12mm] text-slate-900 shadow print:mt-0 print:shadow-none"
          >
            <header className="flex items-start justify-between border-b-2 border-[#164e7a] pb-5">
              <div>
                {company.logo && (
                  <img
                    src={company.logo}
                    alt="Company logo"
                    className="mb-3 h-14 w-20 object-contain"
                  />
                )}
                <h1 className="text-xl font-black text-[#164e7a]">
                  {company.companyName || "FleetFix Pro - NVTS"}
                </h1>
                <p className="mt-1 text-[9px] text-slate-500">
                  {[company.physicalAddress, company.telephone, company.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black">PAYMENT RECEIPT</h2>
                <p className="mt-1 font-mono text-sm font-bold">
                  {payment.receiptNumber ||
                    `RCT-${payment.id.slice(0, 8).toUpperCase()}`}
                </p>
              </div>
            </header>
            <section className="mt-8 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-300">
              <ReceiptCell label="Received From" text={partyName} />
              <ReceiptCell label="Invoice Number" text={number} />
              <ReceiptCell label="Date Received" text={payment.dateReceived} />
              <ReceiptCell label="Reference" text={payment.reference} />
              <ReceiptCell
                label="Description"
                text={payment.description || "Invoice payment"}
                wide
              />
              <ReceiptCell
                label="Receipt"
                text={`${index + 1} of ${payments.length}`}
              />
            </section>
            <div className="mt-10 rounded-2xl bg-[#164e7a] p-8 text-white">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">
                Amount Received
              </p>
              <p className="mt-3 text-4xl font-black">
                {money(payment.amount)}
              </p>
            </div>
            <section className="mt-10 grid grid-cols-2 gap-8 text-sm">
              <div>
                <p className="font-black uppercase text-slate-500">
                  Invoice Total
                </p>
                <p className="mt-2 text-xl font-bold">{money(total)}</p>
              </div>
              <div>
                <p className="font-black uppercase text-slate-500">
                  Payment Recorded By
                </p>
                <p className="mt-2 text-xl font-bold">
                  {payment.createdByName || "FleetFix User"}
                </p>
              </div>
            </section>
            <div className="mt-24 grid grid-cols-2 gap-16 text-xs">
              <div className="border-t border-slate-500 pt-2">
                Customer signature
              </div>
              <div className="border-t border-slate-500 pt-2">
                Authorised signature
              </div>
            </div>
            <footer className="mt-16 border-t pt-3 text-right text-[9px] text-slate-400">
              Receipt for Invoice {number}
            </footer>
          </article>
        ))}
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-slate-400">
      <h2 className="bg-[#164e7a] px-3 py-2 text-[9px] font-black uppercase tracking-wide text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Cell({
  label,
  text,
  compact = false,
  valueClassName = "",
  cellClassName = "",
}: {
  label: string;
  text: any;
  compact?: boolean;
  valueClassName?: string;
  cellClassName?: string;
}) {
  return (
    <div
      className={`${valueClassName ? "min-h-10 px-2 py-1.5" : "min-h-12 p-2"} ${cellClassName} overflow-hidden border-r border-t border-slate-300`}
    >
      <div className="text-[7px] font-black uppercase text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 whitespace-pre-wrap break-words ${valueClassName || `font-bold ${compact ? "text-[7px] leading-tight" : ""}`}`}
      >
        {value(text)}
      </div>
    </div>
  );
}
function CompactCell({ label, text }: { label: string; text: any }) {
  return (
    <div className="border-r border-slate-300 px-2 py-1.5 last:border-r-0">
      <div className="text-[6px] font-black uppercase text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 break-words font-bold">{value(text)}</div>
    </div>
  );
}
function Summary({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between border-b py-2">
      <span>{label}</span>
      <strong>{money(amount)}</strong>
    </div>
  );
}
function ReceiptCell({
  label,
  text,
  wide = false,
}: {
  label: string;
  text: any;
  wide?: boolean;
}) {
  return (
    <div
      className={`${wide ? "col-span-1" : ""} min-h-20 border-b border-r border-slate-300 p-4`}
    >
      <p className="text-[9px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-bold">
        {value(text)}
      </p>
    </div>
  );
}
