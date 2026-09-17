import React, { useState, useEffect, useCallback } from "react";
import {
  UserCheck,
  Shield,
  User,
  UserPlus,
  Plus,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Search,
  Check,
  X
} from "lucide-react";
import { fetchStaffUsers, updateStaffRole, createStaffUser } from "../lib/dataService";
import { formatToLocalISODate } from "../lib/supabase";

export default function StaffManagement({ refreshTick, onDataChanged, actorInfo }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create Staff Form State
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffConfirmPassword, setNewStaffConfirmPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadUsers = useCallback(() => {
    setLoading(true);
    setErrorMsg("");
    fetchStaffUsers()
      .then(data => {
        setUsers(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load staff users:", err);
        setErrorMsg("Could not load users list: " + err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshTick]);

  async function handleCreateStaff(e) {
    e.preventDefault();
    setCreateError("");

    if (!newStaffName.trim()) {
      setCreateError("Full Name is required.");
      return;
    }
    if (!newStaffEmail.trim()) {
      setCreateError("Email is required.");
      return;
    }
    if (!newStaffPassword || newStaffPassword.length < 6) {
      setCreateError("Password must be at least 6 characters long.");
      return;
    }
    if (newStaffPassword !== newStaffConfirmPassword) {
      setCreateError("Passwords do not match. Please enter identical passwords.");
      return;
    }

    setCreating(true);
    try {
      await createStaffUser(newStaffEmail, newStaffPassword, newStaffName, actorInfo);
      setSuccessMsg(`Staff account for "${newStaffName.trim()}" (${newStaffEmail.trim()}) created successfully with Role: Staff.`);
      setShowCreateModal(false);
      setNewStaffName("");
      setNewStaffEmail("");
      setNewStaffPassword("");
      setNewStaffConfirmPassword("");
      loadUsers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Staff creation failed:", err);
      setCreateError(err.message || "Failed to create staff account.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(user, targetRole) {
    setSavingId(user.id);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await updateStaffRole(user.id, targetRole, actorInfo);
      setSuccessMsg(`Role for ${user.full_name || user.email} updated to ${targetRole === "admin" ? "OWNER / ADMIN" : "STAFF"} successfully.`);
      setConfirmModal(null);
      loadUsers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Role update failed:", err);
      setErrorMsg(err.message || "Failed to update role.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  });

  const adminCount = users.filter(u => u.role === "admin" || u.role === "owner").length;
  const staffCount = users.filter(u => u.role === "staff").length;

  return (
    <>
      {/* Top Stats */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <UserCheck size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Total Staff Accounts</span>
            <strong className="kpi-value">{users.length}</strong>
            <small className="kpi-note">Active portal accounts</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
            <Shield size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Owner / Administrators</span>
            <strong className="kpi-value">{adminCount}</strong>
            <small className="kpi-note">Full control permissions</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <User size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Reception Staff</span>
            <strong className="kpi-value">{staffCount}</strong>
            <small className="kpi-note">Controlled access</small>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="alert success-box" style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe", marginBottom: "16px" }}>
          {successMsg}
        </div>
      )}

      <div className="grid-2" style={{ alignItems: "start" }}>
        {/* User Accounts List */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Staff Management</h3>
              <p>Create staff accounts and manage permissions</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn primary small-btn"
                type="button"
                onClick={() => {
                  setCreateError("");
                  setShowCreateModal(true);
                }}
              >
                <Plus size={15} /> Create Staff Account
              </button>
              <button
                className="icon-btn"
                title="Refresh Staff List"
                type="button"
                onClick={loadUsers}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="toolbar" style={{ marginBottom: "12px" }}>
            <div className="search">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search staff by name, email, or role..."
              />
            </div>
          </div>

          {loading ? (
            <div className="empty" style={{ padding: "30px" }}>
              <RefreshCw size={24} className="spin-icon" />
              <p>Loading accounts...</p>
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User / Name</th>
                    <th>Email</th>
                    <th>Current Role</th>
                    <th style={{ textAlign: "right" }}>Assign Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => {
                    const isAdmin = user.role === "admin" || user.role === "owner";

                    return (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.full_name || "Staff Member"}</strong>
                          <small>Joined: {user.created_at ? formatToLocalISODate(user.created_at) : "—"}</small>
                        </td>

                        <td style={{ fontSize: "12px", color: "#475569" }}>
                          {user.email || "No Email"}
                        </td>

                        <td>
                          {isAdmin ? (
                            <span className="pill" style={{ background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>
                              🛡️ Owner / Admin
                            </span>
                          ) : (
                            <span className="pill" style={{ background: "#f1f5f9", color: "#475569", fontWeight: 600 }}>
                              👤 Staff
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="btn secondary small-btn"
                              disabled={savingId === user.id}
                              onClick={() => setConfirmModal({ user, targetRole: "staff" })}
                              title="Demote to Reception Staff"
                            >
                              Demote to Staff
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn primary small-btn"
                              disabled={savingId === user.id}
                              onClick={() => setConfirmModal({ user, targetRole: "admin" })}
                              title="Promote to Administrator"
                            >
                              Promote to Admin
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <User size={28} />
              <strong>No user accounts found</strong>
            </div>
          )}
        </section>

        {/* Permissions Matrix Reference */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Security & Role Permissions Matrix</h3>
              <p>Strictly enforced by UI & Database RLS</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="compact-table" style={{ fontSize: "12px" }}>
              <thead>
                <tr>
                  <th>Portal Feature</th>
                  <th style={{ textAlign: "center" }}>Reception Staff</th>
                  <th style={{ textAlign: "center" }}>Owner / Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Create Invoices</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>View & Filter Invoices</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Void Invoice (with mandatory reason)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Edit Invoice Amount / Payment</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Blocked)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /> (Logged)</td>
                </tr>
                <tr>
                  <td>Permanent Invoice Deletion</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Blocked)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /> (Logged)</td>
                </tr>
                <tr>
                  <td>View Wig Stock</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /> (Read-only)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Modify Products / Direct Stock</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Blocked)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Customers (Add / Update)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Delete Customer Profile</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Blocked)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Financial Sales Reports</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Hidden)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Immutable Audit Logs</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Hidden)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Staff Management</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Hidden)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
                <tr>
                  <td>Settings & Shop Configuration</td>
                  <td style={{ textAlign: "center", color: "#dc2626" }}><X size={16} /> (Hidden)</td>
                  <td style={{ textAlign: "center", color: "#16a34a" }}><Check size={16} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Create Staff Account Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <UserPlus size={20} style={{ color: "var(--blue)" }} />
                <h3 style={{ margin: 0 }}>Create Staff Account</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                disabled={creating}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStaff}>
              <div style={{ marginTop: "12px" }}>
                {createError && (
                  <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "12px", fontSize: "13px" }}>
                    {createError}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <label>
                    Full Name *
                    <input
                      required
                      value={newStaffName}
                      onChange={e => setNewStaffName(e.target.value)}
                      placeholder="e.g. Ramesh Kulkarni"
                    />
                  </label>

                  <label>
                    Email Address *
                    <input
                      type="email"
                      required
                      value={newStaffEmail}
                      onChange={e => setNewStaffEmail(e.target.value)}
                      placeholder="staff@nicelooking.com"
                    />
                  </label>

                  <label>
                    Password * (Min 6 characters)
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newStaffPassword}
                      onChange={e => setNewStaffPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </label>

                  <label>
                    Confirm Password *
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newStaffConfirmPassword}
                      onChange={e => setNewStaffConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </label>

                  <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>Assigned Role:</span>
                      <span className="pill" style={{ background: "#f1f5f9", color: "#475569", fontWeight: 700 }}>
                        👤 Staff (Reception)
                      </span>
                    </div>
                    <small style={{ display: "block", marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                      Role is securely assigned by backend database. Staff can create invoices, manage customers, and view wig stock.
                    </small>
                  </div>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={creating || !newStaffName || !newStaffEmail || !newStaffPassword || !newStaffConfirmPassword}
                >
                  {creating ? "Creating Staff..." : "Create Staff Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {confirmModal && (
        <div className="modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle"></div>
            <div className="modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={20} style={{ color: "var(--blue)" }} />
                <h3 style={{ margin: 0 }}>Confirm Role Change</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setConfirmModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "14px", color: "#1e293b", lineHeight: 1.5 }}>
                Are you sure you want to change the role of{" "}
                <strong>{confirmModal.user.full_name || confirmModal.user.email}</strong> to{" "}
                <strong style={{ color: confirmModal.targetRole === "admin" ? "#1d4ed8" : "#475569" }}>
                  {confirmModal.targetRole === "admin" ? "OWNER / ADMIN" : "STAFF"}
                </strong>?
              </p>
              {confirmModal.targetRole === "admin" ? (
                <div className="consent-note" style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
                  This user will gain full access to view audit logs, modify inventory, view financial reports, and edit settings.
                </div>
              ) : (
                <div className="consent-note" style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fde68a" }}>
                  This user will be restricted to reception tasks (billing, customer creation, voiding with reason). Financial reports, stock edits, and audit logs will be hidden.
                </div>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => handleRoleChange(confirmModal.user, confirmModal.targetRole)}
              >
                Confirm Role Update
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
