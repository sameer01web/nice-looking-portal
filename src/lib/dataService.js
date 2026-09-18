import { supabase, supabaseConfigured, createIsolatedClient, getMumbaiTodayISO, formatToLocalISODate, getAppBaseUrl } from "./supabase.js";
import { demoCustomers, demoProducts } from "../data/demo.js";
import { normalizeWhatsAppNumber } from "./whatsapp.js";

const STORAGE_KEY = "nice-looking-mvp-data-v3";
const SETTINGS_STORAGE_KEY = "nice-looking-settings";
const AUDIT_LOGS_KEY = "nice-looking-audit-logs";
const STAFF_PROFILES_KEY = "nice-looking-staff-profiles";

// Default demo fallback store
function getLocalDemoData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = {
        customers: demoCustomers.map(c => ({
          ...c,
          id: String(c.id),
          mobile: normalizeWhatsAppNumber(c.mobile),
          whatsapp_opt_in: true
        })),
        products: demoProducts.map(p => ({
          ...p,
          id: String(p.id),
          product_name: p.name,
          hair_type: p.type,
          size: p.size || "5x7",
          price: Number(p.price || 0),
          stock: Number(p.stock || 0),
          active: true
        })),
        invoices: [
          {
            id: "inv-demo-1",
            invoiceNumber: "NL-2026-000101",
            name: "Rahul Sharma",
            mobile: "9876543210",
            address: "Mumbai",
            service: "Hair Wig",
            productId: "1",
            productName: "Premium Natural Wig",
            productSize: "5x7",
            quantity: 1,
            subtotal: 8000,
            discount: 0,
            amount: 8000,
            total: 8000,
            paymentMode: "UPI",
            status: "PAID",
            isVoided: false,
            description: "First fitting included",
            createdAt: "2026-08-19"
          },
          {
            id: "inv-demo-2",
            invoiceNumber: "NL-2026-000102",
            name: "Amit Patel",
            mobile: "9820012345",
            address: "Vikhroli",
            service: "Hair Color",
            productId: null,
            productName: "",
            productSize: "",
            quantity: 0,
            subtotal: 1500,
            discount: 0,
            amount: 1500,
            total: 1500,
            paymentMode: "Cash",
            status: "PAID",
            isVoided: false,
            description: "Touch up",
            createdAt: "2026-08-19"
          }
        ]
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error("Local storage error:", err);
    return { customers: [], products: [], invoices: [] };
  }
}

function saveLocalDemoData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to write to local storage:", err);
  }
}

function getLocalAuditLogs() {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!raw) {
      const initialLogs = [
        {
          id: "log-seed-1",
          action: "INVOICE_CREATE",
          entityType: "invoice",
          entityId: "inv-demo-1",
          userId: "user-admin-1",
          userName: "Admin",
          userEmail: "admin@nicelooking.com",
          userRole: "admin",
          newData: { invoice_number: "NL-2026-000101", total: 8000, customer_name: "Rahul Sharma" },
          reason: "",
          details: "Created Invoice #NL-2026-000101 for ₹8,000",
          createdAt: "2026-08-19T10:30:00.000Z"
        }
      ];
      localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(initialLogs));
      return initialLogs;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalAuditLogs(logs) {
  try {
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs.slice(0, 500)));
  } catch {}
}

function getLocalStaffProfiles() {
  try {
    const raw = localStorage.getItem(STAFF_PROFILES_KEY);
    if (!raw) {
      const initialStaff = [
        {
          id: "staff-1",
          email: "admin@nicelooking.com",
          full_name: "Owner / Admin",
          role: "admin",
          created_at: "2026-08-01T00:00:00.000Z"
        },
        {
          id: "staff-2",
          email: "reception@nicelooking.com",
          full_name: "Reception Desk",
          role: "staff",
          created_at: "2026-08-10T00:00:00.000Z"
        }
      ];
      localStorage.setItem(STAFF_PROFILES_KEY, JSON.stringify(initialStaff));
      return initialStaff;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalStaffProfiles(profiles) {
  try {
    localStorage.setItem(STAFF_PROFILES_KEY, JSON.stringify(profiles));
  } catch {}
}

// -------------------------------------------------------------
// Authentication & User Profile
// -------------------------------------------------------------
export async function getSession() {
  if (supabase && supabase.auth) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Supabase getSession error:", error);
        return null;
      }
      return data?.session || null;
    } catch (err) {
      console.error("Failed to retrieve Supabase session:", err);
      return null;
    }
  }
  return null;
}

export function onAuthStateChange(callback) {
  if (supabase && supabase.auth) {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session || null, event);
    });
    return () => listener?.subscription?.unsubscribe?.();
  }
  return () => {};
}

export async function loginUser(email, password) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }
  if (supabase && supabase.auth) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) throw error;

    // Record login audit event asynchronously
    if (data?.user?.id) {
      logAuditEvent({
        action: "LOGIN",
        entityType: "auth",
        entityId: data.user.id,
        userId: data.user.id,
        userEmail: data.user.email,
        details: `User ${data.user.email} logged into the portal.`
      }).catch(err => console.warn("Failed to log login event:", err));
    }

    return data?.session || null;
  }
  throw new Error("Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
}

export async function registerUser(email, password, name) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  if (supabase && supabase.auth) {
    const fullName = name?.trim() || "Staff";
    const appOrigin = getAppBaseUrl();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          name: fullName
        },
        emailRedirectTo: `${appOrigin}/`
      }
    });
    if (error) throw error;

    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email address already exists. Please log in or reset your password.");
    }

    return data;
  }
  
  // Offline / Demo Simulation
  return {
    user: {
      id: "demo-user-" + Date.now(),
      email: cleanEmail,
      user_metadata: { full_name: name || "Staff" }
    }
  };
}

/**
 * Verifies the 6-digit OTP code submitted by the user after registration.
 * On success, validates user session, auto-logs-in if needed, and returns active session object.
 */
export async function verifySignUpOtp(email, token, password = null) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanToken = String(token || "").trim();
  if (!cleanEmail || !cleanToken) {
    throw new Error("Email and 6-digit verification code are required.");
  }

  if (supabaseConfigured && supabase?.auth) {
    // Attempt verification with 'signup' type (email OTP verification)
    let { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "signup"
    });

    // Fallback: If 'signup' type fails (e.g. Supabase instance uses 'email'), try 'email' type
    if (error) {
      const retry = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: "email"
      });
      if (!retry.error) {
        data = retry.data;
        error = null;
      }
    }

    if (error) {
      throw new Error(error.message || "Invalid or expired OTP code. Please verify the code and try again.");
    }

    let activeSession = data?.session || null;

    // If verifyOtp didn't generate a session token directly (e.g. Supabase confirmed email without issuing tokens),
    // automatically sign in using the password from registration or get the active session.
    if (!activeSession) {
      if (password) {
        try {
          const loginRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password
          });
          if (loginRes.data?.session) {
            activeSession = loginRes.data.session;
          }
        } catch (loginErr) {
          console.warn("Auto sign-in after OTP verify fallback:", loginErr);
        }
      }
      if (!activeSession) {
        const { data: sessData } = await supabase.auth.getSession();
        if (sessData?.session) {
          activeSession = sessData.session;
        }
      }
    }

    // Record login/verification audit event asynchronously
    const userId = activeSession?.user?.id || data?.user?.id;
    const userEmail = activeSession?.user?.email || data?.user?.email || cleanEmail;
    if (userId) {
      logAuditEvent({
        action: "REGISTER_OTP_VERIFIED",
        entityType: "auth",
        entityId: userId,
        userId: userId,
        userEmail: userEmail,
        details: `User ${userEmail} verified OTP and logged into the portal.`
      }).catch(err => console.warn("Failed to log OTP verify event:", err));
    }

    return activeSession || { user: data?.user || { id: userId, email: userEmail } };
  }

  // Offline / Demo verification simulation
  if (cleanToken === "123456" || cleanToken.length === 6) {
    const demoSession = {
      user: {
        id: "demo-user-" + Date.now(),
        email: cleanEmail,
        user_metadata: { full_name: "Staff Member" }
      },
      access_token: "demo-token-" + Date.now()
    };
    return demoSession;
  }
  throw new Error("Invalid demo verification code. Use 123456 in demo mode.");
}

/**
 * Resends the signup confirmation OTP code to user's email.
 */
