import assert from "node:assert/strict";
import test from "node:test";
import { invoicePaymentStatus, invoicePaymentStatusLabel } from "../src/lib/invoicePaymentStatus.ts";
import { readFileSync } from "node:fs";

const listSource = readFileSync(new URL("../src/app/purchase-orders/list/page.tsx", import.meta.url), "utf8");

test("canonical invoice payment statuses retain their existing values", () => {
    assert.equal(invoicePaymentStatus({ status: "paid" }), "paid");
    assert.equal(invoicePaymentStatus({ status: "partially_paid" }), "partially_paid");
    assert.equal(invoicePaymentStatus({ status: "unpaid" }), "unpaid");
    assert.equal(invoicePaymentStatusLabel("paid"), "Paid");
    assert.equal(invoicePaymentStatusLabel("partially_paid"), "Partially Paid");
    assert.equal(invoicePaymentStatusLabel("unpaid"), "Unpaid");
});

test("legacy invoice records derive status from payment amounts safely", () => {
    assert.equal(invoicePaymentStatus({ grandTotal: 100, amountPaid: 100, amountDue: 0 }), "paid");
    assert.equal(invoicePaymentStatus({ grandTotal: 100, amountPaid: 25, amountDue: 75 }), "partially_paid");
    assert.equal(invoicePaymentStatus({ grandTotal: 100, amountPaid: 0, amountDue: 100 }), "unpaid");
    assert.equal(invoicePaymentStatus({ status: "unexpected", grandTotal: "invalid" }), "unknown");
    assert.equal(invoicePaymentStatusLabel("unknown"), "Not recorded");
});

test("payment status is invoice-only in the shared list", () => {
    assert.match(listSource, /documentType === "invoice"/);
    assert.match(listSource, /paymentStatus: "Payment Status"/);
    assert.match(listSource, /case "paymentStatus": return invoicePaymentStatusLabel\(invoicePaymentStatus\(po\)\)/);
    assert.doesNotMatch(listSource, /documentType === "purchase_order"[^\n]*paymentStatus/);
    assert.doesNotMatch(listSource, /documentType === "quote"[^\n]*paymentStatus/);
    assert.doesNotMatch(listSource, /documentType === "query"[^\n]*paymentStatus/);
});

test("invoice-only column addition preserves the normal list columns", () => {
    assert.match(
        listSource,
        /"number", "party", "reference", "status", \.\.\.\(documentType === "invoice" \? \["paymentStatus" as const\] : \[\]\), "total", "job", "user", "created"/
    );
});