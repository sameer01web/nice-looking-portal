import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  History,
  Search,
  Filter,
  Download,
  Eye,
  RefreshCw,
  Shield,
  FileText,
  AlertTriangle,
  UserCheck,
  Package,
  Layers,
  ChevronRight,
  Clock,
  User,
  X
} from "lucide-react";
import { fetchAuditLogs } from "../lib/dataService";
import { getMumbaiTodayISO, formatToLocalISODate } from "../lib/supabase";

function formatTimestamp(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });
  } catch {
    return String(isoStr);
  }
}

function ActionBadge({ action }) {
  const a = String(action || "").toUpperCase();
  if (a === "INVOICE_CREATE") {
    return <span className="pill success">➕ Created Invoice</span>;
  }
  if (a === "INVOICE_VOID") {
    return <span className="pill danger" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>🚫 Voided Invoice</span>;
  }
  if (a === "INVOICE_EDIT") {
    return <span className="pill warning" style={{ background: "#fef3c7", color: "#b45309", fontWeight: 700 }}>✏️ Edited Invoice</span>;
  }
  if (a === "INVOICE_DELETE") {
    return <span className="pill danger">🗑️ Deleted Invoice</span>;
  }
  if (a === "PRODUCT_CREATE" || a === "PRODUCT_UPDATE" || a === "STOCK_CHANGE") {
    return <span className="pill" style={{ background: "#e0f2fe", color: "#0369a1", fontWeight: 600 }}>📦 Product/Stock</span>;
  }
  if (a === "PRODUCT_DELETE") {
    return <span className="pill danger">📦 Deactivated Product</span>;
  }
  if (a === "CUSTOMER_CREATE" || a === "CUSTOMER_UPDATE") {
    return <span className="pill" style={{ background: "#f3e8ff", color: "#7e22ce" }}>👤 Customer</span>;
  }
  if (a === "USER_ROLE_CHANGE") {
    return <span className="pill" style={{ background: "#fae8ff", color: "#a21caf", fontWeight: 700 }}>🛡️ Role Changed</span>;
  }
  if (a === "STAFF_CREATE") {
    return <span className="pill" style={{ background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>👤➕ Staff Created</span>;
  }
  if (a === "SETTINGS_UPDATE") {
    return <span className="pill" style={{ background: "#f1f5f9", color: "#475569" }}>⚙️ Settings</span>;
  }
  if (a === "LOGIN") {
    return <span className="pill" style={{ background: "#ecfdf5", color: "#047857" }}>🔑 Login</span>;
  }
  return <span className="pill">{a}</span>;
}

function csvDownload(rows, filename) {
  if (!rows || !rows.length) return;
  const flat = rows.map(r => ({
    "Timestamp (IST)": formatTimestamp(r.createdAt),
    "Action": r.action,
    "Entity": r.entityType,
    "Entity ID": r.entityId || "",
    "User Name": r.userName || "",
    "User Email": r.userEmail || "",
    "User Role": r.userRole || "",
    "Details": r.details || "",
    "Reason": r.reason || ""
  }));
  const keys = Object.keys(flat[0]);
  const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    keys.map(esc).join(","),
    ...flat.map(r => keys.map(k => esc(r[k])).join(","))
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AuditLogs({ refreshTick, setHeaderAction }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [period, setPeriod] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDiff, setSelectedDiff] = useState(null);

  const todayISO = useMemo(() => getMumbaiTodayISO(), []);

  const loadData = useCallback(() => {
    setLoading(true);
    fetchAuditLogs()
      .then(data => {
        setLogs(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load audit logs:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Period filtering logic
  function checkPeriodMatch(isoStr) {
    if (!isoStr || period === "all") return true;
    const d = formatToLocalISODate(isoStr);

    if (period === "today") return d === todayISO;
    if (period === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return d === formatToLocalISODate(y);
    }
    if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= formatToLocalISODate(weekAgo) && d <= todayISO;
    }
    if (period === "month") {
      return d.startsWith(todayISO.slice(0, 7));
    }
    if (period === "custom") {
      if (customStart && d < customStart) return false;
      if (customEnd && d > customEnd) return false;
      return true;
    }
    return true;
  }

  // Filtered logs
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const st = staffSearch.toLowerCase().trim();

    return logs.filter(l => {
      // 1. Period
      if (!checkPeriodMatch(l.createdAt)) return false;

      // 2. Action filter
      if (actionFilter !== "ALL") {
        if (actionFilter === "INVOICES") {
          if (!["INVOICE_CREATE", "INVOICE_EDIT", "INVOICE_VOID", "INVOICE_DELETE"].includes(l.action)) return false;
        } else if (actionFilter === "VOIDS") {
          if (l.action !== "INVOICE_VOID") return false;
        } else if (actionFilter === "EDITS") {
          if (l.action !== "INVOICE_EDIT") return false;
        } else if (actionFilter === "PRODUCTS") {
          if (!["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE", "STOCK_CHANGE"].includes(l.action)) return false;
        } else if (actionFilter === "CUSTOMERS") {
          if (!["CUSTOMER_CREATE", "CUSTOMER_UPDATE", "CUSTOMER_DELETE"].includes(l.action)) return false;
        } else if (actionFilter === "ROLES") {
          if (!["USER_ROLE_CHANGE", "STAFF_CREATE"].includes(l.action)) return false;
        } else if (actionFilter === "LOGINS") {
          if (l.action !== "LOGIN") return false;
        } else if (l.action !== actionFilter) {
          return false;
        }
      }

      // 3. Staff Search
      if (st) {
        const staffMatch = (l.userName || "").toLowerCase().includes(st) || (l.userEmail || "").toLowerCase().includes(st);
        if (!staffMatch) return false;
      }

      // 4. Query text
      if (q) {
        const text = `${l.action} ${l.entityType} ${l.entityId || ""} ${l.details || ""} ${l.reason || ""} ${l.userName || ""} ${l.userEmail || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [logs, actionFilter, period, customStart, customEnd, staffSearch, query, todayISO]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    return {
      total: logs.length,
      created: logs.filter(l => l.action === "INVOICE_CREATE").length,
      voided: logs.filter(l => l.action === "INVOICE_VOID").length,
      edited: logs.filter(l => l.action === "INVOICE_EDIT").length,
      stock: logs.filter(l => ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE", "STOCK_CHANGE"].includes(l.action)).length
    };
  }, [logs]);

  // Header Export Button
  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn secondary small-btn"
          type="button"
          onClick={() => csvDownload(filtered, `nice-looking-audit-logs-${todayISO}.csv`)}
        >
          <Download size={14} /> Export Audit Log
        </button>
      );
    }
  }, [filtered, setHeaderAction, todayISO]);

  return (
    <>
      {/* Top Audit KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <History size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Total Events</span>
            <strong className="kpi-value">{metrics.total}</strong>
            <small className="kpi-note">Recorded audit trails</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <FileText size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Invoices Created</span>
            <strong className="kpi-value">{metrics.created}</strong>
            <small className="kpi-note">Generated bills</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#fee2e2", color: "#dc2626" }}>
            <AlertTriangle size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Invoices Voided</span>
            <strong className="kpi-value">{metrics.voided}</strong>
            <small className="kpi-note">Stock restored</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
            <Layers size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Invoices Edited</span>
            <strong className="kpi-value">{metrics.edited}</strong>
            <small className="kpi-note">Admin revisions</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f3e8ff", color: "#9333ea" }}>
            <Package size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Stock & Products</span>
            <strong className="kpi-value">{metrics.stock}</strong>
            <small className="kpi-note">Inventory actions</small>
          </div>
        </div>
      </div>

      {/* Main Filter Panel */}
      <section className="panel">
        <div className="invoices-filter-bar">
          <div className="toolbar" style={{ marginBottom: "8px", gap: "10px", flexWrap: "wrap" }}>
            <div className="search" style={{ flex: 2 }}>
              <Search size={17} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by Invoice #, description, customer, reason, or details..."
              />
            </div>

            <div className="search" style={{ flex: 1 }}>
              <User size={16} />
              <input
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                placeholder="Filter by staff name/email..."
              />
            </div>

            <select
              className="action-filter-select"
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                fontWeight: "600",
                background: "white",
                color: "#1e293b",
                cursor: "pointer"
              }}
            >
              <option value="ALL">All Action Types</option>
              <option value="INVOICES">All Invoice Actions</option>
              <option value="INVOICE_CREATE">Invoice Created</option>
              <option value="VOIDS">Invoices Voided</option>
              <option value="EDITS">Invoices Edited</option>
              <option value="PRODUCTS">Products & Stock</option>
              <option value="CUSTOMERS">Customers</option>
              <option value="ROLES">Staff & Role Changes</option>
              <option value="LOGINS">Logins</option>
            </select>
          </div>

          {/* Date Range Chips */}
          <div className="invoice-period-chips" style={{ marginTop: "4px" }}>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "This Week (7D)" },
              { id: "month", label: "This Month" },
              { id: "custom", label: "Custom Range" }
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`period-chip ${period === opt.id ? "active" : ""}`}
                onClick={() => setPeriod(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="custom-date-range-row" style={{ marginTop: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>From:</span>
              <input
                type="date"
                className="date-input"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
              />
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>To:</span>
              <input
                type="date"
                className="date-input"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
              />
              {(customStart || customEnd) && (
                <button
                  type="button"
                  className="discount-chip clear-chip"
                  onClick={() => {
                    setCustomStart("");
                    setCustomEnd("");
                  }}
                >
                  Reset Range
                </button>
              )}
            </div>
          )}

          {/* Result Count Banner */}
          <div className="invoices-summary-strip" style={{ marginTop: "12px" }}>
            <div className="summary-strip-left">
              <span className="summary-badge-main">
                <strong>{filtered.length}</strong> {filtered.length === 1 ? "audit log record" : "audit log records"} found
              </span>
            </div>
            <div className="summary-strip-right">
              <span className="summary-sub-badge" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                🛡️ Tamper-Proof Audit Trail
              </span>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        {loading ? (
          <div className="empty" style={{ padding: "40px" }}>
            <RefreshCw size={24} className="spin-icon" />
            <p>Loading audit logs...</p>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="table-wrap desktop-only-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "160px" }}>Date & Time</th>
                    <th>Action</th>
                    <th>Performed By</th>
                    <th>Details & Description</th>
                    <th>Reason / Notes</th>
                    <th style={{ textAlign: "right", width: "100px" }}>Data Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: "12px", color: "#475569", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>
                          {formatTimestamp(log.createdAt).split(",")[0]}
                        </div>
                        <small style={{ color: "#64748b" }}>
                          {formatTimestamp(log.createdAt).split(",")[1]}
                        </small>
                      </td>

                      <td>
                        <ActionBadge action={log.action} />
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{log.userName || "Staff"}</div>
                        <small style={{ color: "#64748b" }}>{log.userEmail || "—"}</small>
                        {log.userRole && (
                          <span
                            className="role-pill-mini"
                            style={{
                              marginLeft: "6px",
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              fontWeight: 700,
                              background: log.userRole === "admin" ? "#eff6ff" : "#f1f5f9",
                              color: log.userRole === "admin" ? "#1d4ed8" : "#475569"
                            }}
                          >
                            {log.userRole.toUpperCase()}
                          </span>
                        )}
                      </td>

                      <td>
                        <div style={{ fontWeight: 500, color: "#334155" }}>
                          {log.details || `Action performed on ${log.entityType} (${log.entityId || "N/A"})`}
                        </div>
                      </td>

                      <td>
                        {log.reason ? (
                          <span className="audit-reason-badge">
                            "{log.reason}"
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        {(log.oldData || log.newData) ? (
                          <button
                            type="button"
                            className="btn secondary small-btn"
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                            onClick={() => setSelectedDiff(log)}
                            title="View Old vs New Values"
                          >
                            <Eye size={13} /> View Diff
                          </button>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-only-cards mobile-card-list">
              {filtered.map(log => (
                <div className="mobile-card" key={log.id}>
                  <div className="mobile-card-header">
                    <div>
                      <ActionBadge action={log.action} />
                    </div>
                    <div className="mobile-card-date" style={{ fontSize: "11px" }}>
                      {formatTimestamp(log.createdAt)}
                    </div>
                  </div>

                  <div className="mobile-card-body" style={{ marginTop: "6px" }}>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                      {log.details || `${log.action} on ${log.entityType}`}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      By: <strong>{log.userName || "Staff"}</strong> ({log.userRole || "staff"})
                    </div>
                    {log.reason && (
                      <div className="audit-reason-badge" style={{ marginTop: "6px" }}>
                        Reason: "{log.reason}"
                      </div>
                    )}
                  </div>

                  {(log.oldData || log.newData) && (
                    <div className="mobile-card-actions" style={{ marginTop: "8px" }}>
                      <button
                        type="button"
                        className="btn secondary full small-btn"
                        onClick={() => setSelectedDiff(log)}
                      >
                        <Eye size={14} /> View Change Diff
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <History size={32} />
            <strong>No audit logs found</strong>
            <p>No actions match your selected filter criteria.</p>
          </div>
        )}
      </section>

      {/* Change Diff Inspection Modal */}
      {selectedDiff && (
        <div className="modal-backdrop" onClick={() => setSelectedDiff(null)}>
          <div className="modal-card" style={{ maxWidth: "680px" }} onClick={e => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <ActionBadge action={selectedDiff.action} />
                <h3 style={{ margin: 0 }}>Audit Change Inspection</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedDiff(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="audit-diff-meta" style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", marginBottom: "14px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", fontSize: "12px" }}>
                  <div>
                    <span style={{ color: "#64748b" }}>Timestamp: </span>
                    <strong>{formatTimestamp(selectedDiff.createdAt)}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Performed By: </span>
                    <strong>{selectedDiff.userName} ({selectedDiff.userRole})</strong>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>User Email: </span>
                    <span>{selectedDiff.userEmail || "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#64748b" }}>Entity ID: </span>
                    <span>{selectedDiff.entityId || "—"}</span>
                  </div>
                  {selectedDiff.reason && (
                    <div style={{ gridColumn: "1 / -1", marginTop: "4px" }}>
                      <span style={{ color: "#64748b" }}>Reason: </span>
                      <strong style={{ color: "#b91c1c" }}>"{selectedDiff.reason}"</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="diff-comparison-grid">
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#b91c1c", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>🔴 Previous State (Old Data)</span>
                  </div>
                  <pre
                    style={{
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "11px",
                      color: "#9f1239",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {selectedDiff.oldData ? JSON.stringify(selectedDiff.oldData, null, 2) : "No previous record"}
                  </pre>
                </div>

                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>🟢 Updated State (New Data)</span>
                  </div>
                  <pre
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "11px",
                      color: "#166534",
                      overflowX: "auto",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {selectedDiff.newData ? JSON.stringify(selectedDiff.newData, null, 2) : "No new record"}
                  </pre>
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => setSelectedDiff(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
