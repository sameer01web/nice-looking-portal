import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  X,
  Phone,
  Briefcase,
  IndianRupee,
  Clock,
  Calendar,
  Building2,
  Shield,
  RefreshCw,
  UserX,
  UserCheck
} from "lucide-react";
import { fetchEmployees, saveEmployee, deactivateEmployee } from "../lib/dataService";

const jobRoles = [
  "Hair Stylist",
  "Wig Specialist",
  "Hair Colorist",
  "Salon Assistant",
  "Receptionist",
  "Salon Manager",
  "Makeup Artist",
  "Helper / Cleaning",
  "Other"
];

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

export default function EmployeeManagement({
  salonId = "default",
  actorInfo = null,
  currentSalon = null,
  availableSalons = [],
  setHeaderAction = null
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE"); // 'ALL', 'ACTIVE', 'INACTIVE'
  const [salaryTypeFilter, setSalaryTypeFilter] = useState("ALL"); // 'ALL', 'MONTHLY', 'DAILY_WAGE', 'HOURLY'
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  // Form State
  const initialForm = {
    name: "",
    mobile: "",
    jobRole: "Hair Stylist",
    joiningDate: new Date().toISOString().slice(0, 10),
    salaryType: "MONTHLY",
    baseSalary: "",
    monthlyWorkingDays: "30",
    paidLeavesPerMonth: "1",
    overtimeRate: "",
    fixedAllowance: "",
    status: "ACTIVE",
    branchId: salonId || "default",
    address: "",
    notes: ""
  };
  const [form, setForm] = useState(initialForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchEmployees(salonId);
      setEmployees(list || []);
    } catch (err) {
      console.error("Failed to load employees:", err);
    } finally {
      setLoading(false);
    }
  }, [salonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clear Topbar Header Action button so only the single center/page button is present
  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(null);
    }
  }, [setHeaderAction]);

  const openEditModal = (emp) => {
    setEditingEmployee(emp);
    setForm({
      name: emp.name || "",
      mobile: emp.mobile || "",
      jobRole: emp.jobRole || "Hair Stylist",
      joiningDate: emp.joiningDate || new Date().toISOString().slice(0, 10),
      salaryType: emp.salaryType || "MONTHLY",
      baseSalary: String(emp.baseSalary || ""),
      monthlyWorkingDays: String(emp.monthlyWorkingDays || "30"),
      paidLeavesPerMonth: String(emp.paidLeavesPerMonth !== undefined ? emp.paidLeavesPerMonth : "1"),
      overtimeRate: emp.overtimeRate ? String(emp.overtimeRate) : "",
      fixedAllowance: emp.fixedAllowance ? String(emp.fixedAllowance) : "",
      status: emp.status || "ACTIVE",
      branchId: emp.branchId || salonId || "default",
      address: emp.address || "",
      notes: emp.notes || ""
    });
    setErrorMsg("");
    setShowAddModal(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      setErrorMsg("Employee name is required.");
      return;
    }
    const cleanMobile = form.mobile.replace(/\D/g, "");
    if (cleanMobile.length < 10) {
      setErrorMsg("A valid 10-digit mobile number is required.");
      return;
    }
    if (form.baseSalary === "" || isNaN(Number(form.baseSalary)) || Number(form.baseSalary) < 0) {
      setErrorMsg("Please enter a valid base salary or wage rate.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      await saveEmployee({
        ...form,
        id: editingEmployee?.id || undefined,
        salonId,
        mobile: cleanMobile
      }, actorInfo, salonId);

      setShowAddModal(false);
      setSuccessMsg(editingEmployee ? "Employee updated successfully." : "New employee registered successfully.");
      setTimeout(() => setSuccessMsg(""), 4000);
      loadData();
    } catch (err) {
      setErrorMsg(err.message || "Failed to save employee.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    try {
      await deactivateEmployee(confirmDeactivate.id, actorInfo, salonId);
      setConfirmDeactivate(null);
      loadData();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Filter & Search Logic
  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter(e => {
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (salaryTypeFilter !== "ALL" && e.salaryType !== salaryTypeFilter) return false;

      if (!q) return true;
      const text = `${e.name || ""} ${e.mobile || ""} ${e.jobRole || ""} ${e.salaryType || ""} ${e.address || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [employees, search, statusFilter, salaryTypeFilter]);

  // KPI Metrics
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.status === "ACTIVE").length;
  const monthlyCount = employees.filter(e => e.status === "ACTIVE" && e.salaryType === "MONTHLY").length;
  const wageHourlyCount = employees.filter(e => e.status === "ACTIVE" && (e.salaryType === "DAILY_WAGE" || e.salaryType === "HOURLY")).length;

  return (
    <div className="employee-mgmt-container">
      {/* 4 Top KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "20px" }}>
        <div className="kpi-card" style={{ borderLeft: "4px solid #2563eb" }}>
          <div className="kpi-head">
            <span className="kpi-title">Total Employees</span>
            <Users size={18} style={{ color: "#2563eb" }} />
          </div>
          <div className="kpi-value">{totalCount}</div>
          <div className="kpi-note">{activeCount} active in this salon</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="kpi-head">
            <span className="kpi-title">Active Staff</span>
            <UserCheck size={18} style={{ color: "#16a34a" }} />
          </div>
          <div className="kpi-value">{activeCount}</div>
          <div className="kpi-note">On payroll & daily roster</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #9333ea" }}>
          <div className="kpi-head">
            <span className="kpi-title">Monthly Salaried</span>
            <IndianRupee size={18} style={{ color: "#9333ea" }} />
          </div>
          <div className="kpi-value">{monthlyCount}</div>
          <div className="kpi-note">Fixed monthly basic salary</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: "4px solid #ea580c" }}>
          <div className="kpi-head">
            <span className="kpi-title">Daily / Hourly</span>
            <Clock size={18} style={{ color: "#ea580c" }} />
          </div>
          <div className="kpi-value">{wageHourlyCount}</div>
          <div className="kpi-note">Daily wage & hourly pay</div>
        </div>
      </div>

      {successMsg && (
        <div className="alert success" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle size={17} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Panel */}
      <section className="panel">
        <div className="employee-page-header">
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
              Staff & Employee Directory
            </h3>
            <p style={{ margin: "3px 0 0 0", fontSize: "13px", color: "#64748b" }}>
              Register and manage staff profiles, job roles, wages, and monthly payroll policies
            </p>
          </div>
          <div>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setForm({ ...initialForm, branchId: salonId || "default" });
                setEditingEmployee(null);
                setShowAddModal(true);
                setErrorMsg("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "8px",
                boxShadow: "0 2px 6px rgba(37,99,235,0.25)"
              }}
            >
              <UserPlus size={16} /> <span>+ Add / Register Employee</span>
            </button>
          </div>
        </div>

        <div className="invoices-filter-bar">
          <div className="invoices-search-status-row">
            <div className="search">
              <Search size={17} />
              <input
                type="text"
                placeholder="Search by employee name, mobile, role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch("")}>
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className="invoice-status-tabs">
              <button
                type="button"
                className={`status-tab ${statusFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                className={`status-tab active-tab ${statusFilter === "ACTIVE" ? "active" : ""}`}
                onClick={() => setStatusFilter("ACTIVE")}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                className={`status-tab voided-tab ${statusFilter === "INACTIVE" ? "active" : ""}`}
                onClick={() => setStatusFilter("INACTIVE")}
              >
                Inactive ({totalCount - activeCount})
              </button>
            </div>
          </div>

          {/* Salary Type Segmented Filter */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
            {[
              { id: "ALL", label: "All Pay Types" },
              { id: "MONTHLY", label: "Monthly Salaried" },
              { id: "DAILY_WAGE", label: "Daily Wage" },
              { id: "HOURLY", label: "Hourly Rate" }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                className={`period-chip ${salaryTypeFilter === t.id ? "active" : ""}`}
                onClick={() => setSalaryTypeFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap desktop-only-table" style={{ marginTop: "14px" }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Job Role</th>
                <th>Salary Type & Base Pay</th>
                <th>Joining Date</th>
                <th>Paid Leaves / Mo</th>
                <th>OT Rate</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length ? (
                filteredEmployees.map(emp => {
                  const isInactive = emp.status === "INACTIVE";
                  return (
                    <tr key={emp.id} style={isInactive ? { opacity: 0.65, background: "#f8fafc" } : {}}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: isInactive ? "#e2e8f0" : "#dbeafe",
                              color: isInactive ? "#64748b" : "#1d4ed8",
                              fontWeight: 700,
                              display: "grid",
                              placeItems: "center",
                              fontSize: "13px"
                            }}
                          >
                            {(emp.name || "E").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <strong>{emp.name}</strong>
                            <small style={{ display: "block", color: "#64748b" }}>
                              <a href={`tel:${emp.mobile}`} style={{ color: "inherit", textDecoration: "none" }}>
                                📱 {emp.mobile}
                              </a>
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pill" style={{ background: "#f1f5f9", color: "#334155", fontWeight: 600 }}>
                          {emp.jobRole}
                        </span>
                      </td>
                      <td>
                        <div>
                          <strong style={{ color: "#0f172a", fontSize: "13.5px" }}>
                            {money(emp.baseSalary)}
                          </strong>
                          <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>
                            {emp.salaryType === "MONTHLY" ? "per month" : emp.salaryType === "DAILY_WAGE" ? "per day" : "per hour"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: "12.5px", color: "#475569" }}>
                          {emp.joiningDate || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "11px" }}>
                          {emp.paidLeavesPerMonth} day/mo
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "#475569" }}>
                          {emp.overtimeRate > 0 ? `${money(emp.overtimeRate)}/hr` : "1.5x (Auto)"}
                        </span>
                      </td>
                      <td>
                        {emp.status === "ACTIVE" ? (
                          <span className="pill success" style={{ fontWeight: 700 }}>
                            ✓ Active
                          </span>
                        ) : (
                          <span className="pill danger" style={{ fontWeight: 700 }}>
                            Inactive
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="icon-action-btn edit-action"
                            title="Edit Employee"
                            onClick={() => openEditModal(emp)}
                          >
                            <Pencil size={15} />
                          </button>
                          {emp.status === "ACTIVE" ? (
                            <button
                              type="button"
                              className="icon-action-btn"
                              style={{ color: "#dc2626" }}
                              title="Deactivate Employee"
                              onClick={() => setConfirmDeactivate(emp)}
                            >
                              <UserX size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="icon-action-btn"
                              style={{ color: "#16a34a" }}
                              title="Reactivate Employee"
                              onClick={() => {
                                saveEmployee({ ...emp, status: "ACTIVE" }, actorInfo, salonId)
                                  .then(loadData)
                                  .catch(err => alert(err.message));
                              }}
                            >
                              <UserCheck size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="empty-cell" style={{ padding: "40px 20px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#eff6ff", color: "var(--blue)", display: "grid", placeItems: "center" }}>
                        <Users size={24} />
                      </div>
                      <strong style={{ fontSize: "15px", color: "#1e293b" }}>
                        {search ? "No matching employees found" : "No employees registered yet"}
                      </strong>
                      <p style={{ margin: 0, fontSize: "13px", color: "#64748b", maxWidth: "340px", textAlign: "center" }}>
                        {search ? "Try searching with a different name or mobile number." : "Use the '+ Add / Register Employee' button above to register your salon staff."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="mobile-only-cards mobile-card-list" style={{ marginTop: "14px" }}>
          {filteredEmployees.length ? (
            filteredEmployees.map(emp => {
              const isInactive = emp.status === "INACTIVE";
              return (
                <div
                  className="mobile-card"
                  key={emp.id}
                  style={isInactive ? { opacity: 0.7, background: "#f8fafc", borderLeft: "4px solid #94a3b8" } : { borderLeft: "4px solid #2563eb" }}
                >
                  <div className="mobile-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: isInactive ? "#e2e8f0" : "#dbeafe",
                          color: isInactive ? "#64748b" : "#1d4ed8",
                          fontWeight: 700,
                          display: "grid",
                          placeItems: "center",
                          fontSize: "12.5px"
                        }}
                      >
                        {(emp.name || "E").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="mobile-card-title">{emp.name}</h4>
                        <span className="mobile-card-sub">{emp.jobRole}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mobile-card-amount" style={{ color: "#0f172a", fontSize: "15px" }}>
                        {money(emp.baseSalary)}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        {emp.salaryType === "MONTHLY" ? "Monthly" : emp.salaryType === "DAILY_WAGE" ? "Daily" : "Hourly"}
                      </div>
                    </div>
                  </div>

                  <div className="mobile-card-body">
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      <span className={`pill ${emp.status === "ACTIVE" ? "success" : "danger"}`}>
                        {emp.status === "ACTIVE" ? "✓ Active" : "Inactive"}
                      </span>
                      <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        {emp.paidLeavesPerMonth} Paid Leave/Mo
                      </span>
                      {emp.overtimeRate > 0 && (
                        <span className="pill" style={{ background: "#fef3c7", color: "#b45309" }}>
                          OT: {money(emp.overtimeRate)}/hr
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "6px" }}>
                      📱 <a href={`tel:${emp.mobile}`} style={{ color: "inherit", textDecoration: "none" }}>{emp.mobile}</a>
                      {emp.joiningDate ? ` • Joined: ${emp.joiningDate}` : ""}
                    </div>
                  </div>

                  <div className="mobile-card-actions">
                    <button
                      type="button"
                      className="btn secondary small-btn"
                      onClick={() => openEditModal(emp)}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {emp.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="btn secondary small-btn"
                        style={{ color: "#dc2626" }}
                        onClick={() => setConfirmDeactivate(emp)}
                      >
                        <UserX size={13} /> Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary small-btn"
                        style={{ color: "#16a34a" }}
                        onClick={() => {
                          saveEmployee({ ...emp, status: "ACTIVE" }, actorInfo, salonId)
                            .then(loadData)
                            .catch(err => alert(err.message));
                        }}
                      >
                        <UserCheck size={13} /> Reactivate
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-cell">
              {loading ? "Loading..." : "No employees match your search."}
            </div>
          )}
        </div>
      </section>

      {/* Add / Edit Employee Modal */}
      {showAddModal && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !submitting) setShowAddModal(false);
          }}
        >
          <div className="modal" style={{ maxWidth: "660px", width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: "20px" }}>
            <div className="sheet-handle" />
            <div className="modal-head" style={{ paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "17px" }}>
                <UserPlus size={19} style={{ color: "var(--blue)" }} />
                <span>{editingEmployee ? "Edit Employee Details" : "Register New Employee"}</span>
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowAddModal(false)}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="alert danger" style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0 4px 0" }}>
                <AlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ overflowY: "auto", padding: "14px 2px 4px 2px", flex: 1 }}>
              <form onSubmit={handleSave} className="responsive-modal-form">
                <div className="responsive-form-grid">
                  <div className="form-group">
                    <label className="form-label">
                      Full Name <span className="req-star">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Mobile Number <span className="req-star">*</span>
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      required
                      maxLength={10}
                      placeholder="10-digit mobile"
                      value={form.mobile}
                      onChange={e => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Job Role / Designation <span className="req-star">*</span>
                    </label>
                    <select
                      className="form-control"
                      value={form.jobRole}
                      onChange={e => setForm({ ...form, jobRole: e.target.value })}
                    >
                      {jobRoles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Date of Joining <span className="req-star">*</span>
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={form.joiningDate}
                      onChange={e => setForm({ ...form, joiningDate: e.target.value })}
                    />
                  </div>

                  {/* Compensation & Salary Settings Section Card */}
                  <div className="form-group span-full">
                    <div className="modal-section-card">
                      <div className="modal-section-title">
                        💵 Compensation & Salary Settings
                      </div>

                      <div className="responsive-form-grid">
                        <div className="form-group">
                          <label className="form-label">
                            Salary Type <span className="req-star">*</span>
                          </label>
                          <select
                            className="form-control"
                            value={form.salaryType}
                            onChange={e => setForm({ ...form, salaryType: e.target.value })}
                          >
                            <option value="MONTHLY">Monthly Fixed Salary</option>
                            <option value="DAILY_WAGE">Daily Wage</option>
                            <option value="HOURLY">Hourly Rate</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            {form.salaryType === "MONTHLY"
                              ? "Monthly Basic Salary (₹)"
                              : form.salaryType === "DAILY_WAGE"
                              ? "Daily Wage Rate (₹)"
                              : "Hourly Rate (₹)"}{" "}
                            <span className="req-star">*</span>
                          </label>
                          <div className="input-with-symbol">
                            <span className="input-currency-symbol">₹</span>
                            <input
                              type="number"
                              className="form-control"
                              min="0"
                              step="any"
                              required
                              placeholder="e.g. 18000"
                              value={form.baseSalary}
                              onChange={e => setForm({ ...form, baseSalary: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            Calculation Divisor Days
                          </label>
                          <select
                            className="form-control"
                            value={form.monthlyWorkingDays}
                            onChange={e => setForm({ ...form, monthlyWorkingDays: e.target.value })}
                          >
                            <option value="30">30 Days (Standard Month)</option>
                            <option value="26">26 Days (Excluding 4 Weekly Offs)</option>
                            <option value="28">28 Days (4 Weeks)</option>
                            <option value="31">31 Days (Full Calendar)</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            Paid Leave Quota (Per Month)
                          </label>
                          <input
                            type="number"
                            className="form-control"
                            min="0"
                            max="10"
                            value={form.paidLeavesPerMonth}
                            onChange={e => setForm({ ...form, paidLeavesPerMonth: e.target.value })}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            Overtime Rate (₹ / Hour) <span className="opt-tag">(Optional)</span>
                          </label>
                          <div className="input-with-symbol">
                            <span className="input-currency-symbol">₹</span>
                            <input
                              type="number"
                              className="form-control"
                              min="0"
                              placeholder="Leave blank for 1.5x auto"
                              value={form.overtimeRate}
                              onChange={e => setForm({ ...form, overtimeRate: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label">
                            Fixed Monthly Allowance (₹) <span className="opt-tag">(Optional)</span>
                          </label>
                          <div className="input-with-symbol">
                            <span className="input-currency-symbol">₹</span>
                            <input
                              type="number"
                              className="form-control"
                              min="0"
                              placeholder="Travel, food, etc."
                              value={form.fixedAllowance}
                              onChange={e => setForm({ ...form, fixedAllowance: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="form-group span-full">
                    <label className="form-label">
                      Residential Address <span className="opt-tag">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Local address, city, flat / room no..."
                      value={form.address}
                      onChange={e => setForm({ ...form, address: e.target.value })}
                    />
                  </div>

                  <div className="form-group span-full">
                    <label className="form-label">
                      Notes & Special Terms <span className="opt-tag">(Optional)</span>
                    </label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="ID proof details, emergency contacts, remarks..."
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>

                  <div className="form-group span-full">
                    <label className="form-label">
                      Employment Status
                    </label>
                    <select
                      className="form-control"
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active (Working)</option>
                      <option value="INACTIVE">Inactive (Resigned / Terminated)</option>
                    </select>
                  </div>
                </div>

                <div className="modal-actions-footer">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setShowAddModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={submitting}
                  >
                    {submitting ? "Saving Employee..." : editingEmployee ? "Update Employee" : "Register Employee"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Deactivation Modal */}
      {confirmDeactivate && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setConfirmDeactivate(null);
          }}
        >
          <div className="modal" style={{ maxWidth: "440px" }}>
            <div className="sheet-handle" />
            <div className="modal-head">
              <h3 style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "8px" }}>
                <UserX size={19} />
                <span>Deactivate Employee?</span>
              </h3>
              <button type="button" className="icon-btn" onClick={() => setConfirmDeactivate(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: "10px 0 20px 0", fontSize: "13.5px", color: "#475569" }}>
              Are you sure you want to deactivate <strong>{confirmDeactivate.name}</strong>? They will be removed from daily attendance rosters, but their past payroll and attendance records will remain preserved.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConfirmDeactivate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ background: "#dc2626", borderColor: "#b91c1c" }}
                onClick={handleDeactivate}
              >
                Yes, Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

