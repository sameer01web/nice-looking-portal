import React, { useState } from "react";
import { CheckCircle, Download, MessageCircle, AlertTriangle, X, IndianRupee } from "lucide-react";
import { settleInvoiceBalance } from "../lib/dataService.js";
import { settlementReceiptMessage } from "../lib/whatsapp.js";

async function downloadInvoicePDF(...args) {
  const mod = await import("../lib/invoicePdf.js");
  return mod.downloadInvoicePDF(...args);
}

async function shareInvoicePDFOnWhatsApp(...args) {
  const mod = await import("../lib/invoicePdf.js");
  return mod.shareInvoicePDFOnWhatsApp(...args);
}

const onlinePaymentMethods = ["UPI", "Card", "Netbanking"];

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

export default function SettleUdharModal({
  invoice,
  onClose,
  onSuccess,
  actorInfo,
  salonId = "default",
  settings = null,
  currentSalon = null
}) {
  if (!invoice) return null;

  const currentTotal = Number(invoice.total !== undefined ? invoice.total : (invoice.amount || 0));
  const currentAdvance = Number(invoice.advanceAmount !== undefined ? invoice.advanceAmount : currentTotal);
  const currentBalance = Number(invoice.balanceAmount !== undefined ? invoice.balanceAmount : Math.max(0, currentTotal - currentAdvance));

  const [amount, setAmount] = useState(String(currentBalance));
  const [paymentCategory, setPaymentCategory] = useState("Cash");
  const [onlineSubMethod, setOnlineSubMethod] = useState("UPI");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [sharingWa, setSharingWa] = useState(false);

  const effectivePaymentMode = paymentCategory === "Cash" ? "Cash" : onlineSubMethod;

  const handleAmountChip = (val) => {
    setAmount(String(val));
    setError("");
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const num = Number(amount);
    if (!num || isNaN(num) || num <= 0) {
      setError("Please enter a valid payment amount greater than zero.");
      return;
    }
    if (num > currentBalance) {
      setError(`Payment cannot exceed pending balance of ${money(currentBalance)}.`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await settleInvoiceBalance(
        invoice.id,
        {
          amount: num,
          paymentMode: effectivePaymentMode,
          note: note.trim(),
          paymentDate: new Date().toISOString()
        },
        actorInfo,
        salonId,
        invoice
      );

      setResult(res);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      console.error("Settlement failed:", err);
      setError(err.message || "Failed to settle balance.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!result?.invoice) return;
    setSharingWa(true);
    try {
      const activeSettings = currentSalon || settings;
      const msg = settlementReceiptMessage(result.invoice, result.settlement, activeSettings);
      const res = await shareInvoicePDFOnWhatsApp(result.invoice, activeSettings, msg);
      if (res?.method === "download_and_chat") {
        alert("Updated PDF downloaded! WhatsApp opened — attach the downloaded PDF in WhatsApp chat.");
      }
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      alert("Failed to share receipt on WhatsApp: " + err.message);
    } finally {
      setSharingWa(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!result?.invoice) return;
    const activeSettings = currentSalon || settings;
    downloadInvoicePDF(result.invoice, activeSettings);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: "520px" }}>
        <div className="sheet-handle"></div>

        <div className="modal-head">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>💳</span>
            <span>{result ? "Payment Recorded" : "Collect Customer Pending Payment"}</span>
          </h3>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Success Screen */}
        {result ? (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                background: "#dcfce7",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 14px auto",
                color: "#16a34a"
              }}
            >
              <CheckCircle size={36} />
            </div>

            <h3 style={{ margin: "0 0 6px 0", fontSize: "19px", color: "#0f172a", fontWeight: 800 }}>
              Payment Received Successfully!
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13.5px", color: "#64748b" }}>
              Amount <strong>{money(result.amountPaid)}</strong> received via{" "}
              <strong>{result.settlement?.paymentMode}</strong> for Invoice <strong>{result.invoice?.invoiceNumber}</strong>.
            </p>

            {/* Status Banner */}
            {result.isFullyPaid ? (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#15803d",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "14px",
                  marginBottom: "20px"
                }}
              >
                🎉 FULLY PAID — All pending dues cleared (Pending: ₹0)
              </div>
            ) : (
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#c2410c",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  fontSize: "14px",
                  marginBottom: "20px"
                }}
              >
                ⚠️ PARTIAL PAYMENT — Remaining Pending Balance: {money(result.remainingBalance)}
              </div>
            )}

            {/* Customer Details Pill */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "10px",
                fontSize: "12.5px",
                color: "#475569",
                marginBottom: "20px",
                textAlign: "left"
              }}
            >
              <div><strong>Customer:</strong> {result.invoice?.name} ({result.invoice?.mobile})</div>
              <div><strong>Updated Advance Paid:</strong> {money(result.invoice?.advanceAmount)} of {money(result.invoice?.total || result.invoice?.amount)}</div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                className="btn primary"
                type="button"
                style={{ background: "#25D366", borderColor: "#22c55e", justifyContent: "center", height: "46px" }}
                onClick={handleWhatsAppShare}
                disabled={sharingWa}
              >
                <MessageCircle size={17} />
                <span>{sharingWa ? "Preparing WhatsApp..." : "Share Updated Receipt & PDF on WhatsApp"}</span>
              </button>

              <button
                className="btn secondary"
                type="button"
                style={{ justifyContent: "center", height: "42px" }}
                onClick={handleDownloadPDF}
              >
                <Download size={16} />
                <span>Download Updated PDF Invoice</span>
              </button>

              <button
                className="btn secondary"
                type="button"
                style={{ justifyContent: "center", height: "40px", marginTop: "4px" }}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* 2. Settle Udhar Form */
          <form onSubmit={handleSubmit}>
            {/* Customer & Invoice Meta Box */}
            <div className="settle-customer-card">
              <div className="settle-customer-name">
                {invoice.name || invoice.customerName || "Customer"}
              </div>
              <div className="settle-customer-meta">
                <span>📱 {invoice.mobile || invoice.customerMobile || "No mobile"}</span>
                <span>🧾 {invoice.invoiceNumber || "INV"}</span>
                <span>📅 {invoice.createdAt ? String(invoice.createdAt).slice(0, 10) : "Today"}</span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="settle-financial-summary">
              <div className="settle-summary-box">
                <span className="settle-summary-box-label">Original Bill</span>
                <span className="settle-summary-box-val">{money(currentTotal)}</span>
              </div>
              <div className="settle-summary-box">
                <span className="settle-summary-box-label">Already Paid</span>
                <span className="settle-summary-box-val" style={{ color: "#2563eb" }}>{money(currentAdvance)}</span>
              </div>
              <div className="settle-summary-box highlight-udhar">
                <span className="settle-summary-box-label">Pending Balance</span>
                <span className="settle-summary-box-val">{money(currentBalance)}</span>
              </div>
            </div>

            {error && (
              <div className="alert danger" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", padding: "10px" }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Payment Section */}
            <div className="settle-payment-section">
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 700, fontSize: "13px", color: "#1e293b" }}>
                Amount Receiving Now (₹) *
              </label>

              <input
                type="number"
                min="1"
                max={currentBalance}
                step="any"
                className="settle-input-lg"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                }}
                placeholder="Enter amount"
                autoFocus
              />

              {/* Quick Amount Chips */}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
                <button
                  type="button"
                  className="discount-chip"
                  style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8", fontWeight: 700 }}
                  onClick={() => handleAmountChip(currentBalance)}
                >
                  Pay Full Pending ({money(currentBalance)})
                </button>

                {currentBalance > 100 && (
                  <button
                    type="button"
                    className="discount-chip"
                    onClick={() => handleAmountChip(Math.round(currentBalance / 2))}
                  >
                    50% ({money(Math.round(currentBalance / 2))})
                  </button>
                )}

                {currentBalance > 1000 && (
                  <button
                    type="button"
                    className="discount-chip"
                    onClick={() => handleAmountChip(1000)}
                  >
                    ₹1,000
                  </button>
                )}

                {currentBalance > 2000 && (
                  <button
                    type="button"
                    className="discount-chip"
                    onClick={() => handleAmountChip(2000)}
                  >
                    ₹2,000
                  </button>
                )}
              </div>

              {/* Remaining Balance Preview */}
              {Number(amount) > 0 && Number(amount) <= currentBalance && (
                <div style={{ marginTop: "12px", fontSize: "12.5px", fontWeight: 600 }}>
                  {currentBalance - Number(amount) === 0 ? (
                    <span style={{ color: "#16a34a" }}>✅ Bill will be FULLY CLEARED (₹0 remaining)</span>
                  ) : (
                    <span style={{ color: "#ea580c" }}>⚠️ Remaining Pending Balance after this payment: {money(currentBalance - Number(amount))}</span>
                  )}
                </div>
              )}
            </div>

            {/* Payment Mode */}
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "13px", color: "#1e293b" }}>
                Payment Mode *
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <button
                  type="button"
                  className={`btn ${paymentCategory === "Cash" ? "primary" : "secondary"}`}
                  style={{ justifyContent: "center", height: "40px" }}
                  onClick={() => setPaymentCategory("Cash")}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  className={`btn ${paymentCategory === "Online" ? "primary" : "secondary"}`}
                  style={{ justifyContent: "center", height: "40px" }}
                  onClick={() => setPaymentCategory("Online")}
                >
                  📱 Online / Digital
                </button>
              </div>

              {paymentCategory === "Online" && (
                <div style={{ display: "flex", gap: "8px" }}>
                  {onlinePaymentMethods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn ${onlineSubMethod === m ? "primary" : "secondary"}`}
                      style={{ flex: 1, justifyContent: "center", height: "36px", fontSize: "12px" }}
                      onClick={() => setOnlineSubMethod(m)}
                    >
                      {m === "UPI" ? "📱 UPI" : m === "Card" ? "💳 Card" : "🏦 Bank"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#64748b" }}>
                Settlement Note (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Cleared remaining balance, Google Pay ref #..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* Form Actions */}
            <div className="form-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                type="submit"
                disabled={submitting || !Number(amount)}
                style={{
                  background: "#16a34a",
                  borderColor: "#15803d",
                  height: "44px",
                  fontSize: "14px",
                  fontWeight: 700
                }}
              >
                {submitting ? "Processing..." : `✅ Collect ${money(Number(amount) || 0)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

