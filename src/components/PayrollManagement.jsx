import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IndianRupee,
  Calendar,
  Lock,
  Unlock,
  Download,
  Printer,
  CheckCircle,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  FileText,
  CreditCard,
  History,
  Pencil,
  Sliders,
  X,
  ChevronDown,
  Building2,
  Users
} from "lucide-react";
import {
  generateOrFetchMonthlyPayroll,
  finalizeMonthlyPayroll,
  reopenMonthlyPayroll,
  recordSalaryPayment,
  updatePayrollItemAdjustments,
  fetchSalaryPaymentHistory
} from "../lib/dataService";
import SalarySlipModal from "./SalarySlipModal";

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

export default function PayrollManagement({
  salonId = "default",
  actorInfo = null,
  currentSalon = null,
  setHeaderAction = null
}) {
  const currentMonthYear = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthYear);
  const [payrollData, setPayrollData] = useState({ payroll: null, items: [], isFinalized: false });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // 'ALL', 'PENDING', 'PARTIAL', 'PAID'

  // Modals state
  const [paymentModalItem, setPaymentModalItem] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [bonusInput, setBonusInput] = useState("");
  const [bonusReasonInput, setBonusReasonInput] = useState("");
  const [advanceDeductionInput, setAdvanceDeductionInput] = useState("");
  const [otherDeductionInput, setOtherDeductionInput] = useState("");
  const [deductionReasonInput, setDeductionReasonInput] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [slipModalItem, setSlipModalItem] = useState(null);
  const [slipPayments, setSlipPayments] = useState([]);

  const [reopenModal, setReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);

  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [historyPayments, setHistoryPayments] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [actionSuccess, setActionSuccess] = useState("");

  const loadPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await generateOrFetchMonthlyPayroll(selectedMonth, salonId, actorInfo);
      setPayrollData(res);
    } catch (err) {
      console.error("Failed to load payroll:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, salonId, actorInfo]);

  useEffect(() => {
    loadPayroll();
  }, [loadPayroll]);

  // Set Topbar Header Action: Download Payroll CSV
  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn secondary small-btn"
          type="button"
          onClick={handleExportCSV}
          title="Download Monthly Payroll Report as CSV"
        >
          <Download size={14} /> <span>Export Payroll CSV</span>
        </button>
      );
    }
  }, [setHeaderAction, payrollData.items, selectedMonth]);

  // Export CSV
  function handleExportCSV() {
    if (!payrollData.items || !payrollData.items.length) {
      alert("No payroll records available for export.");
      return;
    }
    const headers = [
      "Employee Name",
      "Job Role",
      "Salary Type",
      "Base Salary",
      "Divisor Days",
      "Present Days",
      "Half Days",
      "Absent Days",
      "Paid Leaves",
      "Unpaid Leaves",
      "Payable Days",
      "Overtime Hours",
      "Overtime Amount",
      "Fixed Allowance",
      "Bonus",
      "Absent Deduction",
      "Half Day Deduction",
      "Advance Deduction",
      "Other Deductions",
      "Gross Salary",
      "Net Payable Salary",
      "Amount Paid",
      "Pending Balance",
      "Payment Status"
    ];

    const rows = payrollData.items.map(i => [
      `"${i.employeeName}"`,
      `"${i.jobRole}"`,
      `"${i.salaryType}"`,
      i.baseSalary,
      i.calculationDays,
      i.presentDays,
      i.halfDays,
      i.absentDays,
      i.paidLeaves,
      i.unpaidLeaves,
      i.payableDays,
      i.overtimeHours,
      i.overtimeAmount,
      i.fixedAllowance,
      i.bonus,
      i.absentDeduction,
      i.halfDayDeduction,
      i.advanceDeduction,
      i.otherDeductions,
      i.grossSalary,
      i.netSalary,
      i.amountPaid,
      i.balancePending,
      `"${i.paymentStatus}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-report-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Finalize & Lock Payroll Month
  const handleFinalize = async () => {
    if (!window.confirm(`Are you sure you want to Finalize & Lock payroll for ${selectedMonth}? This will save an official snapshot of all calculations.`)) {
      return;
    }
    setLoading(true);
    try {
      await finalizeMonthlyPayroll(selectedMonth, payrollData.items, actorInfo, salonId);
      setActionSuccess(`Payroll for ${selectedMonth} has been finalized and locked.`);
      setTimeout(() => setActionSuccess(""), 4000);
      loadPayroll();
    } catch (err) {
      alert("Finalize failed: " + err.message);
      setLoading(false);
    }
  };

  // Reopen Locked Month
  const handleReopen = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      alert("Please provide a reason for reopening finalized payroll.");
      return;
    }
    setReopening(true);
    try {
      await reopenMonthlyPayroll(selectedMonth, reopenReason.trim(), actorInfo, salonId);
      setReopenModal(false);
      setReopenReason("");
      setActionSuccess(`Payroll for ${selectedMonth} reopened for revision.`);
      setTimeout(() => setActionSuccess(""), 4000);
      loadPayroll();
    } catch (err) {
      alert("Reopen failed: " + err.message);
    } finally {
      setReopening(false);
    }
  };

  // Open Payment Modal
  const openPaymentModal = (item) => {
    setPaymentModalItem(item);
    setPaymentAmount(String(item.balancePending > 0 ? item.balancePending : item.netSalary));
    setPaymentMode("Cash");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentRef("");
    setPaymentNotes("");
    setPaymentError("");
  };

  // Record Payment Submit
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const amt = Number(paymentAmount);
    if (!amt || isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }
    if (amt > paymentModalItem.balancePending) {
      setPaymentError(`Amount cannot exceed pending balance of ${money(paymentModalItem.balancePending)}.`);
      return;
    }

    setSubmittingPayment(true);
    setPaymentError("");

    try {
      await recordSalaryPayment({
        payrollItemId: paymentModalItem.id,
        employeeId: paymentModalItem.employeeId,
        monthYear: paymentModalItem.monthYear || selectedMonth,
        amount: amt,
        paymentMode,
        paymentDate,
        transactionRef: paymentRef.trim(),
        notes: paymentNotes.trim()
      }, actorInfo, salonId);

      setPaymentModalItem(null);
      setActionSuccess(`Payment of ${money(amt)} recorded for ${paymentModalItem.employeeName}.`);
      setTimeout(() => setActionSuccess(""), 4000);
      loadPayroll();
    } catch (err) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Open Adjustments Modal
  const openAdjustModal = (item) => {
    setAdjustModalItem(item);
    setBonusInput(item.bonus ? String(item.bonus) : "");
    setBonusReasonInput(item.bonusReason || "");
    setAdvanceDeductionInput(item.advanceDeduction ? String(item.advanceDeduction) : "");
    setOtherDeductionInput(item.otherDeductions ? String(item.otherDeductions) : "");
    setDeductionReasonInput(item.deductionReason || "");
  };

  // Save Adjustments Submit
  const handleSaveAdjustments = async (e) => {
    e.preventDefault();
    setSavingAdjustment(true);
    try {
      await updatePayrollItemAdjustments(adjustModalItem.id, {
        bonus: Number(bonusInput || 0),
        bonusReason: bonusReasonInput.trim(),
        advanceDeduction: Number(advanceDeductionInput || 0),
        otherDeductions: Number(otherDeductionInput || 0),
        deductionReason: deductionReasonInput.trim()
      }, actorInfo, salonId);

      setAdjustModalItem(null);
      loadPayroll();
    } catch (err) {
      alert("Adjustment failed: " + err.message);
    } finally {
      setSavingAdjustment(false);
    }
  };

  // Open Salary Slip
  const openSalarySlip = async (item) => {
    setSlipModalItem(item);
    try {
      const pmts = await fetchSalaryPaymentHistory(item.id, salonId, item.employeeId, item.monthYear || selectedMonth);
      setSlipPayments(pmts || []);
    } catch {
      setSlipPayments([]);
    }
  };

  // Open Payment History
  const openHistoryModal = async (item) => {
    setHistoryModalItem(item);
    setLoadingHistory(true);
    try {
      const pmts = await fetchSalaryPaymentHistory(item.id, salonId, item.employeeId, item.monthYear || selectedMonth);
      setHistoryPayments(pmts || []);
    } catch (err) {
      console.error(err);
      setHistoryPayments([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (payrollData.items || []).filter(item => {
      if (statusFilter !== "ALL" && item.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      const str = `${item.employeeName} ${item.employeeMobile} ${item.jobRole} ${item.salaryType}`.toLowerCase();
      return str.includes(q);
    });
  }, [payrollData.items, search, statusFilter]);

  // Executive KPI stats
  const totalExpense = (payrollData.items || []).reduce((s, i) => s + Number(i.netSalary || 0), 0);
  const totalPaid = (payrollData.items || []).reduce((s, i) => s + Number(i.amountPaid || 0), 0);
  const totalPending = Math.max(0, totalExpense - totalPaid);
  const employeeCount = (payrollData.items || []).length;
  const isFinalized = payrollData.isFinalized || payrollData.payroll?.status === "FINALIZED";

  return (
    <div className="payroll-mgmt-container">
      {/* Month Selector & Master Controls */}
      <div className="panel" style={{ padding: "14px 18px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Calendar size={18} style={{ color: "var(--blue)" }} />
              <input
                type="month"
                className="date-input"
                style={{ fontSize: "14px", fontWeight: 700, padding: "6px 12px" }}
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
            </div>

            {isFinalized ? (
              <span className="pill" style={{ background: "#dcfce7", color: "#15803d", borderColor: "#86efac", fontWeight: 800, padding: "4px 10px" }}>
                🔒 FINALIZED & LOCKED
              </span>
            ) : (
              <span className="pill warning" style={{ fontWeight: 800, padding: "4px 10px" }}>
                📝 REAL-TIME PREVIEW (DRAFT)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary small-btn"
              onClick={loadPayroll}
              title="Recalculate live from attendance"
              disabled={loading}
            >
              <RefreshCw size={13} /> Refresh Calculations
            </button>

            {isFinalized ? (
              <button
                type="button"
                className="btn secondary small-btn"
                style={{ color: "#d97706" }}
                onClick={() => setReopenModal(true)}
                title="Reopen finalized month for attendance or salary corrections"
              >
                <Unlock size={14} /> Reopen Month
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                style={{ background: "#2563eb", borderColor: "#1d4ed8", fontWeight: 700 }}
                onClick={handleFinalize}
                disabled={loading || employeeCount === 0}
              >
                <Lock size={15} /> Finalize & Lock Payroll
              </button>
            )}

            <button
              type="button"
              className="btn secondary small-btn"
              onClick={handleExportCSV}
            >
              <Download size={14} /> CSV Report
            </button>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="alert success" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "20px" }}>
        <div className="kpi-card" style={{ borderLeft: "4px solid #2563eb" }}>
          <div className="kpi-head">
            <span className="kpi-title">Monthly Payroll Expense</span>
            <IndianRupee size={18} style={{ color: "#2563eb" }} />
          </div>
          <div className="kpi-value">{money(totalExpense)}</div>
          <div className="kpi-note">{employeeCount} active staff members</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="kpi-head">
            <span className="kpi-title">Paid Salary</span>
            <CheckCircle size={18} style={{ color: "#16a34a" }} />
          </div>
          <div className="kpi-value" style={{ color: "#16a34a" }}>{money(totalPaid)}</div>
          <div className="kpi-note">Disbursed to employees</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #ea580c" }}>
          <div className="kpi-head">
            <span className="kpi-title">Pending Salary</span>
            <AlertTriangle size={18} style={{ color: "#ea580c" }} />
          </div>
          <div className="kpi-value" style={{ color: totalPending > 0 ? "#dc2626" : "#16a34a" }}>
            {money(totalPending)}
          </div>
          <div className="kpi-note">{totalPending > 0 ? "Outstanding balance to clear" : "All salaries cleared!"}</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #7e22ce" }}>
          <div className="kpi-head">
            <span className="kpi-title">Payroll Status</span>
            <FileText size={18} style={{ color: "#7e22ce" }} />
          </div>
          <div className="kpi-value" style={{ fontSize: "19px" }}>
            {isFinalized ? "Finalized" : "Draft"}
          </div>
          <div className="kpi-note">{isFinalized ? `Locked on ${payrollData.payroll?.finalizedAt ? String(payrollData.payroll.finalizedAt).slice(0, 10) : "today"}` : "Unsaved live preview"}</div>
        </div>
      </div>

      {/* Main Payroll Summary Table */}
      <section className="panel">
        <div className="invoices-filter-bar">
          <div className="invoices-search-status-row">
            <div className="search">
              <Search size={17} />
              <input
                type="text"
                placeholder="Search by employee name, role, salary type..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Payment Status Segmented Tabs */}
            <div className="invoice-status-tabs">
              <button
                type="button"
                className={`status-tab ${statusFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                All ({payrollData.items.length})
              </button>
              <button
                type="button"
                className={`status-tab udhar-tab ${statusFilter === "PENDING" ? "active" : ""}`}
                onClick={() => setStatusFilter("PENDING")}
              >
                ⏳ Pending
              </button>
              <button
                type="button"
                className={`status-tab ${statusFilter === "PARTIAL" ? "active" : ""}`}
                onClick={() => setStatusFilter("PARTIAL")}
              >
                Partially Paid
              </button>
              <button
                type="button"
                className={`status-tab active-tab ${statusFilter === "PAID" ? "active" : ""}`}
                onClick={() => setStatusFilter("PAID")}
              >
                ✓ Paid
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap desktop-only-table" style={{ marginTop: "14px" }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Base Salary</th>
                <th>Attendance (P / H / A)</th>
                <th>Payable Days</th>
                <th>Additions (OT + Bonus)</th>
                <th>Deductions</th>
                <th>Net Payable</th>
                <th>Paid & Bal</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length ? (
                filteredItems.map(item => {
                  const isPaid = item.paymentStatus === "PAID";
                  const isPartial = item.paymentStatus === "PARTIAL";

                  return (
                    <tr key={item.id} style={isPaid ? { background: "#f0fdf4" } : {}}>
                      <td>
                        <strong>{item.employeeName}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>
                          {item.jobRole} • {item.salaryType}
                        </small>
                      </td>
                      <td>
                        <strong>{money(item.baseSalary)}</strong>
                        <small style={{ display: "block", color: "#64748b" }}>
                          Rate: {money(item.dailyRate || item.hourlyRate)}/d
                        </small>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", display: "flex", gap: "4px", alignItems: "center" }}>
                          <span style={{ color: "#16a34a", fontWeight: 700 }} title="Present Days">
                            {item.presentDays}P
                          </span>
                          <span style={{ color: "#d97706", fontWeight: 700 }} title="Half Days">
                            {item.halfDays}H
                          </span>
                          <span style={{ color: "#dc2626", fontWeight: 700 }} title="Absent Days">
                            {item.absentDays}A
                          </span>
                        </div>
                        <small style={{ color: "#64748b" }}>
                          Paid Leaves: {item.paidLeaves}d
                        </small>
                      </td>
                      <td>
                        <strong style={{ color: "#0f172a" }}>
                          {item.payableDays} days
                        </strong>
                        <small style={{ display: "block", color: "#64748b" }}>
                          Divisor: {item.calculationDays}d
                        </small>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700 }}>
                          +{money(item.overtimeAmount + item.bonus + item.fixedAllowance)}
                        </div>
                        <small style={{ color: "#64748b" }}>
                          {item.overtimeHours > 0 ? `OT: ${item.overtimeHours}h ` : ""}
                          {item.bonus > 0 ? `Bonus: ${money(item.bonus)}` : ""}
                        </small>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: 700 }}>
                          -{money(item.totalDeductions + (item.salaryType === "MONTHLY" ? (item.absentDeduction + item.halfDayDeduction + item.unpaidLeaveDeduction) : 0))}
                        </div>
                        <small style={{ color: "#64748b" }}>
                          {item.advanceDeduction > 0 ? `Adv: ${money(item.advanceDeduction)} ` : ""}
                          {item.absentDeduction > 0 ? `Abs: ${money(item.absentDeduction)}` : ""}
                        </small>
                      </td>
                      <td>
                        <strong style={{ color: "#15803d", fontSize: "14px" }}>
                          {money(item.netSalary)}
                        </strong>
                      </td>
                      <td>
                        <div style={{ fontSize: "12px" }}>
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>Paid: {money(item.amountPaid)}</span>
                          <br />
                          <span style={{ color: item.balancePending > 0 ? "#dc2626" : "#64748b", fontWeight: 700 }}>
                            Bal: {money(item.balancePending)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`pill ${isPaid ? "success" : isPartial ? "warning" : "danger"}`}
                          style={{ fontWeight: 800, fontSize: "10.5px" }}
                        >
                          {isPaid ? "✓ PAID" : isPartial ? "PARTIAL" : "PENDING"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end", gap: "4px" }}>
                          {item.balancePending > 0 && (
                            <button
                              type="button"
                              className="btn-collect-udhar"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => openPaymentModal(item)}
                              title="Record Salary Payment"
                            >
                              💳 Pay
                            </button>
                          )}

                          <button
                            type="button"
                            className="icon-action-btn"
                            style={{ color: "#2563eb" }}
                            onClick={() => openSalarySlip(item)}
                            title="Print Salary Slip"
                          >
                            <Printer size={15} />
                          </button>

                          <button
                            type="button"
                            className="icon-action-btn edit-action"
                            onClick={() => openAdjustModal(item)}
                            title="Adjust Bonus or Deductions"
                          >
                            <Sliders size={15} />
                          </button>

                          <button
                            type="button"
                            className="icon-action-btn"
                            onClick={() => openHistoryModal(item)}
                            title="Payment History"
                          >
                            <History size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="10" className="empty-cell">
                    {loading ? "Calculating monthly payroll..." : "No payroll records found for this month."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Card View */}
        <div className="mobile-only-cards mobile-card-list" style={{ marginTop: "14px" }}>
          {filteredItems.length ? (
            filteredItems.map(item => {
              const isPaid = item.paymentStatus === "PAID";
              const isPartial = item.paymentStatus === "PARTIAL";

              return (
                <div
                  className="mobile-card"
                  key={item.id}
                  style={isPaid ? { background: "#f0fdf4", borderLeft: "4px solid #16a34a" } : { borderLeft: "4px solid #2563eb" }}
                >
                  <div className="mobile-card-header">
                    <div>
                      <h4 className="mobile-card-title">{item.employeeName}</h4>
                      <span className="mobile-card-sub">{item.jobRole} • {item.salaryType}</span>
                    </div>
                    <div>
                      <div className="mobile-card-amount" style={{ color: "#15803d", fontSize: "15px", fontWeight: 800 }}>
                        {money(item.netSalary)}
                      </div>
                      <span
                        className={`pill ${isPaid ? "success" : isPartial ? "warning" : "danger"}`}
                        style={{ fontSize: "10.5px", fontWeight: 800 }}
                      >
                        {item.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="mobile-card-body" style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Attendance:</span>
                      <strong>{item.presentDays}P • {item.halfDays}H • {item.absentDays}A (Payable: {item.payableDays}d)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Base Salary:</span>
                      <span>{money(item.baseSalary)}</span>
                    </div>
                    {(item.overtimeAmount > 0 || item.bonus > 0) && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#16a34a" }}>
                        <span>OT & Bonus:</span>
                        <strong>+{money(item.overtimeAmount + item.bonus)}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Paid / Pending:</span>
                      <span>
                        <strong style={{ color: "#16a34a" }}>{money(item.amountPaid)}</strong> / <strong style={{ color: item.balancePending > 0 ? "#dc2626" : "#64748b" }}>{money(item.balancePending)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="mobile-card-actions" style={{ flexWrap: "wrap", gap: "6px" }}>
                    {item.balancePending > 0 && (
                      <button
                        type="button"
                        className="btn primary small-btn"
                        style={{ background: "#16a34a", borderColor: "#15803d" }}
                        onClick={() => openPaymentModal(item)}
                      >
                        💳 Pay {money(item.balancePending)}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn secondary small-btn"
                      onClick={() => openSalarySlip(item)}
                    >
                      <Printer size={13} /> Payslip
                    </button>
                    <button
                      type="button"
                      className="btn secondary small-btn"
                      onClick={() => openAdjustModal(item)}
                    >
                      <Sliders size={13} /> Adjust
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-cell">
              No staff records found for this period.
            </div>
          )}
        </div>
      </section>

      {/* Record Salary Payment Modal */}
      {paymentModalItem && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !submittingPayment) setPaymentModalItem(null);
          }}
        >
          <div className="modal" style={{ maxWidth: "520px", width: "95%", padding: "20px" }}>
            <div className="sheet-handle" />
            <div className="modal-head" style={{ paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "17px" }}>
                <span>💳</span>
                <span>Record Salary Payment</span>
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPaymentModalItem(null)}
                disabled={submittingPayment}
              >
                <X size={18} />
              </button>
            </div>

            {paymentError && (
              <div className="alert danger" style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0 0 0" }}>
                <AlertTriangle size={16} />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Employee Info Header Banner */}
            <div
              style={{
                background: "#f8fafc",
                padding: "12px 14px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                marginTop: "14px",
                marginBottom: "16px",
                fontSize: "13px",
                lineHeight: "1.6"
              }}
            >
              <div>
                <span style={{ color: "#64748b" }}>Employee:</span>{" "}
                <strong style={{ color: "#0f172a" }}>{paymentModalItem.employeeName}</strong>{" "}
                <span className="pill" style={{ fontSize: "11px", padding: "1px 7px" }}>{paymentModalItem.jobRole}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", marginTop: "4px" }}>
                <div>
                  <span style={{ color: "#64748b" }}>Net Salary:</span>{" "}
                  <strong>{money(paymentModalItem.netSalary)}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Outstanding Balance:</span>{" "}
                  <strong style={{ color: "#dc2626" }}>{money(paymentModalItem.balancePending)}</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleRecordPayment} className="responsive-modal-form">
              <div className="responsive-form-grid">
                {/* Amount Paying Now */}
                <div className="form-group span-full">
                  <label className="form-label">
                    Amount Paying Now (₹) <span className="req-star">*</span>
                  </label>
                  <div className="input-with-symbol">
                    <span className="input-currency-symbol">₹</span>
                    <input
                      type="number"
                      className="form-control"
                      style={{ fontSize: "16px", fontWeight: 700, color: "#16a34a" }}
                      min="1"
                      max={paymentModalItem.balancePending}
                      required
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {/* Quick Preset Buttons */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="discount-chip"
                      style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                      onClick={() => setPaymentAmount(String(paymentModalItem.balancePending))}
                    >
                      ✓ Pay Full Balance ({money(paymentModalItem.balancePending)})
                    </button>
                    {paymentModalItem.balancePending > 1000 && (
                      <button
                        type="button"
                        className="discount-chip"
                        onClick={() => setPaymentAmount(String(Math.round(paymentModalItem.balancePending / 2)))}
                      >
                        50% ({money(Math.round(paymentModalItem.balancePending / 2))})
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment Mode */}
                <div className="form-group">
                  <label className="form-label">
                    Payment Mode <span className="req-star">*</span>
                  </label>
                  <select
                    className="form-control"
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value)}
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="UPI">📱 UPI (GPay / PhonePe / Paytm)</option>
                    <option value="Bank Transfer">🏦 Bank Transfer (NEFT / IMPS)</option>
                    <option value="Cheque">📜 Cheque</option>
                  </select>
                </div>

                {/* Payment Date */}
                <div className="form-group">
                  <label className="form-label">
                    Payment Date <span className="req-star">*</span>
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    required
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                  />
                </div>

                {/* Transaction Ref / Cheque No */}
                <div className="form-group span-full">
                  <label className="form-label">
                    Transaction Ref / Cheque No. <span className="opt-tag">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="UPI Ref ID, Bank UTR, Cheque number, etc."
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                  />
                </div>

                {/* Payment Remarks */}
                <div className="form-group span-full">
                  <label className="form-label">
                    Payment Remarks <span className="opt-tag">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Cleared via counter cash / partial advance"
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPaymentModalItem(null)}
                  disabled={submittingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  style={{ background: "#16a34a", borderColor: "#15803d" }}
                  disabled={submittingPayment}
                >
                  {submittingPayment ? "Recording Payment..." : `Disburse ${money(paymentAmount || 0)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Adjustments Modal */}
      {adjustModalItem && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !savingAdjustment) setAdjustModalItem(null);
          }}
        >
          <div className="modal" style={{ maxWidth: "540px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: "20px" }}>
            <div className="sheet-handle" />
            <div className="modal-head" style={{ paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "17px" }}>
                <Sliders size={18} style={{ color: "var(--blue)" }} />
                <span>Adjust Salary — {adjustModalItem.employeeName}</span>
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setAdjustModalItem(null)}
                disabled={savingAdjustment}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "14px 2px 4px 2px", flex: 1 }}>
              <form onSubmit={handleSaveAdjustments} className="responsive-modal-form">
                {/* 1. Bonus Card (Green Theme) */}
                <div
                  style={{
                    background: "#f0fdf4",
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid #bbf7d0",
                    marginBottom: "14px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", fontWeight: 700, color: "#166534", fontSize: "13.5px" }}>
                    <span>🎁</span> <span>Bonus / Performance Incentive</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: "10px" }}>
                    <label className="form-label" style={{ color: "#166534" }}>
                      Bonus Amount (₹)
                    </label>
                    <div className="input-with-symbol">
                      <span className="input-currency-symbol">₹</span>
                      <input
                        type="number"
                        className="form-control"
                        min="0"
                        placeholder="e.g. 1000"
                        value={bonusInput}
                        onChange={e => setBonusInput(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: "#166534" }}>
                      Bonus Reason <span className="opt-tag">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Festival bonus, Top wig styling sales"
                      value={bonusReasonInput}
                      onChange={e => setBonusReasonInput(e.target.value)}
                    />
                  </div>
                </div>

                {/* 2. Deductions Card (Red/Pink Theme) */}
                <div
                  style={{
                    background: "#fef2f2",
                    padding: "14px",
                    borderRadius: "10px",
                    border: "1px solid #fecdd3"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", fontWeight: 700, color: "#991b1b", fontSize: "13.5px" }}>
                    <span>⚠️</span> <span>Salary Deductions & Advances</span>
                  </div>

                  <div className="responsive-form-grid" style={{ marginBottom: "10px" }}>
                    <div className="form-group">
                      <label className="form-label" style={{ color: "#991b1b" }}>
                        Advance Repayment (₹)
                      </label>
                      <div className="input-with-symbol">
                        <span className="input-currency-symbol">₹</span>
                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          placeholder="Advance to deduct"
                          value={advanceDeductionInput}
                          onChange={e => setAdvanceDeductionInput(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ color: "#991b1b" }}>
                        Other Deductions (₹)
                      </label>
                      <div className="input-with-symbol">
                        <span className="input-currency-symbol">₹</span>
                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          placeholder="Damage or penalty"
                          value={otherDeductionInput}
                          onChange={e => setOtherDeductionInput(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: "#991b1b" }}>
                      Deduction Reason / Notes <span className="opt-tag">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Advance taken on 15th, uniform fee"
                      value={deductionReasonInput}
                      onChange={e => setDeductionReasonInput(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-actions-footer">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setAdjustModalItem(null)}
                    disabled={savingAdjustment}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={savingAdjustment}
                  >
                    {savingAdjustment ? "Applying Adjustments..." : "Save Adjustments"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Salary Payment History Modal */}
      {historyModalItem && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setHistoryModalItem(null);
          }}
        >
          <div className="modal" style={{ maxWidth: "500px", width: "95%", padding: "20px" }}>
            <div className="sheet-handle" />
            <div className="modal-head">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={18} style={{ color: "var(--blue)" }} />
                <span>Payment History — {historyModalItem.employeeName}</span>
              </h3>
              <button type="button" className="icon-btn" onClick={() => setHistoryModalItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: "14px" }}>
              {loadingHistory ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#64748b" }}>
                  Loading payment history...
                </div>
              ) : historyPayments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {historyPayments.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <strong style={{ color: "#16a34a", fontSize: "14px" }}>{money(p.amount)}</strong>
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                          {p.paymentDate} via <strong>{p.paymentMode}</strong>
                          {p.transactionRef ? ` • Ref: ${p.transactionRef}` : ""}
                        </div>
                        {p.notes && (
                          <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
                            "{p.notes}"
                          </div>
                        )}
                      </div>
                      <small style={{ color: "#64748b" }}>by {p.paidByName}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-cell">
                  No payment disbursements recorded for this employee yet.
                </div>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button type="button" className="btn secondary" onClick={() => setHistoryModalItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Finalized Month Modal */}
      {reopenModal && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !reopening) setReopenModal(false);
          }}
        >
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="sheet-handle" />
            <div className="modal-head">
              <h3 style={{ color: "#d97706", display: "flex", alignItems: "center", gap: "8px" }}>
                <Unlock size={19} />
                <span>Reopen Finalized Month?</span>
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setReopenModal(false)}
                disabled={reopening}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReopen} style={{ marginTop: "12px" }}>
              <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#475569" }}>
                Reopening <strong>{selectedMonth}</strong> allows you to revise attendance calculations or salary adjustments. An audit trail of this revision will be recorded.
              </p>

              <label>
                Reason for Reopening *
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Correcting late attendance or adding missed festival bonus..."
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                />
              </label>

              <div className="form-actions" style={{ marginTop: "14px" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setReopenModal(false)}
                  disabled={reopening}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  style={{ background: "#d97706", borderColor: "#b45309" }}
                  disabled={reopening}
                >
                  {reopening ? "Reopening Month..." : "Yes, Reopen for Editing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Salary Slip Modal */}
      {slipModalItem && (
        <SalarySlipModal
          item={slipModalItem}
          salon={currentSalon}
          payments={slipPayments}
          onClose={() => setSlipModalItem(null)}
        />
      )}
    </div>
  );
}

