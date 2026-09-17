import React from "react";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function AccessRestricted({ userRole, setPage }) {
  return (
    <div className="panel" style={{ textAlign: "center", padding: "60px 20px" }}>
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "#fee2e2",
          color: "#dc2626",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px"
        }}
      >
        <ShieldAlert size={32} />
      </div>
      <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1e293b", marginBottom: "8px" }}>
        Access Restricted
      </h2>
      <p style={{ color: "#64748b", maxWidth: "460px", margin: "0 auto 20px", fontSize: "14px", lineHeight: "1.5" }}>
        Your account currently has the <strong>{userRole ? userRole.toUpperCase() : "STAFF"}</strong> role.
        This section is restricted to Business Owners and System Administrators.
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => setPage("dashboard")}
        >
          <ArrowLeft size={16} /> Return to Dashboard
        </button>
      </div>
    </div>
  );
}
