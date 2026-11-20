import React from "react";
import { Printer, Download, X, IndianRupee, CheckCircle, Clock } from "lucide-react";

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

export default function SalarySlipModal({
  item,
  salon,
  payments = [],
  onClose
}) {
  if (!item) return null;

  const monthName = new Date(`${item.monthYear}-01`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  const shopName = salon?.name || "MY SALON";
  const shopSubtitle = salon?.subtitle || "Hair Wig & Hair Services";
  const shopAddress = salon?.address || "Mumbai, Maharashtra";
  const shopMobile = salon?.mobile || "+91 98765 43210";
  const shopEmail = salon?.email || "billing@nicelooking.in";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: "680px" }}>
        <div className="sheet-handle" />

        {/* Modal Top Actions (Hidden in Print) */}
        <div className="modal-head no-print">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <span>📄</span>
            <span>Employee Salary Slip — {item.employeeName}</span>
          </h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Salary Slip Printable Document */}
        <div className="salary-slip-document" id="salary-slip-print-area">
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: "12px", marginBottom: "14px" }}>
            <h2 style={{ margin: "0 0 2px 0", fontSize: "20px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {shopName}
            </h2>
            <div style={{ fontSize: "12px", color: "#475569" }}>
              {shopSubtitle} • {shopAddress}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              Phone: {shopMobile} • Email: {shopEmail}
            </div>
            <div
              style={{
                display: "inline-block",
                marginTop: "8px",
                background: "#f1f5f9",
                padding: "3px 12px",
                borderRadius: "12px",
                fontWeight: 800,
                fontSize: "12px",
                color: "#1e293b",
                letterSpacing: "0.05em",
                textTransform: "uppercase"
              }}
            >
              Payslip for {monthName}
            </div>
          </div>

          {/* Employee & Payroll Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px", fontSize: "12px" }}>
            <div>
              <div><strong>Employee Name:</strong> {item.employeeName}</div>
              <div><strong>Designation / Role:</strong> {item.jobRole || "Staff"}</div>
              <div><strong>Mobile:</strong> {item.employeeMobile || "—"}</div>
            </div>
            <div>
              <div><strong>Salary Scheme:</strong> {item.salaryType === "MONTHLY" ? "Monthly Salaried" : item.salaryType === "DAILY_WAGE" ? "Daily Wage" : "Hourly Rate"}</div>
              <div><strong>Base Rate:</strong> {money(item.baseSalary)}</div>
              <div><strong>Divisor Days:</strong> {item.calculationDays} days</div>
            </div>
          </div>

          {/* Attendance Summary */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
              📊 Attendance Summary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", textAlign: "center", fontSize: "11.5px" }}>
              <div style={{ background: "#dcfce7", padding: "6px", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                <strong style={{ color: "#15803d", display: "block" }}>{item.presentDays}</strong>
                <span style={{ color: "#166534", fontSize: "10.5px" }}>Present Days</span>
              </div>
              <div style={{ background: "#fef3c7", padding: "6px", borderRadius: "6px", border: "1px solid #fde68a" }}>
                <strong style={{ color: "#b45309", display: "block" }}>{item.halfDays}</strong>
                <span style={{ color: "#92400e", fontSize: "10.5px" }}>Half Days</span>
              </div>
              <div style={{ background: "#fee2e2", padding: "6px", borderRadius: "6px", border: "1px solid #fca5a5" }}>
                <strong style={{ color: "#b91c1c", display: "block" }}>{item.absentDays}</strong>
                <span style={{ color: "#991b1b", fontSize: "10.5px" }}>Absent Days</span>
              </div>
              <div style={{ background: "#e0f2fe", padding: "6px", borderRadius: "6px", border: "1px solid #bae6fd" }}>
                <strong style={{ color: "#0369a1", display: "block" }}>{item.payableDays}</strong>
                <span style={{ color: "#075985", fontSize: "10.5px" }}>Payable Days</span>
              </div>
            </div>
          </div>

          {/* Earnings & Deductions Two-Column Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            {/* Earnings Column */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ background: "#f1f5f9", padding: "6px 10px", fontWeight: 700, fontSize: "12px", color: "#1e293b", borderBottom: "1px solid #e2e8f0" }}>
                Earnings
              </div>
              <div style={{ padding: "8px 10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Basic Pay:</span>
                  <strong>{money(item.salaryType === "MONTHLY" ? item.baseSalary : (item.payableDays * (item.dailyRate || item.hourlyRate)))}</strong>
                </div>
                {item.overtimeAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#15803d" }}>
                    <span>Overtime ({item.overtimeHours}h):</span>
                    <strong>+{money(item.overtimeAmount)}</strong>
                  </div>
                )}
                {item.fixedAllowance > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Fixed Allowance:</span>
                    <strong>+{money(item.fixedAllowance)}</strong>
                  </div>
                )}
                {item.bonus > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#15803d" }}>
                    <span>Bonus / Incentive:</span>
                    <strong>+{money(item.bonus)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #cbd5e1", paddingTop: "5px", marginTop: "4px", fontWeight: 700 }}>
                  <span>Gross Earnings:</span>
                  <span>{money(item.grossSalary)}</span>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{ background: "#fef2f2", padding: "6px 10px", fontWeight: 700, fontSize: "12px", color: "#991b1b", borderBottom: "1px solid #fecdd3" }}>
                Deductions
              </div>
              <div style={{ padding: "8px 10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {item.absentDeduction > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                    <span>Absent ({item.absentDays}d):</span>
                    <strong>-{money(item.absentDeduction)}</strong>
                  </div>
                )}
                {item.halfDayDeduction > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                    <span>Half-Day ({item.halfDays}d):</span>
                    <strong>-{money(item.halfDayDeduction)}</strong>
                  </div>
                )}
                {item.unpaidLeaveDeduction > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                    <span>Unpaid Leave ({item.unpaidLeaves}d):</span>
                    <strong>-{money(item.unpaidLeaveDeduction)}</strong>
                  </div>
                )}
                {item.advanceDeduction > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                    <span>Advance Repayment:</span>
                    <strong>-{money(item.advanceDeduction)}</strong>
                  </div>
                )}
                {item.otherDeductions > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#b91c1c" }}>
                    <span>Other Deductions:</span>
                    <strong>-{money(item.otherDeductions)}</strong>
                  </div>
                )}
                {item.absentDeduction === 0 && item.halfDayDeduction === 0 && item.unpaidLeaveDeduction === 0 && item.advanceDeduction === 0 && item.otherDeductions === 0 && (
                  <div style={{ color: "#64748b", fontStyle: "italic" }}>
                    Nil (Zero deductions)
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #fca5a5", paddingTop: "5px", marginTop: "4px", fontWeight: 700, color: "#991b1b" }}>
                  <span>Total Deductions:</span>
                  <span>-{money(item.totalDeductions + (item.salaryType === "MONTHLY" ? (item.absentDeduction + item.halfDayDeduction + item.unpaidLeaveDeduction) : 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Payable Highlight Banner */}
          <div style={{ background: "#0f172a", color: "#ffffff", padding: "12px 16px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>
                Net Payable Salary
              </span>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#ffffff" }}>
                {money(item.netSalary)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  background: item.paymentStatus === "PAID" ? "#22c55e" : item.paymentStatus === "PARTIAL" ? "#f59e0b" : "#ef4444",
                  color: "#ffffff"
                }}
              >
                {item.paymentStatus === "PAID" ? "✓ FULLY PAID" : item.paymentStatus === "PARTIAL" ? "PARTIALLY PAID" : "PENDING"}
              </span>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
                Paid: {money(item.amountPaid)} • Bal: {money(item.balancePending)}
              </div>
            </div>
          </div>

          {/* Payment History if any */}
          {payments.length > 0 && (
            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", marginBottom: "14px", fontSize: "11.5px" }}>
              <strong style={{ color: "#334155", display: "block", marginBottom: "4px" }}>
                Disbursement History:
              </strong>
              {payments.map((p, idx) => (
                <div key={p.id || idx} style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
                  <span>• {p.paymentDate}: {money(p.amount)} via {p.paymentMode} {p.transactionRef ? `(${p.transactionRef})` : ""}</span>
                  <span style={{ color: "#64748b" }}>by {p.paidByName || "Admin"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Signatures & Footer */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "30px", paddingTop: "20px", borderTop: "1px dashed #cbd5e1" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ height: "35px" }} />
              <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "4px", fontSize: "11.5px", color: "#475569" }}>
                Employee Signature
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ height: "35px" }} />
              <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "4px", fontSize: "11.5px", color: "#475569" }}>
                Authorized Salon Signatory
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Buttons (Hidden in Print) */}
        <div className="form-actions no-print" style={{ marginTop: "16px", flexWrap: "wrap", gap: "8px" }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn primary" onClick={handlePrint}>
            <Printer size={15} /> <span>Print Payslip</span>
          </button>
        </div>
      </div>
    </div>
  );
}