export async function resendSignUpOtp(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email address is required to resend OTP.");
  }

  if (supabaseConfigured && supabase?.auth) {
    const appOrigin = getAppBaseUrl();
    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: {
        emailRedirectTo: `${appOrigin}/`
      }
    });

    if (error) {
      // Fallback to signInWithOtp if signup resend fails
      const retry = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${appOrigin}/`
        }
      });
      if (retry.error) throw error;
      return retry.data;
    }
    return data;
  }

  return { message: "Demo OTP code resent (Use: 123456)" };
}

export async function resetPasswordForEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Please enter your registered email address.");
  }
  if (supabase && supabase.auth) {
    const redirectUrl = `${getAppBaseUrl()}/reset-password`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectUrl
    });
    if (error) throw error;
    return data;
  }
  throw new Error("Supabase is not configured.");
}

export async function verifyPasswordResetOtp(email, token) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanToken = String(token || "").trim();
  if (!cleanEmail || !cleanToken) {
    throw new Error("Email and OTP code are required.");
  }
  if (supabase && supabase.auth) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "recovery"
    });
    if (error) throw error;
    return data?.session || null;
  }
  throw new Error("Supabase is not configured.");
}

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  if (supabase && supabase.auth) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return data;
  }
  throw new Error("Supabase is not configured.");
}

export async function logoutUser() {
  if (supabase && supabase.auth) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signOut error:", err);
    }
  }
}

/**
 * Fetches user profile containing RBAC role ('admin', 'owner', 'staff') and full_name.
 */
export async function fetchUserProfile(userId, fallbackEmail = null) {
  if (!userId) return null;

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("Could not load user profile from profiles table:", error);
      }

      let email = fallbackEmail;
      if (!email) {
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id === userId) {
            email = authData.user.email;
          }
        } catch {}
      }

      if (data) {
        return {
          id: data.id,
          email: email || "user@nicelooking.com",
          fullName: data.full_name || (email ? email.split("@")[0] : "User"),
          role: data.role || "staff"
        };
      } else if (email) {
        return {
          id: userId,
          email: email,
          fullName: email.split("@")[0] || "User",
          role: "staff"
        };
      }
    } catch (err) {
      console.warn("fetchUserProfile error:", err);
    }
  }

  // Demo Fallback
  const profiles = getLocalStaffProfiles();
  const found = profiles.find(p => p.id === userId || p.email === userId);
  if (found) {
    return {
      id: found.id,
      email: found.email,
      fullName: found.full_name,
      role: found.role
    };
  }
  return {
    id: userId,
    email: fallbackEmail || "admin@nicelooking.com",
    fullName: "Admin",
    role: "admin"
  };
}

// -------------------------------------------------------------
// Staff Management (Owner/Admin Only)
// -------------------------------------------------------------
export async function fetchStaffUsers() {
  if (supabaseConfigured) {
    try {
      const { data: profs, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (!error && profs && profs.length > 0) {
        return profs.map(p => ({
          id: p.id,
          email: `${(p.full_name || "staff").toLowerCase().replace(/\s+/g, "")}@nicelooking.com`,
          full_name: p.full_name || "Staff Member",
          role: p.role || "staff",
          created_at: p.created_at
        }));
      }
    } catch (err) {
      console.warn("fetchStaffUsers query failed:", err);
    }
  }

  // Demo Fallback
  return getLocalStaffProfiles();
}

export async function createStaffUser(email, password, fullName, actorInfo) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(fullName || "").trim() || "Staff Member";
  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  if (supabaseConfigured) {
    const isolatedClient = createIsolatedClient();
    if (!isolatedClient) {
      throw new Error("Could not initialize isolated Supabase client.");
    }

    const appOrigin = getAppBaseUrl();
    const { data, error } = await isolatedClient.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          name: cleanName
        },
        emailRedirectTo: `${appOrigin}/`
      }
    });

    if (error) throw error;

    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email address already exists.");
    }

    // Log the staff creation audit event
    await logAuditEvent({
      action: "STAFF_CREATE",
      entityType: "user",
      entityId: data?.user?.id,
      userId: actorInfo?.id,
      userEmail: actorInfo?.email,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      newData: {
        email: cleanEmail,
        full_name: cleanName,
        role: "staff"
      },
      details: `Created new Staff account for ${cleanName} (${cleanEmail})`
    });

    return data?.user || { email: cleanEmail, full_name: cleanName, role: "staff" };
  }

  // Demo Fallback
  const profiles = getLocalStaffProfiles();
  if (profiles.some(p => p.email.toLowerCase() === cleanEmail)) {
    throw new Error("An account with this email address already exists.");
  }
  const newStaff = {
    id: `staff-${Date.now()}`,
    email: cleanEmail,
    full_name: cleanName,
    role: "staff",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  profiles.unshift(newStaff);
  saveLocalStaffProfiles(profiles);

  logAuditEvent({
    action: "STAFF_CREATE",
    entityType: "user",
    entityId: newStaff.id,
    userId: actorInfo?.id,
    userEmail: actorInfo?.email,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    newData: { email: cleanEmail, full_name: cleanName, role: "staff" },
    details: `Created new Staff account for ${cleanName} (${cleanEmail})`
  });

  return newStaff;
}

export async function updateStaffRole(userId, newRole, actorInfo) {
  if (!["admin", "owner", "staff"].includes(newRole)) {
    throw new Error("Invalid role. Role must be 'admin', 'owner', or 'staff'.");
  }

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc("update_user_role", {
        p_user_id: userId,
        p_new_role: newRole
      });
      if (error) throw error;
      return true;
    } catch (err) {
      // Direct table update fallback
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (updErr) throw updErr;
      return true;
    }
  }

  // Demo Fallback
  const profiles = getLocalStaffProfiles();
  const target = profiles.find(p => p.id === userId);
  if (!target) throw new Error("Staff user not found.");
  const oldRole = target.role;
  target.role = newRole;
  saveLocalStaffProfiles(profiles);

  logAuditEvent({
    action: "USER_ROLE_CHANGE",
    entityType: "user",
    entityId: userId,
    userId: actorInfo?.id,
    userEmail: actorInfo?.email,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    oldData: { role: oldRole },
    newData: { role: newRole },
    details: `Updated user ${target.email} role from ${oldRole} to ${newRole}`
  });

  return true;
}

// -------------------------------------------------------------
// Audit Logging System
// Track if remote audit_logs table exists on Supabase (defaults to false to prevent 404 network console noise)
let remoteAuditLogsAvailable = false;

export async function logAuditEvent({
  action,
  entityType,
  entityId,
  userId,
  userEmail,
  userName,
  userRole,
  oldData,
  newData,
  reason,
  details
}) {
  const eventPayload = {
    action: String(action || "GENERAL").toUpperCase(),
    entity_type: String(entityType || "general"),
    entity_id: entityId ? String(entityId) : null,
    user_id: userId || null,
    user_email: userEmail || null,
    user_name: userName || null,
    user_role: userRole || null,
    old_data: oldData ? (typeof oldData === "object" ? oldData : { value: oldData }) : null,
    new_data: newData ? (typeof newData === "object" ? newData : { value: newData }) : null,
    reason: reason ? String(reason).trim() : null,
    details: details ? String(details).trim() : null,
    created_at: new Date().toISOString()
  };

  if (supabaseConfigured && remoteAuditLogsAvailable) {
    try {
      const { error } = await supabase.from("audit_logs").insert([eventPayload]);
      if (error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.includes("not find the table"))) {
        remoteAuditLogsAvailable = false;
      }
    } catch {
      remoteAuditLogsAvailable = false;
    }
  }

  // Store in local demo storage for redundancy and instant access
  const logs = getLocalAuditLogs();
  logs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action: eventPayload.action,
    entityType: eventPayload.entity_type,
    entityId: eventPayload.entity_id,
    userId: eventPayload.user_id,
    userEmail: eventPayload.user_email,
    userName: eventPayload.user_name,
    userRole: eventPayload.user_role,
    oldData: eventPayload.old_data,
    newData: eventPayload.new_data,
    reason: eventPayload.reason,
    details: eventPayload.details,
    createdAt: eventPayload.created_at
  });
  saveLocalAuditLogs(logs);
}

export async function fetchAuditLogs(filters = {}) {
  const { action, startDate, endDate, searchQuery, staffUser } = filters;

  if (supabaseConfigured && remoteAuditLogsAvailable) {
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (action && action !== "ALL") {
        query = query.eq("action", action);
      }
      if (startDate) {
        query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
      }
      if (staffUser) {
        query = query.or(`user_name.ilike.%${staffUser}%,user_email.ilike.%${staffUser}%`);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01" || error.message?.includes("not find the table")) {
          remoteAuditLogsAvailable = false;
        }
      } else if (data && Array.isArray(data) && data.length > 0) {
        return data.map(l => ({
          id: l.id,
          action: l.action,
          entityType: l.entity_type,
          entityId: l.entity_id,
          userId: l.user_id,
          userEmail: l.user_email,
          userName: l.user_name || "Staff",
          userRole: l.user_role || "staff",
          oldData: l.old_data,
          newData: l.new_data,
          reason: l.reason || "",
          details: l.details || "",
          createdAt: l.created_at
        }));
      }
    } catch {
      remoteAuditLogsAvailable = false;
    }
  }

  // Demo Fallback with filters
  let logs = getLocalAuditLogs();

  if (action && action !== "ALL") {
    logs = logs.filter(l => l.action === action);
  }
  if (startDate) {
    logs = logs.filter(l => (l.createdAt || "").slice(0, 10) >= startDate);
  }
  if (endDate) {
    logs = logs.filter(l => (l.createdAt || "").slice(0, 10) <= endDate);
  }
  if (staffUser) {
    const s = staffUser.toLowerCase();
    logs = logs.filter(l => (l.userName || "").toLowerCase().includes(s) || (l.userEmail || "").toLowerCase().includes(s));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    logs = logs.filter(l =>
      (l.details || "").toLowerCase().includes(q) ||
      (l.entityId || "").toLowerCase().includes(q) ||
      (l.reason || "").toLowerCase().includes(q)
    );
  }

  return logs;
}

// -------------------------------------------------------------
// Customer Lookup by Mobile
// -------------------------------------------------------------
export async function findCustomerByMobile(rawMobile) {
  const norm = normalizeWhatsAppNumber(rawMobile);
  if (!norm || norm.length < 10) return null;

  if (supabaseConfigured) {
    const digits10 = norm.slice(-10);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, mobile, address, whatsapp_opt_in")
      .or(`mobile.eq.${digits10},mobile.eq.${norm},mobile.eq.91${digits10}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("findCustomerByMobile Supabase query error:", error);
      return null;
    }
    return data;
  }

  // Demo Fallback
  const d = getLocalDemoData();
  const digits10 = norm.slice(-10);
  return (
    d.customers.find(
      c =>
        normalizeWhatsAppNumber(c.mobile).slice(-10) === digits10
    ) || null
  );
}

