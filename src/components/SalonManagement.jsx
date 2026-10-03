import React, { useState } from "react";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Tag,
  Shield,
  Crown,
  X,
  Key,
  Copy,
  Check,
  Lock,
  RefreshCw,
  UserCheck,
  ExternalLink
} from "lucide-react";
import { saveSalon, deleteSalon, createStaffUser, provisionOwnerAccount } from "../lib/dataService";
import { getAppBaseUrl } from "../lib/supabase";

export default function SalonManagement({
  salons = [],
  currentSalon,
  onSwitchSalon,
  onDataChanged,
  actorInfo
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingSalon, setEditingSalon] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("NL");
  const [mobile, setMobile] = useState("+91 98765 43210");
  const [email, setEmail] = useState("sameershaikh121@proton.me");
  const [address, setAddress] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("919876543210");
  
  // Owner Provisioning State
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerTempPassword, setOwnerTempPassword] = useState("");
  const [createOwnerAccount, setCreateOwnerAccount] = useState(true);
  const [forcePasswordChange, setForcePasswordChange] = useState(true);

  // Direct Owner Reset / Provision Modal State
  const [provisionModalSalon, setProvisionModalSalon] = useState(null);
  const [provOwnerName, setProvOwnerName] = useState("");
  const [provOwnerEmail, setProvOwnerEmail] = useState("");
  const [provTempPassword, setProvTempPassword] = useState("");
  const [provisioning, setProvisioning] = useState(false);

  // Credentials Share Modal
  const [credentialsModal, setCredentialsModal] = useState(null);
  const [copied, setCopied] = useState(false);

  const userRole = (actorInfo?.role || "staff").toLowerCase();
  const isSuperAdmin = userRole === "superadmin" || userRole === "super_admin";
  const isOwner = userRole === "owner";
  const isAdmin = isSuperAdmin || isOwner || userRole === "admin";

  function generateRandomPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let rand = "";
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `NL@${rand}!`;
  }

  function openAddModal() {
    if (!isSuperAdmin) {
      setErrorMsg("Only Super Admin is authorized to add new salon branches.");
      return;
    }
    setEditingSalon(null);
    setName("");
    setSlug("");
    setSubtitle("Hair Wig & Hair Services");
    setInvoicePrefix("NLB");
    setMobile("+91 98765 43210");
    setEmail("sameershaikh121@proton.me");
    setAddress("");
    setWhatsappNumber("919876543210");
    setOwnerName("");
    setOwnerEmail("");
    setOwnerTempPassword(generateRandomPassword());
    setCreateOwnerAccount(true);
    setForcePasswordChange(true);
    setErrorMsg("");
    setShowModal(true);
  }

  function openEditModal(s) {
    setEditingSalon(s);
    setName(s.name || "");
    setSlug(s.slug || "");
    setSubtitle(s.subtitle || "Hair Wig & Hair Services");
    setInvoicePrefix(s.invoice_prefix || "NL");
    setMobile(s.mobile || "");
    setEmail(s.email || "sameershaikh121@proton.me");
    setAddress(s.address || "");
    setWhatsappNumber(s.whatsapp_number || "");
    setOwnerName(s.owner_name || "");
    setOwnerEmail(s.owner_email || "");
    setOwnerTempPassword("");
    setCreateOwnerAccount(false);
    setErrorMsg("");
    setShowModal(true);
  }

  function openProvisionModal(s) {
    if (!isSuperAdmin) {
      setErrorMsg("Only Super Admin can provision or reset Owner credentials.");
      return;
    }
    setProvisionModalSalon(s);
    setProvOwnerName(s.owner_name || "Salon Owner");
    setProvOwnerEmail(s.owner_email || "");
    setProvTempPassword(generateRandomPassword());
    setErrorMsg("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!editingSalon && !isSuperAdmin) {
      setErrorMsg("Only Super Admin is authorized to create new salon branches.");
      return;
    }

    if (!name.trim()) {
      setErrorMsg("Salon Business Name is required.");
      return;
    }
    if (!invoicePrefix.trim()) {
      setErrorMsg("Invoice Prefix is required (e.g., NL, NLA, EHS).");
      return;
    }

    if (!editingSalon && createOwnerAccount) {
      if (!ownerEmail.trim()) {
        setErrorMsg("Owner Email / User ID is required to provision the owner account.");
        return;
      }
      if (!ownerTempPassword || ownerTempPassword.length < 6) {
        setErrorMsg("Temporary password must be at least 6 characters long.");
        return;
      }
    }

    setSaving(true);
    try {
      const targetName = (editingSalon && !isSuperAdmin) ? editingSalon.name : name.trim();
      const generatedSlug = slug.trim() || targetName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      const generatedSalonId = editingSalon ? editingSalon.id : `salon-${generatedSlug}-${Date.now().toString(36)}`;

      const payload = {
        id: generatedSalonId,
        name: targetName,
        slug: generatedSlug,
        subtitle: subtitle.trim(),
        invoice_prefix: invoicePrefix.trim().toUpperCase(),
        mobile: mobile.trim(),
        email: email.trim(),
        address: address.trim(),
        whatsapp_number: whatsappNumber.trim(),
        owner_name: ownerName.trim() || "Salon Owner",
        owner_email: ownerEmail.trim(),
        status: editingSalon?.status || "ACTIVE"
      };

      const savedSalon = await saveSalon(payload, actorInfo);
      const activeSalonId = savedSalon?.id || generatedSalonId;

      // Provision Owner User Account with temporary password
      if (!editingSalon && createOwnerAccount && ownerEmail.trim()) {
        try {
          await createStaffUser(
            ownerEmail.trim(),
            ownerTempPassword,
            ownerName.trim() || "Salon Owner",
            actorInfo,
            activeSalonId,
            "owner",
            forcePasswordChange
          );

          setCredentialsModal({
            salonName: name.trim(),
            ownerName: ownerName.trim() || "Salon Owner",
            email: ownerEmail.trim(),
            tempPassword: ownerTempPassword,
            role: "Salon Owner (⭐)",
            salonId: activeSalonId
          });
        } catch (authErr) {
          console.warn("Owner user account provisioning warning:", authErr);
        }
      }

      setSuccessMsg(
        editingSalon
          ? `Salon branch "${name.trim()}" updated successfully.`
          : `Salon branch "${name.trim()}" created & configured successfully.`
      );
      setShowModal(false);
      setEditingSalon(null);
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Save salon error:", err);
      setErrorMsg(err.message || "Failed to save salon branch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleProvisionOwner(e) {
    e.preventDefault();
    if (!provOwnerEmail.trim()) {
      setErrorMsg("Owner Email address is required.");
      return;
    }
    if (!provTempPassword || provTempPassword.length < 6) {
      setErrorMsg("Temporary password must be at least 6 characters.");
      return;
    }

    setProvisioning(true);
    try {
      await provisionOwnerAccount(
        provisionModalSalon.id,
        provOwnerEmail.trim(),
        provOwnerName.trim() || "Salon Owner",
        provTempPassword,
        actorInfo
      );

      // Update salon record with owner info
      await saveSalon({
        ...provisionModalSalon,
        owner_name: provOwnerName.trim(),
        owner_email: provOwnerEmail.trim()
      }, actorInfo);

      setCredentialsModal({
        salonName: provisionModalSalon.name,
        ownerName: provOwnerName.trim() || "Salon Owner",
        email: provOwnerEmail.trim(),
        tempPassword: provTempPassword,
        role: "Salon Owner (⭐)",
        salonId: provisionModalSalon.id
      });

      setProvisionModalSalon(null);
      setSuccessMsg(`Owner account for "${provisionModalSalon.name}" provisioned successfully with temporary password.`);
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Provision owner error:", err);
      setErrorMsg(err.message || "Failed to provision owner account.");
    } finally {
      setProvisioning(false);
    }
  }

  async function handleDelete(salonId) {
    const targetSalon = salons.find(s => s.id === salonId);
    const salonDisplayName = targetSalon?.name || salonId;

    if (!window.confirm(`Are you sure you want to permanently delete "${salonDisplayName}"? This will remove all associated branch data.`)) {
      return;
    }
    setErrorMsg("");
    try {
      await deleteSalon(salonId, actorInfo);
      setSuccessMsg(`Salon branch "${salonDisplayName}" removed successfully.`);
      if (currentSalon?.id === salonId && onSwitchSalon) {
        const remaining = salons.filter(s => s.id !== salonId);
        if (remaining.length > 0) {
          onSwitchSalon(remaining[0].id);
        }
      }
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Delete salon error:", err);
      setErrorMsg(err.message || "Failed to delete salon branch.");
    }
  }

  function copyCredentialsToClipboard() {
    if (!credentialsModal) return;
    const loginUrl = getAppBaseUrl();
    const text = `💈 NICE LOOKING PORTAL — SALON OWNER CREDENTIALS 💈\n\n🏢 Branch: ${credentialsModal.salonName}\n👑 Owner Name: ${credentialsModal.ownerName}\n✉️ Login ID: ${credentialsModal.email}\n🔑 Temporary Password: ${credentialsModal.tempPassword}\n🌐 Portal Login URL: ${loginUrl}\n\n⚠️ NOTE: You will be required to change this temporary password to your new permanent password on your first login.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: "20px" }}>
        <div className="panel-head">
          <div>
            <h3>Multi-Salon & Multi-Business Portal</h3>
            <p>
              {isSuperAdmin
                ? "Super Admin can create salon branches, provision Owner IDs with temporary passwords, and isolate billing series."
                : isOwner
                ? "Manage your assigned salon branches, switch active workspace, and view branch configurations."
                : "View your assigned salon branch details and switch active branch."}
            </p>
          </div>
          {isSuperAdmin && (
            <button className="btn primary small-btn" type="button" onClick={openAddModal}>
              <Plus size={16} /> Add Salon Branch & Owner
            </button>
          )}
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

        {/* Salon Branches Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
          {salons.map(s => {
            const isActive = currentSalon?.id === s.id;
            const canEdit = isSuperAdmin || (isOwner && (s.owner_email?.toLowerCase() === (actorInfo?.email || "").toLowerCase() || s.id === actorInfo?.salonId));

            return (
              <div
                key={s.id}
                className={`salon-card ${isActive ? "salon-card-active" : ""}`}
                style={{
                  background: "white",
                  border: isActive ? "2px solid #2563eb" : "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "18px",
                  boxShadow: isActive ? "0 4px 12px rgba(37, 99, 235, 0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: isActive ? "#eff6ff" : "#f8fafc",
                          color: isActive ? "#2563eb" : "#475569",
                          border: "1px solid #e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px"
                        }}
                      >
                        {s.invoice_prefix || "NL"}
                      </div>
                      <div>
                        <strong style={{ fontSize: "15px", color: "#1e293b", display: "block" }}>
                          {s.name}
                        </strong>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {s.subtitle || "Hair Wig & Services"}
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <span
                        className="role-pill-mini"
                        style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontWeight: 700 }}
                      >
                        ACTIVE BRANCH
                      </span>
                    )}
                  </div>

                  <div style={{ margin: "14px 0", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px", color: "#475569" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Tag size={14} style={{ color: "#94a3b8" }} />
                      <span>Invoice Series Prefix: <strong>{s.invoice_prefix || "NL"}-YYYY-XXXXXX</strong></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Phone size={14} style={{ color: "#94a3b8" }} />
                      <span>{s.mobile || "N/A"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Mail size={14} style={{ color: "#94a3b8" }} />
                      <span>{s.email || "sameershaikh121@proton.me"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={14} style={{ color: "#94a3b8" }} />
                      <span>{s.address || "Mumbai"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "4px", padding: "6px 8px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Crown size={14} style={{ color: "#d97706" }} />
                        <span>Owner: <strong>{s.owner_name || "Unassigned"}</strong> {s.owner_email ? `(${s.owner_email})` : ""}</span>
                      </div>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          className="link-btn"
                          title="Provision or Reset Owner Password"
                          style={{ fontSize: "11px", fontWeight: 600, color: "var(--blue)", display: "flex", alignItems: "center", gap: "3px" }}
                          onClick={() => openProvisionModal(s)}
                        >
                          <Key size={12} /> Provision Login
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", paddingTop: "14px", borderTop: "1px solid #f1f5f9", marginTop: "10px" }}>
                  {!isActive ? (
                    <button
                      className="btn primary small-btn full"
                      type="button"
                      onClick={() => onSwitchSalon(s.id)}
                    >
                      <ArrowRight size={14} /> Switch to Branch
                    </button>
                  ) : (
                    <button
                      className="btn secondary small-btn full"
                      type="button"
                      disabled
                      style={{ opacity: 0.8 }}
                    >
                      <CheckCircle size={14} /> Currently Selected
                    </button>
                  )}

                  {canEdit && (
                    <button
                      className="icon-btn"
                      type="button"
                      title="Edit Salon Details"
                      onClick={() => openEditModal(s)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}

                  {isSuperAdmin && s.id !== "default" && (
                    <button
                      className="icon-btn danger"
                      type="button"
                      title="Delete Salon Branch"
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Salon Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "620px" }}>
            <div className="modal-head">
              <h3>{editingSalon ? "Edit Salon Branch" : "Add Salon Branch & Provision Owner"}</h3>
              <button className="icon-btn" type="button" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {errorMsg && (
                  <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "12px", fontSize: "13px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>⚠️ {errorMsg}</div>
                    {errorMsg.toLowerCase().includes("row-level security") && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed #fca5a5", fontSize: "12px", color: "#7f1d1d" }}>
                        💡 <strong>Quick Fix:</strong> Copy and run the SQL from <code>supabase/FIX_SALON_RLS.sql</code> in your <strong>Supabase Dashboard &rarr; SQL Editor</strong> to grant full update permissions.
                      </div>
                    )}
                  </div>
                )}

                <div className="grid-2">
                  <label>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span>Salon / Business Name *</span>
                      {editingSalon && !isSuperAdmin ? (
                        <span style={{ fontSize: "10.5px", color: "#b45309", fontWeight: 600, background: "#fef3c7", padding: "1px 7px", borderRadius: "10px", border: "1px solid #fde68a" }}>
                          🔒 Super Admin Only
                        </span>
                      ) : isSuperAdmin ? (
                        <span style={{ fontSize: "10.5px", color: "#166534", fontWeight: 600, background: "#dcfce7", padding: "1px 7px", borderRadius: "10px" }}>
                          👑 Super Admin
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingSalon && !isSuperAdmin)}
                      placeholder="e.g. NICE LOOKING (Bandra)"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={editingSalon && !isSuperAdmin ? { background: "#f8fafc", cursor: "not-allowed", color: "#64748b", borderColor: "#e2e8f0" } : {}}
                    />
                  </label>

                  <label>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span>Invoice Number Prefix *</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--blue)" }}>
                        {(invoicePrefix || "NL").toUpperCase()}-YYYY-XXXXXX
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="e.g. NL, NLA, PTS"
                      value={invoicePrefix}
                      onChange={e => setInvoicePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                    />
                  </label>
                </div>

                <label>
                  Branch Subtitle / Tagline
                  <input
                    type="text"
                    placeholder="e.g. Hair Wig & Hair Services"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                  />
                </label>

                <div className="grid-2">
                  <label>
                    Contact Mobile Number
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                    />
                  </label>

                  <label>
                    WhatsApp Number
                    <input
                      type="text"
                      placeholder="919876543210"
                      value={whatsappNumber}
                      onChange={e => setWhatsappNumber(e.target.value)}
                    />
                  </label>
                </div>

                <div className="grid-2">
                  <label>
                    Notification / Contact Email
                    <input
                      type="email"
                      placeholder="sameershaikh121@proton.me"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </label>

                  <label>
                    Owner Full Name *
                    <input
                      type="text"
                      required
                      placeholder="e.g. Farhan Khan"
                      value={ownerName}
                      onChange={e => setOwnerName(e.target.value)}
                    />
                  </label>
                </div>

                {/* Owner Account Creation for New Salons */}
                {!editingSalon && (
                  <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px", margin: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <Crown size={16} style={{ color: "#d97706" }} />
                      <strong style={{ fontSize: "13.5px", color: "#1e293b" }}>Owner Account & Temporary Password</strong>
                    </div>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 10px" }}>
                      The Application Admin creates the owner account. The owner will be prompted to change this temporary password on their first login.
                    </p>

                    <div className="grid-2">
                      <label>
                        Owner Email (Login ID) *
                        <input
                          type="email"
                          required
                          placeholder="owner.bandra@nicelooking.com"
                          value={ownerEmail}
                          onChange={e => setOwnerEmail(e.target.value)}
                        />
                      </label>

                      <label>
                        Temporary Password *
                        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                          <input
                            type="text"
                            required
                            minLength={6}
                            placeholder="NL@TempPass!"
                            value={ownerTempPassword}
                            onChange={e => setOwnerTempPassword(e.target.value)}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn secondary small-btn"
                            title="Generate Random Temporary Password"
                            onClick={() => setOwnerTempPassword(generateRandomPassword())}
                          >
                            <RefreshCw size={14} />
                          </button>
                        </div>
                      </label>
                    </div>

                    <div className="checkbox-row" style={{ marginTop: "10px" }}>
                      <input
                        type="checkbox"
                        id="forceOwnerPwd"
                        checked={forcePasswordChange}
                        onChange={e => setForcePasswordChange(e.target.checked)}
                      />
                      <label htmlFor="forceOwnerPwd">
                        Enforce mandatory password change on owner's first login (Recommended)
                      </label>
                    </div>
                  </div>
                )}

                <label>
                  Salon Physical Address
                  <textarea
                    rows={2}
                    placeholder="Shop address, street, city, state"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </label>
              </div>

              <div className="modal-foot">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving Branch..." : editingSalon ? "Update Branch" : "Create Branch & Provision Owner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provision / Reset Owner Modal */}
      {provisionModalSalon && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: "520px" }}>
            <div className="modal-head">
              <h3>Provision / Reset Owner Login</h3>
              <button className="icon-btn" type="button" onClick={() => setProvisionModalSalon(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProvisionOwner}>
              <div className="modal-body">
                {errorMsg && (
                  <div className="alert danger" style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5", marginBottom: "12px" }}>
                    {errorMsg}
                  </div>
                )}

                <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 14px" }}>
                  Generate temporary login credentials for the owner of <strong>{provisionModalSalon.name}</strong>:
                </p>

                <label>
                  Owner Full Name *
                  <input
                    type="text"
                    required
                    placeholder="e.g. Farhan Khan"
                    value={provOwnerName}
                    onChange={e => setProvOwnerName(e.target.value)}
                  />
                </label>

                <label>
                  Owner Email Address (User ID) *
                  <input
                    type="email"
                    required
                    placeholder="e.g. owner@example.com"
                    value={provOwnerEmail}
                    onChange={e => setProvOwnerEmail(e.target.value)}
                  />
                </label>

                <label>
                  Temporary Password *
                  <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={provTempPassword}
                      onChange={e => setProvTempPassword(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn secondary small-btn"
                      title="Generate Random Password"
                      onClick={() => setProvTempPassword(generateRandomPassword())}
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </label>

                <div className="pwd-rules-box" style={{ marginTop: "12px" }}>
                  <Shield size={14} style={{ color: "#2563eb", display: "inline", marginRight: "6px" }} />
                  <span>The owner will be forced to change this temporary password upon their first login.</span>
                </div>
              </div>

              <div className="modal-foot">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={provisioning}
                  onClick={() => setProvisionModalSalon(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={provisioning}
                >
                  {provisioning ? "Generating Credentials..." : "Issue Temp Credentials"}
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
                <h3>Owner Credentials Provisioned</h3>
              </div>
              <button className="icon-btn" type="button" onClick={() => setCredentialsModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 12px" }}>
                The Salon Owner account has been created. Share these credentials with the owner. They will be prompted to set their permanent password on first login.
              </p>

              <div className="credentials-share-box">
                <div className="credential-row">
                  <span className="credential-label">🏢 Salon Branch</span>
                  <span className="credential-value">{credentialsModal.salonName}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">👑 Owner Name</span>
                  <span className="credential-value">{credentialsModal.ownerName}</span>
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
                  <span className="credential-label">⭐ Assigned Role</span>
                  <span className="credential-value">{credentialsModal.role}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">🌐 Portal URL</span>
                  <span className="credential-value" style={{ fontSize: "12px" }}>{getAppBaseUrl()}</span>
                </div>
              </div>

              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#b45309" }}>
                🔒 <strong>First-Time Security Policy:</strong> On first login, the owner will be required to change this temporary password before gaining access to create staff accounts or manage billing.
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
                    <Copy size={16} /> Copy Credentials (WhatsApp/Email)
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

