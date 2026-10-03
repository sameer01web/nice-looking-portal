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
  X,
  Building2,
  Crown,
  Key,
  Copy,
  Trash2,
  MapPin,
  Tag
} from "lucide-react";
import { fetchStaffUsers, updateStaffRole, createStaffUser, deleteStaffUser } from "../lib/dataService";
import { formatToLocalISODate, getAppBaseUrl } from "../lib/supabase";

export default function StaffManagement({
  refreshTick,
  onDataChanged,
  actorInfo,
  currentSalon,
  availableSalons = []
}) {
  const isSuperAdmin = actorInfo?.role === "superadmin";
  const isOwner = actorInfo?.role === "owner";
  const activeBranchId = currentSalon?.id || actorInfo?.salonId || "default";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState("");
  // Default to currently active branch selected in top bar
  const [salonFilter, setSalonFilter] = useState(activeBranchId);
  const [confirmModal, setConfirmModal] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create Staff Form State
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffConfirmPassword, setNewStaffConfirmPassword] = useState("");
  const [newStaffSalonId, setNewStaffSalonId] = useState(activeBranchId);
  const [newStaffRole, setNewStaffRole] = useState("staff");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Credentials Share Modal
  const [credentialsModal, setCredentialsModal] = useState(null);
  const [copied, setCopied] = useState(false);

  // Synchronize filter and creation branch whenever active salon in top bar changes
  useEffect(() => {
    if (currentSalon?.id) {
      setSalonFilter(currentSalon.id);
      setNewStaffSalonId(currentSalon.id);
    }
  }, [currentSalon?.id]);

  // Non-superadmin is strictly locked to their own salon
  const effectiveFilter = !isSuperAdmin ? activeBranchId : salonFilter;

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let rand = "";
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `NL@${rand}!`;
  }

  const loadUsers = useCallback(() => {
    setLoading(true);
    setErrorMsg("");
    const filterId = effectiveFilter === "all" ? null : effectiveFilter;
    fetchStaffUsers(filterId)
      .then(data => {
        setUsers(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load staff users:", err);
        setErrorMsg("Could not load users list: " + err.message);
        setLoading(false);
      });
  }, [effectiveFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshTick]);

  function openCreateModal() {
    setCreateError("");
    setNewStaffName("");
    setNewStaffEmail("");
    const pwd = generateRandomPassword();
    setNewStaffPassword(pwd);
    setNewStaffConfirmPassword(pwd);
    setNewStaffSalonId(currentSalon?.id || (effectiveFilter !== "all" ? effectiveFilter : "default"));
    setNewStaffRole(isSuperAdmin ? "owner" : "staff");
    setForcePasswordChange(true);
    setShowCreateModal(true);
  }

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

    const targetSalonId = !isSuperAdmin ? activeBranchId : newStaffSalonId;

    setCreating(true);
    try {
      await createStaffUser(
        newStaffEmail,
        newStaffPassword,
        newStaffName,
        actorInfo,
        targetSalonId,
        newStaffRole,
        forcePasswordChange
      );

      const targetSalon = availableSalons.find(s => s.id === targetSalonId);

      setCredentialsModal({
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        tempPassword: newStaffPassword,
        role: newStaffRole === "admin" ? "Branch Admin (🛡️)" : newStaffRole === "owner" ? "Salon Owner (⭐)" : newStaffRole === "superadmin" ? "Super Admin (👑)" : "Staff / Reception (👤)",
        salonName: targetSalon?.name || (targetSalonId === "default" ? "Bandra Main" : targetSalonId)
      });

      setSuccessMsg(`Account for "${newStaffName.trim()}" (${newStaffEmail.trim()}) created for branch "${targetSalon?.name || targetSalonId}" successfully.`);
      setShowCreateModal(false);
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
      await updateStaffRole(user.id, targetRole, actorInfo, user.salon_id || user.salonId);
      setSuccessMsg(`Role for ${user.full_name || user.fullName || user.email} updated to ${targetRole.toUpperCase()} successfully.`);
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

  async function handleDeleteUser(user) {
    const displayName = user.full_name || user.fullName || user.email;
    if (!window.confirm(`Are you sure you want to remove account for "${displayName}"?`)) {
      return;
    }
    try {
      await deleteStaffUser(user.id, actorInfo);
      setSuccessMsg(`Account for "${displayName}" removed successfully.`);
      loadUsers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setErrorMsg("Failed to remove staff account: " + err.message);
    }
  }

  function copyCredentialsToClipboard() {
    if (!credentialsModal) return;
    const loginUrl = getAppBaseUrl();
    const text = `💈 NICE LOOKING PORTAL — LOGIN CREDENTIALS 💈\n\n🏢 Assigned Branch: ${credentialsModal.salonName}\n👤 Name: ${credentialsModal.name}\n✉️ Login ID: ${credentialsModal.email}\n🔑 Temporary Password: ${credentialsModal.tempPassword}\n🛡️ Access Role: ${credentialsModal.role}\n🌐 Portal Login URL: ${loginUrl}\n\n⚠️ NOTE: On first login, you must change this temporary password to your permanent password.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Branch-Isolated Filtering:
  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase().trim();
    const userSalon = u.salon_id || u.salonId || "default";
    const userAssigned = Array.isArray(u.assigned_salons) ? u.assigned_salons : (Array.isArray(u.assignedSalons) ? u.assignedSalons : [userSalon]);
    const isSuper = u.role === "superadmin";

    let salonMatch = false;
    if (effectiveFilter === "all") {
      salonMatch = true;
    } else {
      salonMatch = userSalon === effectiveFilter || userAssigned.includes(effectiveFilter) || (isSuper && isSuperAdmin);
    }

    if (!salonMatch) return false;
    if (!q) return true;
    const name = (u.full_name || u.fullName || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    const role = (u.role || "").toLowerCase();
    return name.includes(q) || email.includes(q) || role.includes(q);
  });

  const superCount = filteredUsers.filter(u => u.role === "superadmin").length;
  const ownerCount = filteredUsers.filter(u => u.role === "owner").length;
  const adminCount = filteredUsers.filter(u => u.role === "admin").length;
  const staffCount = filteredUsers.filter(u => u.role === "staff" || !u.role).length;

  const currentFilteredSalonObj = availableSalons.find(s => s.id === effectiveFilter);
  const currentBranchName = currentFilteredSalonObj?.name || (effectiveFilter === "all" ? "All Salon Branches" : (currentSalon?.name || "Active Branch"));

  return (
    <>
      {/* Active Branch Context Banner */}
      <div className="staff-branch-context-banner">
        <div className="staff-context-left">
          <div className="staff-context-icon">
            <Building2 size={20} />
          </div>
          <div>
            <div className="staff-context-title">
              {effectiveFilter === "all" ? "🏢 Global Platform View — All Branches" : `🏢 Viewing Branch: ${currentBranchName}`}
            </div>
            <div className="staff-context-sub">
              {effectiveFilter === "all"
                ? `Displaying accounts across all ${availableSalons.length} registered salon businesses.`
                : `Showing isolated staff & owner accounts assigned specifically to ${currentBranchName} (${currentFilteredSalonObj?.invoice_prefix || currentSalon?.invoice_prefix || "NL"}).`}
            </div>
          </div>
        </div>

        {isSuperAdmin && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {effectiveFilter !== "all" ? (
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() => setSalonFilter("all")}
                style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                🏢 View All Branches ({availableSalons.length})
              </button>
            ) : (
              <button
                type="button"
                className="btn secondary small-btn"
                onClick={() => setSalonFilter(currentSalon?.id || "default")}
                style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                📍 Filter to {currentSalon?.name || "Active Branch"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Top Stats Scoped to Current Branch / Selection */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <UserCheck size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Accounts in Scope</span>
            <strong className="kpi-value">{filteredUsers.length}</strong>
            <small className="kpi-note">{effectiveFilter === "all" ? "All branches combined" : currentBranchName}</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
            <Crown size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Owners & Admins</span>
            <strong className="kpi-value">{superCount + ownerCount}</strong>
            <small className="kpi-note">{ownerCount} Salon Owners, {superCount} Super Admins</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
            <Shield size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Branch Managers</span>
            <strong className="kpi-value">{adminCount}</strong>
            <small className="kpi-note">Branch Admins</small>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <User size={20} />
          </div>
          <div className="kpi-body">
            <span className="kpi-label">Reception Staff</span>
            <strong className="kpi-value">{staffCount}</strong>
            <small className="kpi-note">Front desk operators</small>
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

      {/* Staff & User Management Main Panel */}
      <section className="panel" style={{ marginBottom: "24px" }}>
        <div className="panel-head">
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <UserCheck size={22} color="#2563eb" /> Staff & User Management
            </h3>
            <p>
              {isOwner
                ? `Manage staff accounts and temporary passwords for ${currentSalon?.name || "your salon"}`
                : `Manage branch credentials, multi-salon assignments, and RBAC roles for ${currentBranchName}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn primary"
              type="button"
              onClick={openCreateModal}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <UserPlus size={16} /> Create Staff / Owner Account
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

        {/* Filter Toolbar: Search & Branch Selector */}
        <div className="staff-toolbar">
          <div className="search-box" style={{ flex: 1, minWidth: "240px", position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: "36px", width: "100%", height: "42px", borderRadius: "10px" }}
            />
          </div>

          {availableSalons.length > 0 && isSuperAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Building2 size={16} style={{ color: "#64748b" }} />
              <select
                value={salonFilter}
                onChange={e => setSalonFilter(e.target.value)}
                className="staff-salon-select"
                title="Filter accounts by specific branch"
              >
                <option value="all">🏢 All Salon Branches ({availableSalons.length})</option>
                {availableSalons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.invoice_prefix || "NL"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: "12px", color: "#2563eb" }} />
            <div>Loading accounts for {currentBranchName}...</div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>
            <User size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
            <div style={{ fontWeight: 600, fontSize: "15px", color: "#334155" }}>
              No accounts found in {currentBranchName}
            </div>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>
              Click <strong>"Create Staff / Owner Account"</strong> above to provision an account for this branch.
            </p>
          </div>
        ) : (
          <div className="staff-cards-grid">
            {filteredUsers.map(user => {
              const isSuper = user.role === "superadmin";
              const isOwnerUser = user.role === "owner";
              const isAdminRole = user.role === "admin";
              const isSelf = user.id === actorInfo?.id;
              const isTemp = Boolean(user.must_change_password || user.mustChangePassword);
              const userSalonId = user.salon_id || user.salonId || "default";
              const salonObj = availableSalons.find(s => s.id === userSalonId);
              const userSalonName = isSuper
                ? "Global Platform Admin"
                : (salonObj?.name || (userSalonId === "default" ? "NICE LOOKING (Bandra Flagship)" : userSalonId));
              const displayName = user.full_name || user.fullName || user.email?.split("@")[0] || "Staff Member";
              const initials = (displayName || "S").slice(0, 2).toUpperCase();

              // Role Theme Configuration
              const roleConfig = isSuper
                ? { label: "SUPER ADMIN", icon: "👑", themeClass: "role-theme-super", avatarBg: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)" }
                : isOwnerUser
                ? { label: "SALON OWNER", icon: "⭐", themeClass: "role-theme-owner", avatarBg: "linear-gradient(135deg, #c026d3 0%, #9333ea 100%)" }
                : isAdminRole
                ? { label: "BRANCH ADMIN", icon: "🛡️", themeClass: "role-theme-admin", avatarBg: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" }
                : { label: "STAFF / RECEPTION", icon: "👤", themeClass: "role-theme-staff", avatarBg: "linear-gradient(135deg, #059669 0%, #0d9488 100%)" };

              return (
                <div key={user.id} className={`staff-grid-card ${roleConfig.themeClass}`}>
                  {/* Card Header: Avatar, Name, Role Badges */}
                  <div className="staff-card-header">
                    <div className="staff-avatar-box" style={{ background: roleConfig.avatarBg }}>
                      {initials}
                    </div>
                    <div className="staff-title-box">
                      <div className="staff-name-row">
                        <strong className="staff-display-name" title={displayName}>{displayName}</strong>
                        {isSelf && <span className="staff-self-pill">You</span>}
                      </div>
                      <div className="staff-badge-row">
                        <span className={`staff-role-pill ${roleConfig.themeClass}`}>
                          <span>{roleConfig.icon}</span> {roleConfig.label}
                        </span>
                        {isTemp && (
                          <span className="staff-temp-pill" title="Temporary password active - user must set permanent password on first login">
                            <Key size={11} /> Temp Pwd
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Body: Details & Branch Tag */}
                  <div className="staff-card-body">
                    <div className="staff-meta-row">
                      <span className="staff-meta-icon">✉️</span>
                      <span className="staff-meta-text" title={user.email}>{user.email || "No email assigned"}</span>
                    </div>

                    <div className="staff-meta-row">
                      <span className="staff-meta-icon">🏢</span>
                      <span className="staff-meta-text staff-branch-text" title={userSalonName}>
                        {isSuper ? (
                          <span style={{ color: "#7c3aed", fontWeight: 700 }}>👑 Global Platform (All Branches)</span>
                        ) : (
                          <span>
                            Branch: <strong>{userSalonName}</strong> {salonObj?.invoice_prefix ? `(${salonObj.invoice_prefix})` : ""}
                          </span>
                        )}
                      </span>
                    </div>

                    {user.created_at && (
                      <div className="staff-meta-row">
                        <span className="staff-meta-icon">📅</span>
                        <span className="staff-meta-text">Joined {formatToLocalISODate(user.created_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Role Selection & Deletion */}
                  <div className="staff-card-footer">
                    <div className="staff-role-control">
                      <label className="staff-control-label">Role:</label>
                      <select
                        className="staff-card-select"
                        value={user.role || "staff"}
                        disabled={isSelf || savingId === user.id || (!isSuperAdmin && (isOwnerUser || user.role === "superadmin"))}
                        onChange={e => {
                          const newRole = e.target.value;
                          setConfirmModal({
                            user,
                            targetRole: newRole
                          });
                        }}
                      >
                        {isSuperAdmin && <option value="superadmin">👑 Super Admin</option>}
                        {isSuperAdmin && <option value="owner">⭐ Salon Owner</option>}
                        <option value="admin">🛡️ Branch Admin</option>
                        <option value="staff">👤 Reception / Staff</option>
                      </select>
                    </div>

                    {!isSelf && !isSuper && (
                      <button
                        type="button"
                        className="staff-card-delete-btn"
                        title="Remove Account"
                        onClick={() => handleDeleteUser(user)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Enterprise RBAC Hierarchy Reference Cards (4-Column Layout) */}
      <section className="panel" style={{ marginTop: "16px" }}>
        <div className="panel-head" style={{ marginBottom: "16px" }}>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield size={20} color="#7c3aed" /> Enterprise RBAC & Multi-Salon Boundaries
            </h3>
            <p>Role permissions, capabilities, and branch data isolation boundaries</p>
          </div>
        </div>

        <div className="rbac-cards-grid">
          {/* Level 1: Super Admin */}
          <div className="rbac-info-card rbac-card-super">
            <div className="rbac-card-header">
              <div className="rbac-card-icon">👑</div>
              <div>
                <h4>Super Admin</h4>
                <span className="rbac-sub">Platform Administrator</span>
              </div>
            </div>
            <ul className="rbac-feature-list">
              <li>Full platform oversight across all salon branches</li>
              <li>Create branches & provision Salon Owner accounts</li>
              <li>Switch between branch views seamlessly</li>
              <li>Manage all users, roles & system audit logs</li>
            </ul>
          </div>

          {/* Level 2: Salon Owner */}
          <div className="rbac-info-card rbac-card-owner">
            <div className="rbac-card-header">
              <div className="rbac-card-icon">⭐</div>
              <div>
                <h4>Salon Owner</h4>
                <span className="rbac-sub">Business Owner</span>
              </div>
            </div>
            <ul className="rbac-feature-list">
              <li>Full control over assigned salon branch only</li>
              <li>Provision branch staff accounts & temporary passwords</li>
              <li>Isolated billing series, products & customer base</li>
              <li>Cannot view or alter accounts of other salons</li>
            </ul>
          </div>

          {/* Level 3: Branch Admin */}
          <div className="rbac-info-card rbac-card-admin">
            <div className="rbac-card-header">
              <div className="rbac-card-icon">🛡️</div>
              <div>
                <h4>Branch Admin</h4>
                <span className="rbac-sub">Branch Manager</span>
              </div>
            </div>
            <ul className="rbac-feature-list">
              <li>Manage branch daily operations & inventory</li>
              <li>Maintain customer records & stock quantities</li>
              <li>Void invoices with mandatory audit trail reason</li>
              <li>Review daily branch financial summaries</li>
            </ul>
          </div>

          {/* Level 4: Staff / Reception */}
          <div className="rbac-info-card rbac-card-staff">
            <div className="rbac-card-header">
              <div className="rbac-card-icon">👤</div>
              <div>
                <h4>Reception / Staff</h4>
                <span className="rbac-sub">Front Desk Operations</span>
              </div>
            </div>
            <ul className="rbac-feature-list">
              <li>Generate customer invoices and service bills</li>
              <li>Send WhatsApp & Web3Forms digital email receipts</li>
              <li>View live stock availability & service catalog</li>
              <li>Strictly scoped to assigned branch location</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Role Change Confirmation Modal */}
      {confirmModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Confirm Role Change</h3>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setConfirmModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to change the role for{" "}
                <strong>{confirmModal.user.full_name || confirmModal.user.email}</strong> to{" "}
                <strong style={{ textTransform: "uppercase" }}>{confirmModal.targetRole}</strong>?
              </p>
            </div>
            <div className="modal-foot">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => handleRoleChange(confirmModal.user, confirmModal.targetRole)}
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Staff / Owner Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "560px" }}>
            <div className="modal-head">
              <h3>Create Staff / Owner Account</h3>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateStaff}>
              <div className="modal-body">
                {createError && (
                  <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "12px", fontSize: "13px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>⚠️ {createError}</div>
                    {(createError.toLowerCase().includes("database error") || createError.toLowerCase().includes("trigger") || createError.toLowerCase().includes("saving new user")) && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #fca5a5", fontSize: "12px", color: "#7f1d1d" }}>
                        💡 <strong>Quick Fix:</strong> Copy and run the SQL from <code>supabase/FIX_STAFF_CREATION.sql</code> in your <strong>Supabase Dashboard &rarr; SQL Editor</strong> to enable staff creation.
                      </div>
                    )}
                  </div>
                )}

                <label>
                  Full Name *
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priya Sharma or Rohit Verma"
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                  />
                </label>

                <label>
                  Email Address (User ID) *
                  <input
                    type="email"
                    required
                    placeholder="e.g. priya.pune@nicelooking.com"
                    value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                  />
                </label>

                <div className="grid-2">
                  <label>
                    Assign Salon Branch *
                    <select
                      value={newStaffSalonId}
                      onChange={e => setNewStaffSalonId(e.target.value)}
                      disabled={!isSuperAdmin}
                    >
                      {availableSalons.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.invoice_prefix || "NL"})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Role / Access Level *
                    <select
                      value={newStaffRole}
                      onChange={e => setNewStaffRole(e.target.value)}
                    >
                      {isSuperAdmin && <option value="owner">⭐ Salon Owner</option>}
                      {isSuperAdmin && <option value="superadmin">👑 Super Admin</option>}
                      <option value="admin">🛡️ Branch Admin</option>
                      <option value="staff">👤 Staff / Reception</option>
                    </select>
                  </label>
                </div>

                <div className="grid-2">
                  <label>
                    Temporary Password *
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      <input
                        type="text"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={newStaffPassword}
                        onChange={e => {
                          setNewStaffPassword(e.target.value);
                          setNewStaffConfirmPassword(e.target.value);
                        }}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn secondary small-btn"
                        title="Generate Random Password"
                        onClick={() => {
                          const p = generateRandomPassword();
                          setNewStaffPassword(p);
                          setNewStaffConfirmPassword(p);
                        }}
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </label>

                  <label>
                    Confirm Password *
                    <input
                      type="text"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={newStaffConfirmPassword}
                      onChange={e => setNewStaffConfirmPassword(e.target.value)}
                      style={{ marginTop: "4px" }}
                    />
                  </label>
                </div>

                <div className="checkbox-row" style={{ marginTop: "6px" }}>
                  <input
                    type="checkbox"
                    id="forceStaffPwd"
                    checked={forcePasswordChange}
                    onChange={e => setForcePasswordChange(e.target.checked)}
                  />
                  <label htmlFor="forceStaffPwd">
                    Require user to change password on first login
                  </label>
                </div>
              </div>

              <div className="modal-foot">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={creating}
                >
                  {creating ? "Creating Account..." : "Create Account & Generate Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Share Modal */}
      {credentialsModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "540px" }}>
            <div className="modal-head">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <CheckCircle size={20} style={{ color: "#16a34a" }} />
                <h3>Login Credentials Generated</h3>
              </div>
              <button className="icon-btn" type="button" onClick={() => setCredentialsModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px" }}>
                The account has been created successfully. Share these temporary credentials with the user:
              </p>

              <div className="credentials-share-box">
                <div className="credential-row">
                  <span className="credential-label">🏢 Assigned Branch</span>
                  <span className="credential-value">{credentialsModal.salonName}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">👤 User Name</span>
                  <span className="credential-value">{credentialsModal.name}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">✉️ Login Email (User ID)</span>
                  <span className="credential-value">{credentialsModal.email}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">🔑 Temporary Password</span>
                  <span className="credential-value" style={{ color: "#d97706", fontSize: "14px" }}>
                    {credentialsModal.tempPassword}
                  </span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">🛡️ Role</span>
                  <span className="credential-value">{credentialsModal.role}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">🌐 Portal Login URL</span>
                  <span className="credential-value" style={{ fontSize: "12px" }}>{getAppBaseUrl()}</span>
                </div>
              </div>

              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#b45309" }}>
                🔒 <strong>First-Time Security Policy:</strong> When the user logs in for the first time, they will be prompted to replace this temporary password with their permanent password.
              </div>
            </div>

            <div className="modal-foot">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setCredentialsModal(null)}
              >
                Close
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={copyCredentialsToClipboard}
              >
                {copied ? (
                  <>
                    <Check size={16} /> Credentials Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Copy Login Credentials (WhatsApp)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
