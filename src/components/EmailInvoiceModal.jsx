import React, { useState } from "react";
import { Mail, CheckCircle, AlertTriangle, Send, X, FileText, Building2 } from "lucide-react";
import { sendInvoiceEmail } from "../lib/emailService";

export default function EmailInvoiceModal({
  invoice,
  customSettings,
  actorInfo,
  onClose,
  onSuccess
}) {
  const [recipientEmail, setRecipientEmail] = useState(
    invoice?.email || invoice?.customerEmail || "sameershaikh121@proton.me"
  );
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successResult, setSuccessResult] = useState(null);

  const shopName = invoice?.shopSettings?.shop_name || customSettings?.shop_name || customSettings?.name || "NICE LOOKING";
  const invNumber = invoice?.invoiceNumber || invoice?.id || "NL-INV";
  const totalAmount = invoice?.total || invoice?.amount || 0;

  async function handleSendEmail(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessResult(null);

    const cleanEmail = recipientEmail.trim();
    if (!cleanEmail) {
      setErrorMsg("Please enter a valid recipient email address.");
      return;
    }

    setSending(true);
    try {
      const result = await sendInvoiceEmail({
        invoice,
        recipientEmail: cleanEmail,
        customerName: invoice?.name || invoice?.customerName || "Customer",
        customSettings,
        actorInfo
      });

      setSuccessResult(result);
      if (onSuccess) onSuccess(result);
    } catch (err) {
      console.error("Failed to send invoice email:", err);
      setErrorMsg(err.message || "Failed to send invoice email. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: "520px" }} onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "#eff6ff",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Mail size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px" }}>Email Digital Invoice Receipt</h3>
              <small style={{ color: "#64748b" }}>Powered by Web3Forms Delivery API</small>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSendEmail}>
          <div className="modal-body">
            {/* Invoice Summary Card */}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <strong style={{ fontSize: "14px", color: "#1e293b", display: "block" }}>
                  Invoice #{invNumber}
                </strong>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Billed to: <strong>{invoice?.name || invoice?.customerName || "Customer"}</strong>
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong style={{ fontSize: "16px", color: "#059669", display: "block" }}>
                  ₹{Number(totalAmount).toLocaleString("en-IN")}
                </strong>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "6px",
                    background: invoice?.isVoided ? "#fee2e2" : "#ecfdf5",
                    color: invoice?.isVoided ? "#b91c1c" : "#047857",
                    fontWeight: 700
                  }}
                >
                  {invoice?.isVoided ? "VOIDED" : "PAID"}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "14px" }}>
                <AlertTriangle size={15} style={{ marginRight: "6px" }} />
                {errorMsg}
              </div>
            )}

            {successResult && (
              <div className="alert success-box" style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe", marginBottom: "14px" }}>
                <CheckCircle size={15} style={{ marginRight: "6px" }} />
                <div>
                  <strong>{successResult.message || "Email dispatched successfully!"}</strong>
                  <div style={{ fontSize: "11px", marginTop: "2px", color: "#2563eb" }}>
                    Provider: {successResult.provider} → Sent to {recipientEmail}
                  </div>
                </div>
              </div>
            )}

            <label style={{ display: "block", marginBottom: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "4px" }}>
                Recipient Email Address *
              </span>
              <input
                type="email"
                required
                placeholder="customer@example.com or your email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
              <small style={{ color: "#64748b", fontSize: "11px", marginTop: "4px", display: "block" }}>
                Default notification inbox: <code>sameershaikh121@proton.me</code> (Fallback: <code>sameershaikh584@gmail.com</code>)
              </small>
            </label>

            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "12px",
                color: "#166534"
              }}
            >
              ✉️ An official formatted itemized receipt with salon contact and breakdown will be delivered instantly via Web3Forms.
            </div>
          </div>

          <div className="modal-foot">
            <button
              type="button"
              className="btn secondary"
              disabled={sending}
              onClick={onClose}
            >
              {successResult ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={sending || !recipientEmail}
            >
              {sending ? (
                <span>Sending via Web3Forms...</span>
              ) : (
                <>
                  <Send size={15} /> Send Invoice Email
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