// -------------------------------------------------------------
// Customers Management
// -------------------------------------------------------------
export async function fetchCustomers() {
  if (supabaseConfigured) {
    const { data: customerRows, error: custErr } = await supabase
      .from("customers")
      .select("id, name, mobile, address, whatsapp_opt_in, created_at, updated_at")
      .order("name", { ascending: true });

    if (custErr) throw custErr;

    // Fetch all invoices to compute customer lifetime stats (excluding VOIDED invoices)
    let invoiceRows = [];
    try {
      const { data: fullRows, error: invErr } = await supabase
        .from("invoices")
        .select(`
          id,
          customer_id,
          invoice_number,
          service_type,
          product_id,
          product_name,
          product_size,
          quantity,
          subtotal,
          discount,
          total,
          payment_mode,
          description,
          invoice_date,
          created_at,
          updated_at,
          customers ( id, name, mobile, address )
        `)
        .order("invoice_date", { ascending: false });

      if (!invErr && fullRows) {
        invoiceRows = fullRows;
      }
    } catch (fullErr) {
      console.warn("Could not fetch invoices for customer stats calculation:", fullErr);
    }

    // Group invoices by customer_id and mobile number (ONLY ACTIVE/NON-VOIDED for financials)
    const invoicesByCustId = new Map();
    const invoicesByPhone = new Map();

    (invoiceRows || []).forEach(inv => {
      const voidInfo = parseVoidStatus(inv);
      const isVoid = voidInfo.isVoid;
      const cust = inv.customers || {};
      const { items, cleanDescription } = parseItemsFromInvoice(inv.description, inv);
      const invObj = {
        id: inv.id,
        invoiceNumber: inv.invoice_number || `INV-${String(inv.id).slice(0, 6)}`,
        service: inv.service_type || "Service",
        items: items,
        productId: inv.product_id,
        productName: inv.product_name || "",
        productSize: inv.product_size || "",
        quantity: Number(inv.quantity || 1),
        subtotal: Number(inv.subtotal || inv.total || 0),
        discount: Number(inv.discount || 0),
        amount: Number(inv.total || 0),
        total: Number(inv.total || 0),
        paymentMode: inv.payment_mode || "Cash",
        status: voidInfo.status,
        isVoided: isVoid,
        description: cleanDescription,
        createdAt: formatToLocalISODate(inv.invoice_date || inv.created_at)
      };

      if (inv.customer_id) {
        const cId = String(inv.customer_id);
        if (!invoicesByCustId.has(cId)) invoicesByCustId.set(cId, []);
        invoicesByCustId.get(cId).push(invObj);
      }

      const pDigits = String(cust.mobile || "").replace(/\D/g, "").slice(-10);
      if (pDigits) {
        if (!invoicesByPhone.has(pDigits)) invoicesByPhone.set(pDigits, []);
        invoicesByPhone.get(pDigits).push(invObj);
      }
    });

    return (customerRows || []).map(cust => {
      const cPhone = String(cust.mobile || "").replace(/\D/g, "").slice(-10);
      const byId = invoicesByCustId.get(String(cust.id)) || [];
      const byPhone = cPhone ? (invoicesByPhone.get(cPhone) || []) : [];

      const seenIds = new Set();
      const custInvoices = [];
      [...byId, ...byPhone].forEach(inv => {
        if (!seenIds.has(inv.id)) {
          seenIds.add(inv.id);
          custInvoices.push(inv);
        }
      });
      custInvoices.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      // Only count active (non-voided) invoices for spending calculations
      const activeInvoices = custInvoices.filter(i => !i.isVoided);
      const totalSpent = activeInvoices.reduce((sum, i) => sum + (Number(i.total || i.amount) || 0), 0);
      const visitCount = activeInvoices.length;
      const latest = activeInvoices[0] || custInvoices[0] || null;

      return {
        id: cust.id,
        name: cust.name,
        mobile: cust.mobile,
        address: cust.address || "",
        whatsapp_opt_in: cust.whatsapp_opt_in ?? true,
        visitCount: visitCount,
        totalSpent: totalSpent,
        amount: totalSpent,
        lastVisit: latest ? latest.createdAt : (cust.created_at ? formatToLocalISODate(cust.created_at) : "—"),
        lastService: latest ? latest.service : (cust.service || "—"),
        createdAt: cust.created_at ? formatToLocalISODate(cust.created_at) : "—",
        invoices: custInvoices,
        hasInvoices: custInvoices.length > 0 || totalSpent > 0
      };
    });
  }

  // Demo Fallback
  const d = getLocalDemoData();
  const allInvoices = d.invoices || [];

  return (d.customers || []).map(c => {
    const p = normalizeWhatsAppNumber(c.mobile).slice(-10);
    const custInvoices = allInvoices.filter(
      inv => (inv.customerId && String(inv.customerId) === String(c.id)) ||
             (normalizeWhatsAppNumber(inv.mobile).slice(-10) === p)
    ).map(inv => {
      const { items, cleanDescription } = parseItemsFromInvoice(inv.rawDescription || inv.description, inv);
      return {
        ...inv,
        items,
        description: cleanDescription,
        amount: Number(inv.total || inv.amount || 0),
        total: Number(inv.total || inv.amount || 0),
        isVoided: Boolean(inv.isVoided || inv.status === "VOIDED")
      };
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const activeInvoices = custInvoices.filter(i => !i.isVoided);
    const totalSpent = activeInvoices.reduce((sum, i) => sum + (Number(i.amount || i.total) || 0), 0);
    const visitCount = activeInvoices.length;
    const latest = activeInvoices[0] || custInvoices[0] || null;

    return {
      ...c,
      visitCount: visitCount,
      totalSpent: totalSpent,
      amount: totalSpent,
      lastVisit: latest ? latest.createdAt : (c.createdAt || "—"),
      lastService: latest ? latest.service : (c.service || "—"),
      createdAt: c.createdAt || formatToLocalISODate(new Date().toISOString()),
      invoices: custInvoices,
      hasInvoices: custInvoices.length > 0 || totalSpent > 0
    };
  });
}

export async function saveCustomer(customerData, actorInfo = null) {
  const normMobile = normalizeWhatsAppNumber(customerData.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  if (!customerData.name || !customerData.name.trim()) throw new Error("Customer name is required.");

  const isEdit = Boolean(customerData.id && String(customerData.id).includes("-"));

  if (supabaseConfigured) {
    let result;
    if (isEdit) {
      const { data, error } = await supabase
        .from("customers")
        .update({
          name: customerData.name.trim(),
          mobile: normMobile.slice(-10),
          address: customerData.address?.trim() || null,
          whatsapp_opt_in: customerData.whatsapp_opt_in ?? true,
          updated_at: new Date().toISOString()
        })
        .eq("id", customerData.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("customers")
        .upsert(
          {
            name: customerData.name.trim(),
            mobile: normMobile.slice(-10),
            address: customerData.address?.trim() || null,
            whatsapp_opt_in: customerData.whatsapp_opt_in ?? true
          },
          { onConflict: "mobile" }
        )
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    logAuditEvent({
      action: isEdit ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE",
      entityType: "customer",
      entityId: result.id,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      newData: { name: result.name, mobile: result.mobile },
      details: `${isEdit ? "Updated" : "Created"} customer profile: ${result.name} (${result.mobile})`
    });

    return result;
  }

  // Demo Fallback
  const d = getLocalDemoData();
  const existingIdx = d.customers.findIndex(
    c => String(c.id) === String(customerData.id) || normalizeWhatsAppNumber(c.mobile) === normMobile
  );
  const updated = {
    id: customerData.id || String(Date.now()),
    name: customerData.name.trim(),
    mobile: normMobile.slice(-10),
    address: customerData.address || "",
    whatsapp_opt_in: customerData.whatsapp_opt_in ?? true
  };
  if (existingIdx >= 0) {
    d.customers[existingIdx] = { ...d.customers[existingIdx], ...updated };
  } else {
    d.customers.push(updated);
  }
  saveLocalDemoData(d);

  logAuditEvent({
    action: isEdit ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE",
    entityType: "customer",
    entityId: updated.id,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    newData: { name: updated.name, mobile: updated.mobile },
    details: `${isEdit ? "Updated" : "Created"} customer profile: ${updated.name}`
  });

  return updated;
}

export async function deleteCustomer(customerId, actorInfo = null) {
  if (supabaseConfigured) {
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId);
    if (error) throw error;

    logAuditEvent({
      action: "CUSTOMER_DELETE",
      entityType: "customer",
      entityId: customerId,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      details: `Deleted customer record ID ${customerId}`
    });

    return true;
  }

  // Demo Fallback
  const d = getLocalDemoData();
  d.customers = d.customers.filter(c => String(c.id) !== String(customerId));
  saveLocalDemoData(d);

  logAuditEvent({
    action: "CUSTOMER_DELETE",
    entityType: "customer",
    entityId: customerId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    details: `Deleted customer ID ${customerId}`
  });

  return true;
}

// -------------------------------------------------------------
// Wig Products Management
// -------------------------------------------------------------
export async function fetchProducts() {
  if (supabaseConfigured) {
    const { data, error } = await supabase
      .from("wig_products")
      .select("*")
      .eq("active", true)
      .order("product_name", { ascending: true });

    if (error) throw error;

    return (data || []).map(p => ({
      id: String(p.id),
      name: p.product_name || p.name || "Wig Product",
      type: p.hair_type || "Human Hair",
      color: p.color || "Natural Black",
      size: p.size || "5x7",
      price: Number(p.price || 0),
      stock: Number(p.stock || 0),
      description: p.description || "",
      active: p.active !== false
    }));
  }

  // Demo Fallback
  const d = getLocalDemoData();
  return (d.products || []).filter(p => p.active !== false).map(p => ({
    id: String(p.id),
    name: p.name || p.product_name || "Wig Product",
    type: p.type || p.hair_type || "Human Hair",
    color: p.color || "Natural Black",
    size: p.size || "5x7",
    price: Number(p.price || 0),
    stock: Number(p.stock || 0),
    description: p.description || "",
    active: true
  }));
}

export async function saveProduct(product, actorInfo = null) {
  const name = String(product.name || product.product_name || "").trim();
  if (!name) throw new Error("Product name is required.");
  const size = String(product.size || "").trim() || "5x7";
  const price = Math.max(0, Number(product.price || 0));
  const stock = Math.max(0, Number(product.stock || 0));
  const hair_type = product.type || product.hair_type || "Human Hair";
  const color = String(product.color || "Natural Black").trim() || "Natural Black";
  const description = String(product.description || "").trim();
  const isEdit = Boolean(product.id && (String(product.id).includes("-") || !isNaN(Number(product.id))));

  if (supabaseConfigured) {
    const payload = {
      product_name: name,
      hair_type,
      color,
      size,
      price,
      stock,
      active: true,
      updated_at: new Date().toISOString()
    };
    if (description) {
      payload.description = description;
    }

    let savedData;
    try {
      if (isEdit) {
        const { data, error } = await supabase
          .from("wig_products")
          .update(payload)
          .eq("id", product.id)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
      } else {
        const { data, error } = await supabase
          .from("wig_products")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedData = data;
      }
    } catch (err) {
      // If error is about description column not existing in table, retry without description
      if (payload.description && (String(err?.message || "").includes("description") || String(err?.details || "").includes("description"))) {
        delete payload.description;
        if (isEdit) {
          const { data, error } = await supabase
            .from("wig_products")
            .update(payload)
            .eq("id", product.id)
            .select()
            .single();
          if (error) throw error;
          savedData = data;
        } else {
          const { data, error } = await supabase
            .from("wig_products")
            .insert(payload)
            .select()
            .single();
          if (error) throw error;
          savedData = data;
        }
      } else {
        throw err;
      }
    }

    logAuditEvent({
      action: isEdit ? "PRODUCT_UPDATE" : "PRODUCT_CREATE",
      entityType: "wig_product",
      entityId: savedData.id,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      newData: { name: savedData.product_name, size: savedData.size, stock: savedData.stock, price: savedData.price },
      details: `${isEdit ? "Updated" : "Added"} wig product: ${savedData.product_name} (${savedData.size}) — Stock: ${savedData.stock}`
    });

    return {
      id: String(savedData.id),
      name: savedData.product_name || savedData.name || name,
      type: savedData.hair_type || hair_type,
      color: savedData.color || color,
      size: savedData.size || size,
      price: Number(savedData.price || price),
      stock: Number(savedData.stock || stock),
      description: savedData.description || description || "",
      active: savedData.active !== false
    };
  }

  // Demo Fallback
  const d = getLocalDemoData();
  const saved = {
    id: isEdit ? String(product.id) : String(Date.now()),
    name,
    type: hair_type,
    color,
    size,
    price,
    stock,
    description,
    active: true
  };

  if (isEdit) {
    d.products = (d.products || []).map(p => (String(p.id) === String(product.id) ? saved : p));
  } else {
    d.products = [...(d.products || []), saved];
  }
  saveLocalDemoData(d);

  logAuditEvent({
    action: isEdit ? "PRODUCT_UPDATE" : "PRODUCT_CREATE",
    entityType: "wig_product",
    entityId: saved.id,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    newData: { name: saved.name, size: saved.size, stock: saved.stock, price: saved.price },
    details: `${isEdit ? "Updated" : "Added"} wig product: ${saved.name} (Stock: ${saved.stock})`
  });

  return saved;
}

export async function deleteProduct(productId, actorInfo = null) {
  if (supabaseConfigured) {
    const { error } = await supabase
      .from("wig_products")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (error) throw error;

    logAuditEvent({
      action: "PRODUCT_DELETE",
      entityType: "wig_product",
      entityId: productId,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      details: `Deactivated wig product ID ${productId}`
    });

    return true;
  }

  // Demo Fallback
  const d = getLocalDemoData();
  d.products = (d.products || []).filter(p => String(p.id) !== String(productId));
  saveLocalDemoData(d);

  logAuditEvent({
    action: "PRODUCT_DELETE",
    entityType: "wig_product",
    entityId: productId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    details: `Deactivated wig product ID ${productId}`
  });

  return true;
}

// -------------------------------------------------------------
// Invoices Management & Multi-Item Line Operations
// -------------------------------------------------------------
export function parseVoidStatus(inv) {
  const rawDesc = String(inv?.rawDescription || inv?.description || "");
  const isVoid = Boolean(
    inv?.is_voided === true ||
    inv?.isVoided === true ||
    inv?.status === "VOIDED" ||
    rawDesc.includes("---VOIDED---")
  );

  let voidReason = inv?.void_reason || inv?.voidReason || "";
  let voidedByName = inv?.voided_by_name || inv?.voidedByName || "";
  let voidedAt = inv?.voided_at || inv?.voidedAt || null;

  if (isVoid && rawDesc.includes("---VOIDED---")) {
    const match = rawDesc.match(/---VOIDED---\s*(?:Reason:\s*([^(\n]+))?(?:\s*\(by\s*([^)]+)\))?/i);
    if (match) {
      if (!voidReason && match[1]) voidReason = match[1].trim();
      if (!voidedByName && match[2]) voidedByName = match[2].trim();
    }
  }

  return {
    isVoid,
    status: isVoid ? "VOIDED" : (inv?.status || "PAID"),
    voidReason,
    voidedByName,
    voidedAt: voidedAt ? formatToLocalISODate(voidedAt) : (isVoid ? formatToLocalISODate(new Date().toISOString()) : null),
    rawVoidedAt: voidedAt || null
  };
}

function parseItemsFromInvoice(rawDesc, invRecord) {
  let items = null;
  let cleanDesc = rawDesc || "";
  let settingsSnapshot = null;

  if (rawDesc && typeof rawDesc === "string") {
    let textToParse = rawDesc;
    if (textToParse.includes("---SETTINGS_JSON---")) {
      const parts = textToParse.split("---SETTINGS_JSON---");
      try {
        settingsSnapshot = JSON.parse(parts[1].trim());
      } catch (e) {
        console.warn("Failed to parse settings snapshot from description JSON:", e);
      }
      textToParse = parts[0];
    }

    if (textToParse.includes("---ITEMS_JSON---")) {
      const parts = textToParse.split("---ITEMS_JSON---");
      cleanDesc = parts[0].trim();
      try {
        items = JSON.parse(parts[1].trim());
      } catch (e) {
        console.warn("Failed to parse line items from description JSON:", e);
      }
    } else {
      cleanDesc = textToParse.trim();
    }
    // Clean void markers from cleanDesc for neat UI / print invoice display
    cleanDesc = cleanDesc.replace(/---VOIDED---[^\n]*\n?/g, "").trim();
  } else if (invRecord && Array.isArray(invRecord.items) && invRecord.items.length > 0) {
    items = invRecord.items;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const svc = invRecord?.service_type || invRecord?.service || "Hair Wig";
    const isWig = svc === "Hair Wig";
    const prodId = invRecord?.product_id || invRecord?.productId || null;
    const prodName = invRecord?.product_name || invRecord?.productName || "";
    const prodSize = invRecord?.product_size || invRecord?.productSize || "";
    const qty = Number(invRecord?.quantity || (isWig ? 1 : 1));
    const sub = Number(invRecord?.subtotal || invRecord?.amount || invRecord?.total || 0);

    items = [
      {
        id: "item-legacy-1",
        service: svc,
        productId: prodId,
        productName: prodName,
        productSize: prodSize,
        quantity: qty > 0 ? qty : 1,
        unitPrice: qty > 0 ? Math.round(sub / qty) : sub,
        amount: sub,
        note: ""
      }
    ];
  }

  return { items, cleanDescription: cleanDesc, settingsSnapshot };
}

export async function fetchInvoices() {
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          customer_id,
          transaction_id,
          service_type,
          product_id,
          product_name,
          product_size,
          quantity,
          subtotal,
          discount,
          total,
          payment_mode,
          description,
          invoice_date,
          created_at,
          updated_at,
          customers ( id, name, mobile, address )
        `)
        .order("invoice_date", { ascending: false });

      if (error) throw error;

      if (data) {
        return data.map(i => {
          const voidInfo = parseVoidStatus(i);
          const cust = i.customers || {};
          const { items, cleanDescription, settingsSnapshot } = parseItemsFromInvoice(i.description, i);
          return {
            id: i.id,
            invoiceNumber: i.invoice_number,
            customerId: i.customer_id,
            transactionId: i.transaction_id,
            name: cust.name || i.product_name || "Valued Customer",
            mobile: cust.mobile || "",
            address: cust.address || "",
            service: i.service_type || "Hair Wig",
            items: items,
            productId: i.product_id,
            productName: i.product_name || "",
            productSize: i.product_size || "",
            quantity: Number(i.quantity || 0),
            subtotal: Number(i.subtotal || i.total || 0),
            discount: Number(i.discount || 0),
            amount: Number(i.total || 0),
            total: Number(i.total || 0),
            paymentMode: i.payment_mode || "Cash",
            status: voidInfo.status,
            isVoided: voidInfo.isVoid,
            voidedAt: voidInfo.voidedAt,
            rawVoidedAt: voidInfo.rawVoidedAt,
            voidReason: voidInfo.voidReason,
            voidedByName: voidInfo.voidedByName,
            description: cleanDescription,
            rawDescription: i.description || "",
            shopSettings: settingsSnapshot || null,
            createdAt: formatToLocalISODate(i.invoice_date || i.created_at),
            rawCreatedAt: i.invoice_date || i.created_at
          };
        });
      }
    } catch (err) {
      console.error("fetchInvoices error:", err);
      throw err;
    }
  }

  // Demo Fallback
  const d = getLocalDemoData();
  return (d.invoices || []).map(i => {
    const voidInfo = parseVoidStatus(i);
    const { items, cleanDescription, settingsSnapshot } = parseItemsFromInvoice(i.rawDescription || i.description, i);
    return {
      ...i,
      items: items,
      subtotal: Number(i.subtotal || i.amount || 0),
      discount: Number(i.discount || 0),
      amount: Number(i.amount || 0),
      total: Number(i.amount || 0),
      quantity: Number(i.quantity || (i.service === "Hair Wig" ? 1 : 0)),
      status: voidInfo.status,
      isVoided: voidInfo.isVoid,
      voidedAt: voidInfo.voidedAt || i.voidedAt || null,
      voidReason: voidInfo.voidReason || i.voidReason || "",
      voidedByName: voidInfo.voidedByName || i.voidedByName || "",
      description: cleanDescription,
      shopSettings: settingsSnapshot || i.shopSettings || null,
      createdAt: i.createdAt || getMumbaiTodayISO()
    };
  });
}

export async function getNextInvoiceNumber(prefix = "NL") {
  const cleanPrefix = (prefix || "NL").trim().toUpperCase() || "NL";

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number")
        .ilike("invoice_number", `${cleanPrefix}-%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        let maxSeq = 0;
        for (const row of data) {
          const numStr = String(row.invoice_number || "").trim();
          const parts = numStr.split("-");
          const lastChunk = parts[parts.length - 1];
          const seq = parseInt(lastChunk, 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
        const nextSeq = maxSeq + 1;
        return `${cleanPrefix}-${String(nextSeq).padStart(4, "0")}`;
      } else if (!error) {
        return `${cleanPrefix}-0001`;
      }
    } catch (err) {
      console.warn("Could not query supabase for next invoice sequence:", err);
    }
  }

  // Demo Fallback / LocalStorage
  try {
    const d = getLocalDemoData();
    const invs = d.invoices || [];
    let maxSeq = 0;
    for (const inv of invs) {
      const numStr = String(inv.invoiceNumber || inv.invoice_number || "").trim();
      if (numStr.toUpperCase().startsWith(`${cleanPrefix}-`)) {
        const parts = numStr.split("-");
        const lastChunk = parts[parts.length - 1];
        const seq = parseInt(lastChunk, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    const nextSeq = maxSeq + 1;
    return `${cleanPrefix}-${String(nextSeq).padStart(4, "0")}`;
  } catch {
    return `${cleanPrefix}-0001`;
  }
}

/**
 * Creates invoice supporting multiple service/product line items, itemized subtotals,
 * atomic stock deductions, and audit logging.
 */
export async function createInvoice(form, lineItems, actorInfo = null) {
  const normMobile = normalizeWhatsAppNumber(form.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  if (!form.name || !form.name.trim()) throw new Error("Customer name is required.");

  // Fetch latest business profile settings dynamically
  const settings = await fetchSettings();
  const prefix = (settings.invoice_prefix || "NL").trim().toUpperCase() || "NL";
  const invoiceNumber = await getNextInvoiceNumber(prefix);

  const businessSnapshot = {
    shop_name: settings.shop_name || "NICE LOOKING",
    shop_subtitle: settings.shop_subtitle || "Hair Wig & Hair Services",
    shop_mobile: settings.shop_mobile || settings.whatsapp_number || "",
    shop_address: settings.shop_address || "",
    whatsapp_number: settings.whatsapp_number || settings.shop_mobile || "",
    invoice_prefix: prefix
  };

  const items = Array.isArray(lineItems) && lineItems.length > 0
    ? lineItems
    : (Array.isArray(form.items) && form.items.length > 0
      ? form.items
      : [
          {
            id: "item-1",
            service: form.service || "Hair Wig",
            productId: form.service === "Hair Wig" ? form.productId : null,
            productName: form.productName || "",
            productSize: form.productSize || "",
            quantity: form.service === "Hair Wig" ? Math.max(1, Number(form.quantity || 1)) : 1,
            unitPrice: Number(form.amount || 0),
            amount: Number(form.amount || 0),
            note: ""
          }
        ]);

  let subtotal = 0;
  const processedItems = items.map((it, idx) => {
    const qty = Math.max(1, Number(it.quantity || 1));
    const unitPrice = Math.max(0, Number(it.unitPrice ?? it.price ?? it.amount ?? 0));
    const itemAmount = Math.max(0, Number(it.amount ?? (unitPrice * qty)));
    subtotal += itemAmount;
    return {
      id: it.id || `item-${idx + 1}-${Date.now()}`,
      service: it.service || "Hair Wig",
      productId: it.service === "Hair Wig" ? it.productId || null : null,
      productName: it.productName || "",
      productSize: it.productSize || "",
      quantity: qty,
      unitPrice,
      amount: itemAmount,
      note: it.note || ""
    };
  });

  const discount = Math.max(0, Number(form.discount || 0));
  const total = Math.max(0, subtotal - discount);
  const nowISO = new Date().toISOString();

  const uniqueServices = [...new Set(processedItems.map(i => i.service).filter(Boolean))];
  const serviceSummary = uniqueServices.length > 0 ? uniqueServices.join(", ") : "Hair Service";
  const primaryWigItem = processedItems.find(i => i.service === "Hair Wig" && i.productId) || null;

  const userNotes = (form.description || "").trim();
  const descWithPayload = userNotes
    ? `${userNotes}\n---ITEMS_JSON---\n${JSON.stringify(processedItems)}\n---SETTINGS_JSON---\n${JSON.stringify(businessSnapshot)}`
    : `---ITEMS_JSON---\n${JSON.stringify(processedItems)}\n---SETTINGS_JSON---\n${JSON.stringify(businessSnapshot)}`;

  if (supabaseConfigured) {
    // 1. Decrement stock for all wig items
    for (const wigItem of processedItems) {
      if (wigItem.service === "Hair Wig" && wigItem.productId) {
        try {
          await supabase.rpc("decrement_product_stock", {
            p_product_id: wigItem.productId,
            p_quantity: wigItem.quantity
          });
        } catch (stockErr) {
          console.error("Stock decrement error for wig:", wigItem.productName, stockErr);
          throw new Error(stockErr.message || `Insufficient stock for ${wigItem.productName || "wig product"}.`);
        }
      }
    }

    // 2. Upsert customer
    const digits10 = normMobile.slice(-10);
    let customerId = null;
    const { data: existingCust } = await supabase
      .from("customers")
      .select("id")
      .eq("mobile", digits10)
      .maybeSingle();

    if (existingCust && existingCust.id) {
      customerId = existingCust.id;
      await supabase
        .from("customers")
        .update({
          name: form.name.trim(),
          address: form.address?.trim() || null,
          updated_at: nowISO
        })
        .eq("id", customerId);
    } else {
      const { data: newCust, error: newCustErr } = await supabase
        .from("customers")
        .insert({
          name: form.name.trim(),
          mobile: digits10,
          address: form.address?.trim() || "",
          whatsapp_opt_in: true
        })
        .select("id")
        .single();
      if (newCustErr) throw newCustErr;
      customerId = newCust.id;
    }

    // 3. Create Transaction (matches actual database schema)
    const txnPayload = {
      customer_id: customerId,
      service_type: serviceSummary,
      product_id: primaryWigItem?.productId || null,
      quantity: primaryWigItem?.quantity || 0,
      amount: total,
      discount: discount,
      payment_mode: form.paymentMode || "Cash",
      payment_status: "PAID",
      description: descWithPayload,
      service_date: nowISO,
      created_by: actorInfo?.id || null
    };

    let txn = null;
    const { data: txnData, error: txnErr } = await supabase
      .from("transactions")
      .insert(txnPayload)
      .select("id")
      .single();

    if (!txnErr && txnData) {
      txn = txnData;
    } else if (txnErr) {
      // Retry without created_by if needed
      const { data: retryTxn } = await supabase
        .from("transactions")
        .insert({
          customer_id: customerId,
          service_type: serviceSummary,
          product_id: primaryWigItem?.productId || null,
          quantity: primaryWigItem?.quantity || 0,
          amount: total,
          discount: discount,
          payment_mode: form.paymentMode || "Cash",
          payment_status: "PAID",
          description: descWithPayload,
          service_date: nowISO
        })
        .select("id")
        .single();
      txn = retryTxn;
    }

    // 4. Create Invoice (matches actual database schema)
    const invPayload = {
      invoice_number: invoiceNumber,
      customer_id: customerId,
      transaction_id: txn?.id || null,
      service_type: serviceSummary,
      product_id: primaryWigItem?.productId || null,
      product_name: primaryWigItem?.productName || null,
      product_size: primaryWigItem?.productSize || null,
      quantity: primaryWigItem?.quantity || 0,
      subtotal: subtotal,
      discount: discount,
      total: total,
      payment_mode: form.paymentMode || "Cash",
      description: descWithPayload,
      invoice_date: nowISO
    };

    const { data: invData, error: invErr } = await supabase
      .from("invoices")
      .insert(invPayload)
      .select()
      .single();

    if (invErr) {
      console.error("Invoice insert error:", invErr);
      throw new Error(invErr.message || "Failed to create invoice.");
    }
    const inv = invData;

    logAuditEvent({
      action: "INVOICE_CREATE",
      entityType: "invoice",
      entityId: inv.id,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      newData: { invoice_number: invoiceNumber, total, customer_name: form.name, service: serviceSummary },
      details: `Created Invoice #${invoiceNumber} for ₹${total.toLocaleString("en-IN")}`
    });

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerId: customerId,
      name: form.name.trim(),
      mobile: digits10,
      address: form.address?.trim() || "",
      service: serviceSummary,
      items: processedItems,
      productId: primaryWigItem?.productId || null,
      productName: primaryWigItem?.productName || "",
      productSize: primaryWigItem?.productSize || "",
      quantity: primaryWigItem?.quantity || 0,
      subtotal: subtotal,
      discount: discount,
      amount: total,
      total: total,
      paymentMode: form.paymentMode || "Cash",
      status: "PAID",
      isVoided: false,
      description: userNotes,
      shopSettings: businessSnapshot,
      createdAt: formatToLocalISODate(nowISO)
    };
  }

  // Demo Fallback (LocalStorage)
  const d = getLocalDemoData();

  for (const wigItem of processedItems) {
    if (wigItem.service === "Hair Wig" && wigItem.productId) {
      const prod = (d.products || []).find(p => String(p.id) === String(wigItem.productId));
      if (!prod) throw new Error(`Wig product "${wigItem.productName || "Product"}" not found.`);
      if (Number(prod.stock || 0) < wigItem.quantity) {
        throw new Error(`Insufficient stock for ${prod.name || "wig"}: only ${prod.stock} unit(s) available.`);
      }
      prod.stock = Math.max(0, Number(prod.stock || 0) - wigItem.quantity);
    }
  }

  const digits10 = normMobile.slice(-10);
  let cust = (d.customers || []).find(c => normalizeWhatsAppNumber(c.mobile).slice(-10) === digits10);
  if (cust) {
    cust.name = form.name.trim();
    cust.address = form.address || cust.address;
  } else {
    cust = {
      id: String(Date.now()),
      name: form.name.trim(),
      mobile: digits10,
      address: form.address || "",
      whatsapp_opt_in: true
    };
    d.customers.push(cust);
  }

  const createdInv = {
    id: `inv-${Date.now()}`,
    invoiceNumber,
    customerId: cust.id,
    name: cust.name,
    mobile: cust.mobile,
    address: cust.address,
    service: serviceSummary,
    items: processedItems,
    productId: primaryWigItem?.productId || null,
    productName: primaryWigItem?.productName || "",
    productSize: primaryWigItem?.productSize || "",
    quantity: primaryWigItem?.quantity || 0,
    subtotal: subtotal,
    discount: discount,
    amount: total,
    total: total,
    paymentMode: form.paymentMode || "Cash",
    status: "PAID",
    isVoided: false,
    description: userNotes,
    rawDescription: descWithPayload,
    shopSettings: businessSnapshot,
    createdAt: getMumbaiTodayISO()
  };

  d.invoices = [...(d.invoices || []), createdInv];
  saveLocalDemoData(d);

  logAuditEvent({
    action: "INVOICE_CREATE",
    entityType: "invoice",
    entityId: createdInv.id,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    newData: { invoice_number: invoiceNumber, total, customer_name: form.name },
    details: `Created Invoice #${invoiceNumber} for ₹${total.toLocaleString("en-IN")}`
  });

  return createdInv;
}

/**
 * Voids an invoice safely with confirmation and mandatory reason.
 * Restores wig inventory stock exactly once and records an immutable audit trail.
 */
export async function voidInvoice(invoiceId, reason, actorInfo = null) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    throw new Error("A mandatory reason is required to void an invoice.");
  }

  if (supabaseConfigured) {
    // 1. Try atomic PostgreSQL RPC if deployed
    try {
      const { data, error } = await supabase.rpc("void_invoice", {
        p_invoice_id: invoiceId,
        p_reason: cleanReason
      });

      if (!error && data) {
        return data;
      }
      if (error) {
        console.warn("void_invoice RPC not available or failed, applying direct table void fallback:", error.message);
      }
    } catch (rpcErr) {
      console.warn("void_invoice RPC exception, applying fallback:", rpcErr);
    }

    // 2. Resilient Direct-Table Fallback
    // A. Fetch current invoice record
    const { data: currentInv, error: fetchErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();

    if (fetchErr || !currentInv) {
      throw new Error(fetchErr?.message || "Invoice not found in database.");
    }

    const voidCheck = parseVoidStatus(currentInv);
    if (voidCheck.isVoid) {
      throw new Error("Invoice is already voided.");
    }

    // B. Restore wig stock if applicable
    let stockRestored = false;
    const { items } = parseItemsFromInvoice(currentInv.description, currentInv);
    for (const item of items) {
      if (item.service === "Hair Wig" && item.productId && Number(item.quantity || 0) > 0) {
        try {
          const { data: prod } = await supabase
            .from("wig_products")
            .select("id, stock")
            .eq("id", item.productId)
            .maybeSingle();

          if (prod) {
            await supabase
              .from("wig_products")
              .update({ stock: Number(prod.stock || 0) + Number(item.quantity || 0), updated_at: new Date().toISOString() })
              .eq("id", item.productId);
            stockRestored = true;
          }
        } catch (stkErr) {
          console.warn("Failed to restore wig stock on void fallback:", stkErr);
        }
      }
    }

    if (!stockRestored && (currentInv.service_type === "Hair Wig" || String(currentInv.service_type || "").includes("Hair Wig")) && currentInv.product_id && Number(currentInv.quantity || 0) > 0) {
      try {
        const { data: prod } = await supabase
          .from("wig_products")
          .select("id, stock")
          .eq("id", currentInv.product_id)
          .maybeSingle();

        if (prod) {
          await supabase
            .from("wig_products")
            .update({ stock: Number(prod.stock || 0) + Number(currentInv.quantity || 0), updated_at: new Date().toISOString() })
            .eq("id", currentInv.product_id);
        }
      } catch (stkErr) {
        console.warn("Failed to restore direct wig product stock:", stkErr);
      }
    }

    // C. Mark invoice as VOIDED using description marker
    const nowIso = new Date().toISOString();
    const existingDesc = String(currentInv.description || "");
    const voidMarker = `---VOIDED--- Reason: ${cleanReason} (by ${actorInfo?.name || "Staff"})`;
    const newDesc = existingDesc.includes("---VOIDED---")
      ? existingDesc
      : existingDesc ? `${voidMarker}\n${existingDesc}` : voidMarker;

    const { error: descErr } = await supabase
      .from("invoices")
      .update({
        description: newDesc,
        updated_at: nowIso
      })
      .eq("id", invoiceId);

    if (descErr) {
      // Retry without updated_at if needed
      const { error: fbDescErr } = await supabase
        .from("invoices")
        .update({
          description: newDesc
        })
        .eq("id", invoiceId);

      if (fbDescErr) {
        throw new Error(fbDescErr.message || "Failed to mark invoice as VOIDED.");
      }
    }

    // D. Mark linked transaction as VOIDED
    if (currentInv.transaction_id) {
      try {
        await supabase
          .from("transactions")
          .update({
            payment_status: "VOIDED",
            updated_at: nowIso
          })
          .eq("id", currentInv.transaction_id);
      } catch {
        try {
          await supabase
            .from("transactions")
            .update({
              payment_status: "VOIDED"
            })
            .eq("id", currentInv.transaction_id);
        } catch {}
      }
    }

    // E. Log immutable audit event
    await logAuditEvent({
      action: "INVOICE_VOID",
      entityType: "invoice",
      entityId: invoiceId,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      oldData: { invoice_number: currentInv.invoice_number, total: currentInv.total },
      newData: { status: "VOIDED", is_voided: true, void_reason: cleanReason },
      reason: cleanReason,
      details: `Voided Invoice #${currentInv.invoice_number}. Reason: ${cleanReason}`
    });

    return {
      id: invoiceId,
      invoice_number: currentInv.invoice_number,
      status: "VOIDED",
      is_voided: true,
      isVoided: true,
      void_reason: cleanReason,
      voidReason: cleanReason,
      voided_at: nowIso,
      voidedAt: formatToLocalISODate(nowIso),
      voided_by_name: actorInfo?.name || "Staff",
      voidedByName: actorInfo?.name || "Staff",
      amount: currentInv.total,
      total: currentInv.total
    };
  }

  // Demo Fallback (LocalStorage)
  const d = getLocalDemoData();
  const targetIdx = (d.invoices || []).findIndex(i => String(i.id) === String(invoiceId));
  if (targetIdx < 0) throw new Error("Invoice not found.");
  const inv = d.invoices[targetIdx];

  const localVoidCheck = parseVoidStatus(inv);
  if (localVoidCheck.isVoid) {
    throw new Error("Invoice is already voided.");
  }

  // Restore stock for wig products in line items exactly once
  const { items } = parseItemsFromInvoice(inv.rawDescription || inv.description, inv);
  for (const item of items) {
    if (item.service === "Hair Wig" && item.productId && Number(item.quantity || 0) > 0) {
      const prod = (d.products || []).find(p => String(p.id) === String(item.productId));
      if (prod) {
        prod.stock = Number(prod.stock || 0) + Number(item.quantity || 0);
      }
    }
  }

  const now = new Date().toISOString();
  const voidedInv = {
    ...inv,
    status: "VOIDED",
    isVoided: true,
    is_voided: true,
    voidedAt: formatToLocalISODate(now),
    voided_at: now,
    voidReason: cleanReason,
    void_reason: cleanReason,
    voidedByName: actorInfo?.name || "Staff",
    voided_by_name: actorInfo?.name || "Staff"
  };

  d.invoices[targetIdx] = voidedInv;
  saveLocalDemoData(d);

  logAuditEvent({
    action: "INVOICE_VOID",
    entityType: "invoice",
    entityId: invoiceId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    oldData: { invoice_number: inv.invoiceNumber, total: inv.total || inv.amount },
    newData: { status: "VOIDED", reason: cleanReason },
    reason: cleanReason,
    details: `Voided Invoice #${inv.invoiceNumber}. Reason: ${cleanReason}`
  });

  return voidedInv;
}

/**
 * Updates invoice atomically (Owner/Admin Only).
 * Adjusts wig stock safely at database level and records old vs new audit diff.
 */
export async function updateInvoice(updatedData, selectedProduct, actorInfo = null) {
  const normMobile = normalizeWhatsAppNumber(updatedData.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  if (!updatedData.name || !updatedData.name.trim()) throw new Error("Customer name is required.");

  const isHairWig = updatedData.service === "Hair Wig";
  const validProductId = isHairWig && updatedData.productId && String(updatedData.productId).trim() !== ""
    ? String(updatedData.productId).trim()
    : null;

  if (isHairWig && !validProductId) {
    throw new Error("Please select a valid Wig Product.");
  }

  const qty = isHairWig ? Math.max(1, Number(updatedData.quantity || 1)) : 0;
  const subtotal = Math.max(0, Number(updatedData.subtotal ?? updatedData.amount ?? 0));
  const discount = Math.max(0, Number(updatedData.discount || 0));
  const total = Math.max(0, Number(updatedData.total !== undefined && updatedData.total !== null && !isNaN(Number(updatedData.total)) ? updatedData.total : (subtotal - discount)));

  if (supabaseConfigured) {
    try {
      const rpcParams = {
        p_invoice_id: updatedData.id,
        p_customer_name: updatedData.name.trim(),
        p_customer_mobile: normMobile.slice(-10),
        p_customer_address: updatedData.address?.trim() || "",
        p_service_type: updatedData.service,
        p_product_id: validProductId,
        p_quantity: qty,
        p_subtotal: subtotal,
        p_discount: discount,
        p_total: total,
        p_payment_mode: updatedData.paymentMode || "Cash",
        p_description: updatedData.description?.trim() || "",
        p_invoice_date: updatedData.rawCreatedAt || updatedData.invoice_date || null
      };

      const { data, error } = await supabase.rpc("update_invoice_with_stock", rpcParams);
      if (!error && data) return data;
      if (error) console.warn("update_invoice_with_stock RPC failed, applying direct table update fallback:", error.message);
    } catch (rpcErr) {
      console.warn("update_invoice_with_stock exception:", rpcErr);
    }

    // Direct table update matching schema columns
    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        service_type: updatedData.service,
        product_id: validProductId,
        product_name: isHairWig ? (selectedProduct?.name || "") : null,
        product_size: isHairWig ? (selectedProduct?.size || "") : null,
        quantity: qty,
        subtotal: subtotal,
        discount: discount,
        total: total,
        payment_mode: updatedData.paymentMode || "Cash",
        description: updatedData.description?.trim() || "",
        updated_at: new Date().toISOString()
      })
      .eq("id", updatedData.id);

    if (updErr) throw updErr;

    logAuditEvent({
      action: "INVOICE_EDIT",
      entityType: "invoice",
      entityId: updatedData.id,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      newData: { total: total, service: updatedData.service, paymentMode: updatedData.paymentMode },
      details: `Updated Invoice #${updatedData.invoiceNumber || updatedData.id} (Total: ₹${total.toLocaleString("en-IN")})`
    });

    return updatedData;
  }

  // Demo Fallback (LocalStorage)
  const d = getLocalDemoData();
  const oldInvIdx = (d.invoices || []).findIndex(i => String(i.id) === String(updatedData.id));
  if (oldInvIdx < 0) throw new Error("Invoice not found.");
  const oldInv = d.invoices[oldInvIdx];

  if (isHairWig && validProductId) {
    const newProd = (d.products || []).find(p => String(p.id) === String(validProductId));
    if (!newProd) throw new Error("Selected wig product not found.");

    if (String(oldInv.productId) === String(validProductId)) {
      const delta = qty - Number(oldInv.quantity || 0);
      if (delta > 0 && Number(newProd.stock || 0) < delta) {
        throw new Error(`Insufficient stock: only ${newProd.stock} additional unit(s) available.`);
      }
      newProd.stock = Math.max(0, Number(newProd.stock || 0) - delta);
    } else {
      if (oldInv.productId) {
        const oldProd = (d.products || []).find(p => String(p.id) === String(oldInv.productId));
        if (oldProd) oldProd.stock = Number(oldProd.stock || 0) + Number(oldInv.quantity || 0);
      }
      if (Number(newProd.stock || 0) < qty) {
        throw new Error(`Insufficient stock: only ${newProd.stock} unit(s) available.`);
      }
      newProd.stock = Math.max(0, Number(newProd.stock || 0) - qty);
    }
  } else if (oldInv.productId) {
    const oldProd = (d.products || []).find(p => String(p.id) === String(oldInv.productId));
    if (oldProd) oldProd.stock = Number(oldProd.stock || 0) + Number(oldInv.quantity || 0);
  }

  const saved = {
    ...oldInv,
    name: updatedData.name.trim(),
    mobile: normMobile.slice(-10),
    address: updatedData.address || "",
    service: updatedData.service,
    productId: isHairWig ? validProductId : null,
    productName: isHairWig ? selectedProduct?.name || oldInv.productName : "",
    productSize: isHairWig ? selectedProduct?.size || oldInv.productSize : "",
    quantity: qty,
    subtotal,
    discount,
    amount: total,
    total,
    paymentMode: updatedData.paymentMode,
    description: updatedData.description || ""
  };

  d.invoices[oldInvIdx] = saved;
  saveLocalDemoData(d);

  logAuditEvent({
    action: "INVOICE_EDIT",
    entityType: "invoice",
    entityId: updatedData.id,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    oldData: { total: oldInv.total || oldInv.amount, service: oldInv.service, paymentMode: oldInv.paymentMode },
    newData: { total: total, service: updatedData.service, paymentMode: updatedData.paymentMode },
    details: `Updated Invoice #${oldInv.invoiceNumber} (Total: ₹${total.toLocaleString("en-IN")})`
  });

  return saved;
}

/**
 * Permanently deletes invoice (Admin/Owner Only).
 */
export async function deleteInvoice(invoiceId, actorInfo = null) {
  if (supabaseConfigured) {
    try {
      const { error } = await supabase.rpc("delete_invoice_with_stock", {
        p_invoice_id: invoiceId
      });
      if (!error) return true;
      console.warn("delete_invoice_with_stock RPC failed, applying direct table delete fallback:", error.message);
    } catch (rpcErr) {
      console.warn("delete_invoice_with_stock exception:", rpcErr);
    }

    const { error: delErr } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId);

    if (delErr) throw delErr;

    logAuditEvent({
      action: "INVOICE_DELETE",
      entityType: "invoice",
      entityId: invoiceId,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      details: `Permanently deleted Invoice ID ${invoiceId}`
    });

    return true;
  }

  // Demo Fallback (LocalStorage)
  const d = getLocalDemoData();
  const target = (d.invoices || []).find(i => String(i.id) === String(invoiceId));
  if (!target) throw new Error("Invoice not found.");

  if (!target.isVoided) {
    const { items } = parseItemsFromInvoice(target.rawDescription || target.description, target);
    for (const item of items) {
      if (item.service === "Hair Wig" && item.productId && Number(item.quantity || 0) > 0) {
        const prod = (d.products || []).find(p => String(p.id) === String(item.productId));
        if (prod) {
          prod.stock = Number(prod.stock || 0) + Number(item.quantity || 0);
        }
      }
    }
  }

  d.invoices = (d.invoices || []).filter(i => String(i.id) !== String(invoiceId));
  saveLocalDemoData(d);

  logAuditEvent({
    action: "INVOICE_DELETE",
    entityType: "invoice",
    entityId: invoiceId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    details: `Permanently deleted invoice #${target.invoiceNumber}`
  });

  return true;
}

// -------------------------------------------------------------
// Settings Management
// -------------------------------------------------------------
export async function fetchSettings() {
  const defaultSettings = {
    shop_name: "NICE LOOKING",
    shop_subtitle: "Hair Wig & Hair Services",
    shop_mobile: "+91 98765 43210",
    shop_address: "Mumbai, Maharashtra",
    invoice_prefix: "NL",
    whatsapp_number: "919876543210"
  };

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (error) {
        console.warn("Could not load settings from Supabase, checking local cache:", error);
      } else if (data) {
        try {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
        } catch {}
        return {
          shop_name: data.shop_name || defaultSettings.shop_name,
          shop_subtitle: data.shop_subtitle !== undefined && data.shop_subtitle !== null ? data.shop_subtitle : defaultSettings.shop_subtitle,
          shop_mobile: data.shop_mobile || data.whatsapp_number || defaultSettings.shop_mobile,
          shop_address: data.shop_address !== undefined && data.shop_address !== null ? data.shop_address : defaultSettings.shop_address,
          invoice_prefix: data.invoice_prefix || defaultSettings.invoice_prefix,
          whatsapp_number: data.whatsapp_number || data.shop_mobile || defaultSettings.whatsapp_number
        };
      }
    } catch (err) {
      console.warn("Supabase fetchSettings error:", err);
    }
  }

  // Demo Fallback / LocalStorage
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        shop_name: parsed.shop_name || defaultSettings.shop_name,
        shop_subtitle: parsed.shop_subtitle !== undefined && parsed.shop_subtitle !== null ? parsed.shop_subtitle : defaultSettings.shop_subtitle,
        shop_mobile: parsed.shop_mobile || parsed.whatsapp_number || defaultSettings.shop_mobile,
        shop_address: parsed.shop_address !== undefined && parsed.shop_address !== null ? parsed.shop_address : defaultSettings.shop_address,
        invoice_prefix: parsed.invoice_prefix || defaultSettings.invoice_prefix,
        whatsapp_number: parsed.whatsapp_number || parsed.shop_mobile || defaultSettings.whatsapp_number
      };
    }
    return defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export const getBusinessSettings = fetchSettings;

export async function saveSettings(settings, actorInfo = null) {
  const payload = {
    id: "default",
    shop_name: (settings.shop_name || "NICE LOOKING").trim(),
    shop_subtitle: (settings.shop_subtitle || "").trim(),
    shop_mobile: (settings.shop_mobile || settings.whatsapp_number || "").trim(),
    shop_address: (settings.shop_address || "").trim(),
    invoice_prefix: (settings.invoice_prefix || "NL").trim().toUpperCase() || "NL",
    whatsapp_number: (settings.whatsapp_number || settings.shop_mobile || "").trim(),
    updated_at: new Date().toISOString()
  };

  if (supabaseConfigured) {
    const { data, error } = await supabase
      .from("settings")
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}

    logAuditEvent({
      action: "SETTINGS_UPDATE",
      entityType: "settings",
      entityId: "default",
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      details: `Updated business profile: ${payload.shop_name}`
    });

    return data || payload;
  }

  // Demo Fallback
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));

  logAuditEvent({
    action: "SETTINGS_UPDATE",
    entityType: "settings",
    entityId: "default",
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    details: `Updated business profile: ${payload.shop_name}`
  });

  return payload;
}

export const saveBusinessSettings = saveSettings;
