export type InvoicePaymentStatus = "paid" | "partially_paid" | "unpaid" | "unknown";

export function invoicePaymentStatus(value: {
    status?: unknown;
    amountPaid?: unknown;
    amountDue?: unknown;
    grandTotal?: unknown;
    total?: unknown;
}): InvoicePaymentStatus {
    const status = String(value.status || "").toLowerCase();
    if (status === "paid" || status === "partially_paid" || status === "unpaid") return status;

    const total = Number(value.grandTotal ?? value.total ?? 0);
    const paid = Number(value.amountPaid ?? 0);
    const due = Number(value.amountDue ?? Math.max(0, total - paid));

    if (!Number.isFinite(total) || !Number.isFinite(paid) || !Number.isFinite(due)) return "unknown";
    if (due <= 0 && total > 0) return "paid";
    if (paid > 0) return "partially_paid";
    if (due >= 0) return "unpaid";
    return "unknown";
}

export function invoicePaymentStatusLabel(status: InvoicePaymentStatus): string {
    if (status === "paid") return "Paid";
    if (status === "partially_paid") return "Partially Paid";
    if (status === "unpaid") return "Unpaid";
    return "Not recorded";
}