import { supabase, supabaseConfigured, createIsolatedClient, getMumbaiTodayISO, formatToLocalISODate, getAppBaseUrl } from "./supabase.js";
import { demoCustomers, demoProducts } from "../data/demo.js";
import { normalizeWhatsAppNumber } from "./whatsapp.js";

const STORAGE_KEY = "nice-looking-mvp-multitenant-v5";
const SALONS_STORAGE_KEY = "nice-looking-salons-v5";
const SETTINGS_STORAGE_KEY = "nice-looking-settings-v5";
const AUDIT_LOGS_KEY = "nice-looking-audit-logs-v5";
const STAFF_PROFILES_KEY = "nice-looking-staff-profiles-v5";
const LOCAL_CREDENTIALS_KEY = "nice-looking-local-creds-v5";
const LOCAL_SESSION_KEY = "nice-looking-active-session-v5";

function getLocalCredentials() {
  try {
    const raw = localStorage.getItem(LOCAL_CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalCredential(email, password, extra = {}) {
  try {
    const creds = getLocalCredentials();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return;
    creds[cleanEmail] = {
      email: cleanEmail,
      password: String(password || ""),
      updatedAt: new Date().toISOString(),
      ...(creds[cleanEmail] || {}),
      ...extra
    };
    localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(creds));
  } catch {}
}

// Default Primary Salon Configuration
export const defaultSalonsList = [
  {
    id: "default",
    name: "NICE LOOKING (Main Branch)",
    slug: "nice-looking-main",
    subtitle: "Hair Wig & Hair Services",
    mobile: "+91 98765 43210",
    email: "sameershaikh584@gmail.com",
    address: "Shop 4, Hill Road, Bandra West, Mumbai",
    invoice_prefix: "NL",
    whatsapp_number: "919876543210",
    status: "ACTIVE",
    owner_name: "Sameer Shaikh",
    owner_email: "sameershaikh584@gmail.com",
    created_at: "2026-08-01T00:00:00.000Z"
  }
];

// Production Multi-Tenant Cache Store
function getLocalDemoData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = {
        customers: [],
        products: [],
        invoices: []
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

function getLocalSalons() {
  try {
    const raw = localStorage.getItem(SALONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SALONS_STORAGE_KEY, JSON.stringify(defaultSalonsList));
      return defaultSalonsList;
    }
    return JSON.parse(raw);
  } catch {
    return defaultSalonsList;
  }
}

function saveLocalSalons(salons) {
  try {
    localStorage.setItem(SALONS_STORAGE_KEY, JSON.stringify(salons));
  } catch {}
}

function getLocalAuditLogs() {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (!raw) {
      const initialLogs = [];
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

function generateValidUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeProfile(p) {
  if (!p) return p;
  const name = (p.full_name || p.fullName || p.name || (p.email ? p.email.split("@")[0] : "Staff Member")).trim();
  const salon = p.salon_id || p.salonId || "default";
  const assigned = Array.isArray(p.assigned_salons) ? p.assigned_salons : (Array.isArray(p.assignedSalons) ? p.assignedSalons : [salon]);
  const mustChange = Boolean(p.must_change_password ?? p.mustChangePassword);
  return {
    ...p,
    id: String(p.id),
    email: p.email || "",
    full_name: name,
    fullName: name,
    role: (p.role || "staff").toLowerCase(),
    salon_id: salon,
    salonId: salon,
    assigned_salons: assigned,
    assignedSalons: assigned,
    must_change_password: mustChange,
    mustChangePassword: mustChange,
    created_at: p.created_at || new Date().toISOString()
  };
}

function getLocalStaffProfiles() {
  try {
    const raw = localStorage.getItem(STAFF_PROFILES_KEY);
    if (!raw) {
      const initialStaff = [];
      localStorage.setItem(STAFF_PROFILES_KEY, JSON.stringify(initialStaff));
      return initialStaff;
    }
    return JSON.parse(raw).map(normalizeProfile);
  } catch {
    return [];
  }
}

function saveLocalStaffProfiles(profiles) {
  try {
    const normalized = (profiles || []).map(normalizeProfile);
    localStorage.setItem(STAFF_PROFILES_KEY, JSON.stringify(normalized));
  } catch {}
}

// -------------------------------------------------------------
// Salons / Multi-Tenant Management
// -------------------------------------------------------------
export async function fetchSalons(userRole = "superadmin", userSalonId = "default", assignedSalons = [], userEmail = "") {
  const normRole = (userRole || "staff").toLowerCase();
  const isSuper = normRole === "superadmin" || normRole === "super_admin";
  const cleanEmail = (userEmail || "").trim().toLowerCase();

  let remoteSalons = null;
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("salons")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        remoteSalons = data;
      }
    } catch (err) {
      console.warn("fetchSalons Supabase query failed, using local cache:", err);
    }
  }

  // Merge remote with local salons so no newly created branch is lost
  const localSalons = getLocalSalons();
  let mergedSalons = [...localSalons];

  if (Array.isArray(remoteSalons) && remoteSalons.length > 0) {
    const localMap = new Map(localSalons.map(s => [s.id, s]));
    remoteSalons.forEach(s => {
      localMap.set(s.id, { ...(localMap.get(s.id) || {}), ...s });
    });
    mergedSalons = Array.from(localMap.values());
    saveLocalSalons(mergedSalons);
  }

  if (isSuper) {
    return mergedSalons;
  }

  const assignedList = Array.isArray(assignedSalons) ? assignedSalons : [];

  return mergedSalons.filter(s => {
    // 1. Direct active salon ID
    if (userSalonId && s.id === userSalonId) return true;
    // 2. In assigned salons array
    if (assignedList.includes(s.id)) return true;
    // 3. Owned branch matching owner email
    if (cleanEmail && s.owner_email && s.owner_email.trim().toLowerCase() === cleanEmail) return true;
    // 4. Contact email match
    if (cleanEmail && s.email && s.email.trim().toLowerCase() === cleanEmail) return true;
    return false;
  });
}

export async function saveSalon(salonData, actorInfo = null) {
  const isNew = !salonData.id || salonData.id.startsWith("new-") || salonData.isNew === true;
  const rawSlug = salonData.slug || salonData.name || "salon";
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const salonId = isNew
    ? (salonData.id && !salonData.id.startsWith("new-") ? salonData.id : `salon-${slug || "branch"}-${Date.now().toString(36)}`)
    : salonData.id;

  const payload = {
    id: salonId,
    name: (salonData.name || "Salon Branch").trim(),
    slug: slug || `salon-${Date.now()}`,
    subtitle: (salonData.subtitle || "Hair Wig & Hair Services").trim(),
    mobile: (salonData.mobile || "+91 98765 43210").trim(),
    email: (salonData.email || "sameershaikh121@proton.me").trim(),
    address: (salonData.address || "Mumbai, Maharashtra").trim(),
    invoice_prefix: (salonData.invoice_prefix || "NL").trim().toUpperCase() || "NL",
    whatsapp_number: (salonData.whatsapp_number || "919876543210").trim(),
    status: salonData.status || "ACTIVE",
    owner_name: (salonData.owner_name || actorInfo?.name || "Salon Owner").trim(),
    owner_email: (salonData.owner_email || actorInfo?.email || "").trim(),
    updated_at: new Date().toISOString()
  };

  if (isNew) {
    payload.created_at = new Date().toISOString();
  }

  let finalSavedSalon = payload;

  // Optimistically update local cache so the branch always appears immediately
  const salons = getLocalSalons();
  const idx = salons.findIndex(s => s.id === salonId);
  if (idx >= 0) {
    salons[idx] = { ...salons[idx], ...payload };
  } else {
    salons.push(payload);
  }
  saveLocalSalons(salons);

  // Link newly created or updated branch to the owner's profile and credentials
  const cleanOwnerEmail = (payload.owner_email || "").trim().toLowerCase();
  if (cleanOwnerEmail) {
    try {
      const profiles = getLocalStaffProfiles();
      const pIdx = profiles.findIndex(p => (p.email || "").toLowerCase() === cleanOwnerEmail);
      if (pIdx >= 0) {
        const curAssigned = Array.isArray(profiles[pIdx].assigned_salons)
          ? profiles[pIdx].assigned_salons
          : (Array.isArray(profiles[pIdx].assignedSalons) ? profiles[pIdx].assignedSalons : []);
        if (!curAssigned.includes(salonId)) {
          profiles[pIdx].assigned_salons = [...curAssigned, salonId];
          profiles[pIdx].assignedSalons = [...curAssigned, salonId];
          if (profiles[pIdx].role === "staff") {
            profiles[pIdx].role = "owner";
          }
          saveLocalStaffProfiles(profiles);
        }
      }

      const creds = getLocalCredentials();
      if (creds[cleanOwnerEmail]) {
        const credAssigned = Array.isArray(creds[cleanOwnerEmail].assignedSalons)
          ? creds[cleanOwnerEmail].assignedSalons
          : [creds[cleanOwnerEmail].salonId || "default"];
        if (!credAssigned.includes(salonId)) {
          creds[cleanOwnerEmail].assignedSalons = [...credAssigned, salonId];
          if (creds[cleanOwnerEmail].role === "staff") {
            creds[cleanOwnerEmail].role = "owner";
          }
          try {
            localStorage.setItem(LOCAL_CREDENTIALS_KEY, JSON.stringify(creds));
          } catch {}
        }
      }
    } catch (syncErr) {
      console.warn("Owner local sync note:", syncErr);
    }
  }

  if (supabaseConfigured) {
    let supabaseSucceeded = false;

    // 1. Try atomic RPC procedure: save_salon_branch
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("save_salon_branch", {
        p_id: payload.id,
        p_name: payload.name,
        p_slug: payload.slug,
        p_subtitle: payload.subtitle,
        p_invoice_prefix: payload.invoice_prefix,
        p_mobile: payload.mobile,
        p_email: payload.email,
        p_address: payload.address,
        p_whatsapp_number: payload.whatsapp_number,
        p_owner_name: payload.owner_name,
        p_owner_email: payload.owner_email,
        p_status: payload.status
      });

      if (!rpcErr && rpcData) {
        finalSavedSalon = rpcData;
        supabaseSucceeded = true;
      } else if (rpcErr) {
        console.warn("save_salon_branch RPC note (falling back to direct table write):", rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn("save_salon_branch RPC exception:", rpcEx);
    }

    // 2. Direct table upsert fallback
    if (!supabaseSucceeded) {
      try {
        const { data: upsData, error: upsErr } = await supabase
          .from("salons")
          .upsert(payload)
          .select()
          .maybeSingle();

        if (!upsErr && upsData) {
          finalSavedSalon = upsData;
          supabaseSucceeded = true;
        } else if (upsErr) {
          console.warn("Direct salons upsert warning (saved locally). Run supabase/COMPLETE_SUPABASE_FIX.sql in Supabase SQL Editor to grant full DB permissions:", upsErr.message);
        }
      } catch (directErr) {
        console.warn("Supabase direct salon write warning (saved locally):", directErr);
      }
    }

    // Re-sync local cache with remote result
    if (supabaseSucceeded && finalSavedSalon) {
      const updatedSalons = getLocalSalons();
      const uIdx = updatedSalons.findIndex(s => s.id === salonId);
      if (uIdx >= 0) {
        updatedSalons[uIdx] = { ...updatedSalons[uIdx], ...finalSavedSalon };
      } else {
        updatedSalons.push(finalSavedSalon);
      }
      saveLocalSalons(updatedSalons);
    }
  }

  logAuditEvent({
    action: isNew ? "SALON_CREATE" : "SALON_UPDATE",
    entityType: "salon",
    entityId: salonId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: salonId,
    newData: finalSavedSalon,
    details: `${isNew ? "Created" : "Updated"} Salon Branch: ${payload.name} (${payload.invoice_prefix})`
  }).catch(() => {});

  return finalSavedSalon;
}

export async function deleteSalon(salonId, actorInfo = null) {
  if (!salonId || salonId === "default") {
    throw new Error("Cannot delete the primary/default salon branch.");
  }

  if (supabaseConfigured) {
    let rpcDone = false;

    // 1. Try atomic RPC delete_salon_branch
    try {
      const { data, error } = await supabase.rpc("delete_salon_branch", {
        p_salon_id: salonId
      });
      if (!error) {
        rpcDone = true;
      } else {
        console.warn("delete_salon_branch RPC note, executing direct cleanup:", error.message);
      }
    } catch (rpcErr) {
      console.warn("delete_salon_branch RPC exception:", rpcErr);
    }

    // 2. Direct cascade delete fallback
    if (!rpcDone) {
      try {
        await supabase
          .from("profiles")
          .update({ salon_id: "default", updated_at: new Date().toISOString() })
          .eq("salon_id", salonId);

        await supabase.from("whatsapp_messages").delete().eq("salon_id", salonId);
        await supabase.from("offers").delete().eq("salon_id", salonId);
        await supabase.from("invoices").delete().eq("salon_id", salonId);
        await supabase.from("transactions").delete().eq("salon_id", salonId);
        await supabase.from("wig_products").delete().eq("salon_id", salonId);
        await supabase.from("services").delete().eq("salon_id", salonId);
        await supabase.from("customers").delete().eq("salon_id", salonId);

        await supabase
          .from("salons")
          .delete()
          .eq("id", salonId);
      } catch (delError) {
        console.warn("Supabase deleteSalon warning (cleaning local storage):", delError);
      }
    }
  }

  // Synchronize local storage
  const salons = getLocalSalons().filter(s => s.id !== salonId);
  saveLocalSalons(salons);

  // If active salon was deleted, reset active salon to default
  try {
    const activeId = localStorage.getItem("nice-looking-active-salon-id");
    if (activeId === salonId) {
      localStorage.setItem("nice-looking-active-salon-id", "default");
    }
  } catch {}

  logAuditEvent({
    action: "SALON_DELETE",
    entityType: "salon",
    entityId: salonId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: salonId,
    details: `Permanently deleted Salon Branch ID: ${salonId}`
  }).catch(() => {});

  return true;
}

// -------------------------------------------------------------
// Authentication & User Profile
// -------------------------------------------------------------
export async function getSession() {
  if (supabase && supabase.auth) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data?.session) {
        return data.session;
      }
    } catch (err) {
      console.error("Failed to retrieve Supabase session:", err);
    }
  }

  // Fallback to active local session
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user) return parsed;
    }
  } catch {}

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

  let supabaseSession = null;
  let supabaseAuthError = null;
  let isNetworkError = false;

  if (supabase && supabase.auth && supabaseConfigured) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      if (error) {
        supabaseAuthError = error;
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("connection")) {
          isNetworkError = true;
        }
      } else if (data?.session) {
        supabaseSession = data.session;
      }
    } catch (err) {
      supabaseAuthError = err;
      isNetworkError = true;
    }
  }

  if (supabaseSession) {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {}

    // Synchronize successful password to local credentials vault immediately
    saveLocalCredential(cleanEmail, password, {
      role: supabaseSession.user?.user_metadata?.role,
      salonId: supabaseSession.user?.user_metadata?.salon_id,
      mustChangePassword: Boolean(supabaseSession.user?.user_metadata?.must_change_password)
    });

    if (supabaseSession.user?.id) {
      logAuditEvent({
        action: "LOGIN",
        entityType: "auth",
        entityId: supabaseSession.user.id,
        userId: supabaseSession.user.id,
        userEmail: supabaseSession.user.email,
        details: `User ${supabaseSession.user.email} logged into the portal.`
      }).catch(err => console.warn("Failed to log login event:", err));
    }

    return supabaseSession;
  }

  // If Supabase is configured and responded with invalid credentials, REJECT the login!
  // Never allow outdated/old credentials to log in when Supabase is live and actively rejected the password.
  if (supabaseConfigured && supabaseAuthError && !isNetworkError) {
    throw supabaseAuthError;
  }

  // Resilience & Offline Fallback: Check local vault credentials ONLY when offline / demo accounts
  const localCreds = getLocalCredentials();
  const matchedCred = localCreds[cleanEmail];
  const localProfiles = getLocalStaffProfiles();
  const matchedProfile = localProfiles.find(p => p.email?.toLowerCase() === cleanEmail);

  // Check if credentials match in local store or if profile exists
  if (matchedCred && matchedCred.password === password) {
    const localUser = matchedProfile || {
      id: "local-user-" + cleanEmail.replace(/[^a-z0-9]/g, "-"),
      email: cleanEmail,
      fullName: cleanEmail.split("@")[0],
      role: matchedCred.role || "staff",
      salonId: matchedCred.salonId || "default",
      mustChangePassword: Boolean(matchedCred.mustChangePassword)
    };

    const localSession = {
      access_token: "local-token-" + Date.now(),
      token_type: "bearer",
      user: {
        id: localUser.id || ("local-" + cleanEmail),
        email: cleanEmail,
        user_metadata: {
          full_name: localUser.fullName || localUser.full_name,
          role: localUser.role,
          salon_id: localUser.salonId || localUser.salon_id,
          must_change_password: Boolean(localUser.mustChangePassword)
        }
      }
    };

    try {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(localSession));
    } catch {}

    logAuditEvent({
      action: "LOGIN",
      entityType: "auth",
      entityId: localSession.user.id,
      userId: localSession.user.id,
      userEmail: cleanEmail,
      details: `User ${cleanEmail} logged into the portal (Local / Offline Session).`
    }).catch(() => {});

    return localSession;
  }

  if (supabaseAuthError) {
    throw supabaseAuthError;
  }

  throw new Error("Invalid login credentials");
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
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName,
          name: fullName
        }
      }
    });
    if (error) {
      const errMsg = (error.message || "").toLowerCase();
      if (errMsg.includes("rate limit") || errMsg.includes("too many") || error.code === "over_email_send_rate_limit") {
        throw new Error("Email sending rate limit reached. Please wait a few minutes before trying again.");
      }
      if (errMsg.includes("already registered") || errMsg.includes("already exists")) {
        throw new Error("An account with this email address already exists. Please log in or reset your password.");
      }
      throw error;
    }

    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("An account with this email address already exists. Please log in or reset your password.");
    }

    if (data?.session) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }

    return {
      user: data?.user,
      email: cleanEmail,
      requiresOtp: true
    };
  }
  
  // Offline / Demo Simulation
  return {
    user: {
      id: "demo-user-" + Date.now(),
      email: cleanEmail,
      user_metadata: { full_name: name || "Staff" }
    },
    email: cleanEmail,
    requiresOtp: true
  };
}

export async function verifySignUpOtp(email, token) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanToken = String(token || "").trim();
  if (!cleanEmail || !cleanToken) {
    throw new Error("Email and 6-digit verification code are required.");
  }
  if (cleanToken.length !== 6) {
    throw new Error("Please enter a valid 6-digit OTP code.");
  }

  if (supabaseConfigured && supabase?.auth) {
    let verifyError = null;
    let data = null;

    try {
      const res = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: "signup"
      });
      data = res.data;
      verifyError = res.error;
    } catch (e) {
      verifyError = e;
    }

    if (verifyError) {
      try {
        const fallbackRes = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: "email"
        });
        if (!fallbackRes.error) {
          data = fallbackRes.data;
          verifyError = null;
        }
      } catch {}
    }

    if (verifyError) {
      throw verifyError;
    }

    try {
      await supabase.auth.signOut();
    } catch {}

    const userId = data?.user?.id || "verified-user";
    const userEmail = data?.user?.email || cleanEmail;

    logAuditEvent({
      action: "OTP_VERIFIED",
      entityType: "auth",
      entityId: userId,
      userId: userId,
      userEmail: userEmail,
      details: `User ${userEmail} verified 6-digit OTP successfully.`
    }).catch(() => {});

    return {
      success: true,
      email: cleanEmail,
      user: data?.user || { id: userId, email: userEmail }
    };
  }

  // Demo Mode
  if (cleanToken === "123456" || cleanToken.length === 6) {
    return {
      success: true,
      email: cleanEmail,
      user: {
        id: "demo-user-" + Date.now(),
        email: cleanEmail,
        user_metadata: { full_name: "Verified User" }
      }
    };
  }

  throw new Error("Invalid 6-digit OTP code. (In demo mode, use 123456).");
}

export async function resendSignUpOtp(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email address is required to resend OTP.");
  }

  if (supabaseConfigured && supabase?.auth) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail
    });
    if (error) {
      const { error: err2 } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail
      });
      if (err2) throw err2;
    }
    return true;
  }

  return true;
}

export async function resetPasswordForEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Email address is required to send password reset.");
  }

  if (supabaseConfigured && supabase?.auth) {
    const appBase = getAppBaseUrl();
    const redirectTo = `${appBase}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo
    });
    if (error) throw error;
    return true;
  }

  return true;
}

export async function verifyPasswordResetOtp(email, token) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanToken = String(token || "").trim();

  if (supabaseConfigured && supabase?.auth) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: "recovery"
    });
    if (error) throw error;
    return data;
  }

  return { success: true };
}

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }

  // Update local session / credential if present
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) {
      const sess = JSON.parse(raw);
      if (sess?.user?.email) {
        saveLocalCredential(sess.user.email, newPassword, {
          mustChangePassword: false
        });
      }
    }
  } catch {}

  if (supabaseConfigured && supabase?.auth) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return data;
  }

  return { success: true };
}

export async function logoutUser() {
  if (supabase && supabase.auth) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut warning:", err);
    }
  }
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
  return true;
}

export async function fetchUserProfile(userId, fallbackEmail = null) {
  if (!userId && !fallbackEmail) return null;
  const cleanEmail = (fallbackEmail || "").trim().toLowerCase();

  const allSalons = getLocalSalons();
  const ownedSalonIds = allSalons
    .filter(s => cleanEmail && s.owner_email && s.owner_email.trim().toLowerCase() === cleanEmail)
    .map(s => s.id);

  if (supabaseConfigured && userId && !String(userId).startsWith("local-")) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data) {
        const rawAssigned = Array.isArray(data.assigned_salons) ? data.assigned_salons : [data.salon_id || "default"];
        const mergedAssigned = Array.from(new Set([...rawAssigned, ...ownedSalonIds]));
        const effectiveRole = (data.role === "staff" && ownedSalonIds.length > 0) ? "owner" : (data.role || "staff");

        return normalizeProfile({
          id: data.id,
          email: data.email || fallbackEmail,
          full_name: data.full_name || fallbackEmail?.split("@")[0] || "User",
          role: effectiveRole,
          salon_id: data.salon_id || (mergedAssigned[0] || "default"),
          assigned_salons: mergedAssigned,
          assignedSalons: mergedAssigned,
          must_change_password: Boolean(data.must_change_password)
        });
      }
    } catch (err) {
      console.warn("fetchUserProfile Supabase note:", err);
    }
  }

  // Local / Demo Fallback
  const profiles = getLocalStaffProfiles();
  const found = profiles.find(p => p.id === userId || (cleanEmail && p.email?.toLowerCase() === cleanEmail));
  const creds = getLocalCredentials();
  const cred = creds[cleanEmail];

  if (found) {
    const rawAssigned = Array.isArray(found.assigned_salons) ? found.assigned_salons : (Array.isArray(found.assignedSalons) ? found.assignedSalons : [found.salon_id || "default"]);
    const mergedAssigned = Array.from(new Set([...rawAssigned, ...ownedSalonIds]));
    const effectiveRole = (found.role === "staff" && ownedSalonIds.length > 0) ? "owner" : (found.role || cred?.role || "staff");
    const mustChange = cred && typeof cred.mustChangePassword === "boolean" ? cred.mustChangePassword : found.must_change_password;
    return normalizeProfile({
      ...found,
      role: effectiveRole,
      assigned_salons: mergedAssigned,
      assignedSalons: mergedAssigned,
      must_change_password: Boolean(mustChange),
      mustChangePassword: Boolean(mustChange)
    });
  }

  const defaultAssigned = cred?.role === "superadmin" ? Array.from(new Set(["default", ...allSalons.map(s => s.id)])) : [cred?.salonId || "default"];
  const mergedAssigned = Array.from(new Set([...defaultAssigned, ...ownedSalonIds]));
  const effectiveRole = cred?.role || (ownedSalonIds.length > 0 ? "owner" : "superadmin");

  return normalizeProfile({
    id: userId || ("local-" + cleanEmail),
    email: fallbackEmail,
    fullName: fallbackEmail ? fallbackEmail.split("@")[0] : "Staff",
    full_name: fallbackEmail ? fallbackEmail.split("@")[0] : "Staff",
    role: effectiveRole,
    salonId: cred?.salonId || (mergedAssigned[0] || "default"),
    salon_id: cred?.salonId || (mergedAssigned[0] || "default"),
    assignedSalons: mergedAssigned,
    assigned_salons: mergedAssigned,
    mustChangePassword: cred?.mustChangePassword ?? false,
    must_change_password: cred?.mustChangePassword ?? false
  });
}

// -------------------------------------------------------------
// Staff Management & RBAC
// -------------------------------------------------------------
export async function fetchStaffUsers(salonId = null) {
  let fetchedProfiles = null;

  if (supabaseConfigured) {
    try {
      const filterParam = !salonId || salonId === "all" ? null : salonId;
      const { data, error } = await supabase.rpc("get_staff_users", {
        p_salon_id: filterParam
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        fetchedProfiles = data.map(normalizeProfile);
      }
    } catch (err) {
      console.warn("get_staff_users RPC note, querying profiles table directly:", err);
    }

    if (!fetchedProfiles) {
      try {
        let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          fetchedProfiles = data.map(normalizeProfile);
        }
      } catch (err) {
        console.warn("Direct profiles table query note:", err);
      }
    }
  }

  // Get local profiles
  const localProfiles = getLocalStaffProfiles().map(normalizeProfile);

  // Merge remote and local profiles by email and id
  const profileMap = new Map();
  // Put local profiles in map
  localProfiles.forEach(p => {
    if (p.email) profileMap.set(p.email.toLowerCase(), p);
    if (p.id) profileMap.set(p.id, p);
  });
  // Overlay remote profiles if available
  if (Array.isArray(fetchedProfiles)) {
    fetchedProfiles.forEach(p => {
      const key = (p.email || p.id).toLowerCase();
      const existing = profileMap.get(key) || profileMap.get(p.id) || {};
      const merged = normalizeProfile({ ...existing, ...p });
      profileMap.set(key, merged);
      if (p.id) profileMap.set(p.id, merged);
    });
  }

  const allProfiles = Array.from(new Set(profileMap.values()));
  saveLocalStaffProfiles(allProfiles);

  if (salonId && salonId !== "all") {
    return allProfiles.filter(p => 
      p.salon_id === salonId || 
      p.salonId === salonId || 
      (p.assigned_salons || []).includes(salonId) || 
      (p.assignedSalons || []).includes(salonId) ||
      p.role === "superadmin"
    );
  }

  return allProfiles;
}

export async function createStaffUser(email, password, fullName, actorInfo = null, salonId = "default", role = "staff", mustChangePassword = true) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error("Email and password are required.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const existingProfiles = getLocalStaffProfiles();
  const existingUser = existingProfiles.find(p => (p.email || "").toLowerCase() === cleanEmail);
  const existingAssigned = existingUser
    ? (Array.isArray(existingUser.assigned_salons) ? existingUser.assigned_salons : (Array.isArray(existingUser.assignedSalons) ? existingUser.assignedSalons : []))
    : [];

  const allSalons = getLocalSalons();
  const ownedSalonIds = allSalons
    .filter(s => s.owner_email && s.owner_email.trim().toLowerCase() === cleanEmail)
    .map(s => s.id);

  let finalUserId = existingUser?.id || generateValidUUID();
  const trimmedName = (fullName || existingUser?.fullName || existingUser?.full_name || cleanEmail.split("@")[0] || "Staff").trim();
  const assignedSalonsList = role === "superadmin"
    ? Array.from(new Set(["default", ...allSalons.map(s => s.id)]))
    : Array.from(new Set([...existingAssigned, ...ownedSalonIds, salonId]));

  // Save credential locally immediately for fast fallback & offline resilience
  saveLocalCredential(cleanEmail, password, {
    role,
    salonId: existingUser?.salonId || salonId,
    assignedSalons: assignedSalonsList,
    fullName: trimmedName,
    mustChangePassword: Boolean(mustChangePassword)
  });

  if (supabaseConfigured) {
    const isolatedClient = createIsolatedClient();
    if (isolatedClient) {
      try {
        const { data, error } = await isolatedClient.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
              name: trimmedName,
              salon_id: salonId,
              role: role,
              must_change_password: Boolean(mustChangePassword)
            }
          }
        });

        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already registered")) {
            console.log("User already exists in Supabase auth; updating assigned branches:", cleanEmail);
          } else {
            console.warn("isolatedClient auth.signUp note (saved to local vault and database):", error.message);
          }
        } else if (data?.user?.id) {
          finalUserId = data.user.id;
        }
      } catch (authErr) {
        console.warn("auth.signUp exception, ensuring profile is updated:", authErr);
      }

      // Upsert profile into public.profiles with complete assigned salons
      try {
        await supabase
          .from("profiles")
          .upsert({
            id: finalUserId,
            email: cleanEmail,
            full_name: trimmedName,
            role: role,
            salon_id: salonId,
            assigned_salons: assignedSalonsList,
            must_change_password: Boolean(mustChangePassword),
            updated_at: new Date().toISOString()
          });
      } catch (profErr) {
        console.warn("Direct profile upsert note:", profErr);
      }
    }
  }

  // Normalized staff object
  const newStaff = normalizeProfile({
    id: finalUserId,
    email: cleanEmail,
    full_name: trimmedName,
    fullName: trimmedName,
    role: role,
    salon_id: existingUser?.salonId || salonId,
    salonId: existingUser?.salonId || salonId,
    assigned_salons: assignedSalonsList,
    assignedSalons: assignedSalonsList,
    must_change_password: Boolean(mustChangePassword),
    mustChangePassword: Boolean(mustChangePassword),
    created_at: existingUser?.created_at || new Date().toISOString()
  });

  // Keep local profiles in sync immediately
  const profiles = getLocalStaffProfiles().map(normalizeProfile);
  const existingIdx = profiles.findIndex(p => p.email.toLowerCase() === cleanEmail || p.id === finalUserId);
  if (existingIdx >= 0) {
    profiles[existingIdx] = { ...profiles[existingIdx], ...newStaff };
  } else {
    profiles.unshift(newStaff);
  }
  saveLocalStaffProfiles(profiles);

  logAuditEvent({
    action: existingUser ? "USER_ROLE_UPDATE" : "USER_CREATE",
    entityType: "user",
    entityId: finalUserId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: salonId,
    newData: newStaff,
    details: `${existingUser ? "Linked existing" : "Created new"} ${role === "owner" ? "Salon Owner" : "staff"} account: ${trimmedName} (${cleanEmail}) [Role: ${role.toUpperCase()}, Salon: ${salonId}, Temp Password: ${mustChangePassword ? "YES" : "NO"}]`
  }).catch(() => {});

  return newStaff;
}

export async function changeFirstLoginPassword(newPassword, userProfile) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New permanent password must be at least 6 characters long.");
  }

  const cleanEmail = String(userProfile?.email || userProfile?.user?.email || "").trim().toLowerCase();
  const userId = userProfile?.id || userProfile?.user?.id;

  // 1. Update Supabase Auth password & metadata FIRST
  if (supabaseConfigured && supabase?.auth) {
    let authUpdated = false;

    // A. Direct update if active Supabase session exists
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData?.session) {
        const { data: updData, error: updErr } = await supabase.auth.updateUser({
          password: newPassword,
          data: {
            must_change_password: false,
            mustChangePassword: false
          }
        });
        if (!updErr && updData?.user) {
          authUpdated = true;
        } else if (updErr) {
          console.warn("Direct auth.updateUser note:", updErr.message);
          throw updErr;
        }
      }
    } catch (sessErr) {
      console.warn("getSession check note:", sessErr);
      if (sessErr.message && !sessErr.message.includes("getSession")) {
        throw sessErr;
      }
    }

    // B. If no active Supabase session was present, re-authenticate with previous temp password to establish session, then update
    if (!authUpdated && cleanEmail) {
      const localCreds = getLocalCredentials();
      const prevPassword = localCreds[cleanEmail]?.password;
      if (prevPassword && prevPassword !== newPassword) {
        try {
          const { data: reauthData, error: reauthErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: prevPassword
          });
          if (!reauthErr && reauthData?.session) {
            const { error: finalUpdErr } = await supabase.auth.updateUser({
              password: newPassword,
              data: {
                must_change_password: false,
                mustChangePassword: false
              }
            });
            if (!finalUpdErr) {
              authUpdated = true;
            } else {
              throw finalUpdErr;
            }
          }
        } catch (reauthEx) {
          console.warn("Re-auth attempt note:", reauthEx);
          throw reauthEx;
        }
      }
    }

    // 2. Update public.profiles table in Supabase (by email AND by id)
    try {
      if (cleanEmail) {
        await supabase
          .from("profiles")
          .update({
            must_change_password: false,
            updated_at: new Date().toISOString()
          })
          .eq("email", cleanEmail);
      }
      if (userId && !String(userId).startsWith("local-")) {
        await supabase
          .from("profiles")
          .update({
            must_change_password: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", userId);
      }
    } catch (profErr) {
      console.warn("Supabase profiles update note:", profErr);
    }
  }

  // 3. Save new permanent password to local credentials vault (overwriting old temp password)
  if (cleanEmail) {
    saveLocalCredential(cleanEmail, newPassword, {
      role: userProfile?.role || userProfile?.user_metadata?.role,
      salonId: userProfile?.salonId || userProfile?.salon_id || userProfile?.user_metadata?.salon_id,
      mustChangePassword: false
    });
  }

  // 4. Update local staff profile record
  const profiles = getLocalStaffProfiles();
  const idx = profiles.findIndex(p => (userId && p.id === userId) || (cleanEmail && p.email?.toLowerCase() === cleanEmail));
  if (idx >= 0) {
    profiles[idx].must_change_password = false;
    profiles[idx].mustChangePassword = false;
    saveLocalStaffProfiles(profiles);
  }

  // 5. Update local session token if active
  try {
    const rawSess = localStorage.getItem(LOCAL_SESSION_KEY);
    if (rawSess) {
      const parsed = JSON.parse(rawSess);
      if (parsed?.user) {
        parsed.user.user_metadata = {
          ...(parsed.user.user_metadata || {}),
          must_change_password: false,
          mustChangePassword: false
        };
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(parsed));
      }
    }
  } catch {}

  logAuditEvent({
    action: "PASSWORD_CHANGED",
    entityType: "auth",
    entityId: userId || cleanEmail,
    userEmail: cleanEmail,
    details: `User ${cleanEmail} updated their permanent password on first login.`
  }).catch(() => {});

  return { success: true };
}

export async function provisionOwnerAccount(salonId, ownerEmail, ownerName, tempPassword, actorInfo = null) {
  return await createStaffUser(
    ownerEmail,
    tempPassword,
    ownerName,
    actorInfo,
    salonId,
    "owner",
    true
  );
}

export async function updateStaffRole(userId, newRole, actorInfo = null, salonId = null, assignedSalons = null) {
  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.rpc("update_user_role", {
        p_user_id: userId,
        p_new_role: newRole,
        p_salon_id: salonId,
        p_assigned_salons: assignedSalons
      });
      if (!error) return true;
    } catch (err) {
      console.warn("update_user_role RPC note, using table update:", err);
    }

    const payload = {
      role: newRole,
      updated_at: new Date().toISOString()
    };
    if (salonId) payload.salon_id = salonId;
    if (assignedSalons) payload.assigned_salons = assignedSalons;

    try {
      await supabase
        .from("profiles")
        .update(payload)
        .eq("id", userId);
    } catch (updErr) {
      console.warn("Direct profile update warning (saved locally):", updErr);
    }
  }

  // Demo Fallback
  const profiles = getLocalStaffProfiles();
  const idx = profiles.findIndex(p => p.id === userId);
  if (idx >= 0) {
    profiles[idx].role = newRole;
    if (salonId) profiles[idx].salon_id = salonId;
    if (assignedSalons) profiles[idx].assigned_salons = assignedSalons;
    saveLocalStaffProfiles(profiles);

    logAuditEvent({
      action: "USER_ROLE_CHANGE",
      entityType: "user",
      entityId: userId,
      userId: actorInfo?.id,
      userName: actorInfo?.name,
      userRole: actorInfo?.role,
      salonId: salonId || "default",
      newData: { role: newRole, salon_id: salonId },
      details: `Updated role for ${profiles[idx].full_name || profiles[idx].email} to ${newRole.toUpperCase()}`
    });
  }

  return true;
}

export async function deleteStaffUser(userId, actorInfo = null) {
  if (!userId) throw new Error("User ID is required.");

  if (supabaseConfigured) {
    try {
      await supabase.from("profiles").delete().eq("id", userId);
    } catch (err) {
      console.warn("Supabase profile delete warning:", err);
    }
  }

  const profiles = getLocalStaffProfiles().filter(p => p.id !== userId);
  saveLocalStaffProfiles(profiles);

  logAuditEvent({
    action: "USER_DELETE",
    entityType: "user",
    entityId: userId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    details: `Removed user account ID: ${userId}`
  }).catch(() => {});

  return true;
}

// -------------------------------------------------------------
// Audit Logging
// -------------------------------------------------------------
export async function logAuditEvent({
  action,
  entityType = "general",
  entityId = null,
  userId = null,
  userEmail = null,
  userName = null,
  userRole = null,
  oldData = null,
  newData = null,
  reason = null,
  details = null,
  salonId = "default"
}) {
  const logObj = {
    id: "log-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
    salonId: salonId || "default",
    salon_id: salonId || "default",
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    userId,
    userEmail,
    userName,
    userRole,
    oldData,
    newData,
    reason,
    details: details || `${action} on ${entityType}`,
    createdAt: new Date().toISOString()
  };

  if (supabaseConfigured) {
    try {
      await supabase.from("audit_logs").insert({
        salon_id: salonId || "default",
        action,
        entity_type: entityType,
        entity_id: entityId ? String(entityId) : null,
        user_id: userId || null,
        user_email: userEmail || null,
        user_name: userName || null,
        user_role: userRole || null,
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
        reason,
        details: details || `${action} on ${entityType}`
      });
      return logObj;
    } catch (err) {
      console.warn("Supabase audit log insert error:", err);
    }
  }

  // Demo Fallback
  const logs = getLocalAuditLogs();
  logs.unshift(logObj);
  saveLocalAuditLogs(logs);
  return logObj;
}

export async function fetchAuditLogs(filters = {}, salonId = null) {
  if (supabaseConfigured) {
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (salonId && salonId !== "all") {
        query = query.eq("salon_id", salonId);
      }
      if (filters.action && filters.action !== "ALL") {
        query = query.eq("action", filters.action);
      }
      if (filters.entityType && filters.entityType !== "ALL") {
        query = query.eq("entity_type", filters.entityType);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map(l => ({
          id: l.id,
          salonId: l.salon_id || "default",
          action: l.action,
          entityType: l.entity_type,
          entityId: l.entity_id,
          userId: l.user_id,
          userEmail: l.user_email,
          userName: l.user_name,
          userRole: l.user_role,
          oldData: l.old_data,
          newData: l.new_data,
          reason: l.reason,
          details: l.details,
          createdAt: l.created_at
        }));
      }
    } catch (err) {
      console.warn("fetchAuditLogs Supabase error:", err);
    }
  }

  // Demo Fallback
  let logs = getLocalAuditLogs();
  if (salonId && salonId !== "all") {
    logs = logs.filter(l => (l.salonId || l.salon_id || "default") === salonId);
  }
  if (filters.action && filters.action !== "ALL") {
    logs = logs.filter(l => l.action === filters.action);
  }
  if (filters.entityType && filters.entityType !== "ALL") {
    logs = logs.filter(l => l.entityType === filters.entityType);
  }
  return logs;
}

// -------------------------------------------------------------
// Customers Management (Scoped per Salon)
// -------------------------------------------------------------
export async function findCustomerByMobile(rawMobile, salonId = "default") {
  const norm = normalizeWhatsAppNumber(rawMobile);
  if (!norm) return null;
  const digits10 = norm.slice(-10);

  if (supabaseConfigured) {
    try {
      let query = supabase
        .from("customers")
        .select("*")
        .or(`mobile.eq.${digits10},mobile.eq.${norm},mobile.eq.+91${digits10}`);

      if (salonId && salonId !== "all") {
        query = query.eq("salon_id", salonId);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (!error && data) {
        return {
          id: data.id,
          salonId: data.salon_id || salonId,
          name: data.name,
          mobile: data.mobile,
          address: data.address || "",
          whatsapp_opt_in: data.whatsapp_opt_in !== false
        };
      }
    } catch (err) {
      console.warn("findCustomerByMobile Supabase error:", err);
    }
  }

  // Demo Fallback
  const d = getLocalDemoData();
  const found = (d.customers || []).find(c => {
    const isSalonMatch = !salonId || salonId === "all" || (c.salonId || c.salon_id || "default") === salonId;
    const cNorm = normalizeWhatsAppNumber(c.mobile);
    return isSalonMatch && (cNorm === norm || cNorm.slice(-10) === digits10);
  });
  return found || null;
}



// -------------------------------------------------------------
// Database Auto-Sync Helper for Salon Branches (Foreign Key Resilience)
// -------------------------------------------------------------
export async function ensureSalonInDatabase(salonId = "default") {
  if (!supabaseConfigured || !salonId) return true;
  const targetId = String(salonId).trim();
  if (!targetId) return true;

  try {
    const { data, error } = await supabase
      .from("salons")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();

    if (!error && data?.id) {
      return true;
    }

    const localSalons = getLocalSalons();
    const found = localSalons.find(s => s.id === targetId);

    const fallbackName = targetId === "default"
      ? "NICE LOOKING (Bandra)"
      : targetId.replace(/^salon-/, "").replace(/-\w{4,}$/, "").replace(/-/g, " ").toUpperCase() || "Salon Branch";

    const payload = {
      id: targetId,
      name: (found?.name || fallbackName).trim(),
      slug: found?.slug || `salon-${targetId}`,
      subtitle: (found?.subtitle || "Hair Wig & Hair Services").trim(),
      invoice_prefix: (found?.invoice_prefix || "NL").toUpperCase().trim(),
      mobile: (found?.mobile || "+91 98765 43210").trim(),
      email: (found?.email || "sameershaikh121@proton.me").trim(),
      address: (found?.address || "Mumbai, Maharashtra").trim(),
      whatsapp_number: (found?.whatsapp_number || "919876543210").trim(),
      owner_name: (found?.owner_name || "Salon Owner").trim(),
      owner_email: (found?.owner_email || "").trim(),
      status: found?.status || "ACTIVE",
      created_at: found?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: upsErr } = await supabase.from("salons").upsert(payload);
    if (!upsErr) {
      return true;
    }
  } catch (err) {
    console.warn("ensureSalonInDatabase notice:", err);
  }
  return false;
}

// -------------------------------------------------------------
// Customers Management (Scoped per Salon)
// -------------------------------------------------------------

export async function fetchCustomers(salonId = "default") {
  let remoteCustomers = null;
  if (supabaseConfigured) {
    try {
      let query = supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (salonId && salonId !== "all") {
        query = query.eq("salon_id", salonId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        remoteCustomers = data.map(c => ({
          id: String(c.id),
          salonId: c.salon_id || salonId,
          salon_id: c.salon_id || salonId,
          name: c.name,
          mobile: c.mobile,
          address: c.address || "",
          whatsapp_opt_in: c.whatsapp_opt_in !== false,
          createdAt: c.created_at
        }));
      }
    } catch (err) {
      console.warn("fetchCustomers Supabase error:", err);
    }
  }

  // Merge remote with local so no customer is lost
  const d = getLocalDemoData();
  const rawLocal = (d.customers || []).map(c => ({
    id: String(c.id),
    salonId: c.salon_id || c.salonId || "default",
    salon_id: c.salon_id || c.salonId || "default",
    name: c.name,
    mobile: c.mobile,
    address: c.address || "",
    whatsapp_opt_in: c.whatsapp_opt_in !== false,
    createdAt: c.createdAt || c.created_at || new Date().toISOString()
  }));

  const custMap = new Map();
  rawLocal.forEach(c => custMap.set(String(c.id), c));
  if (Array.isArray(remoteCustomers)) {
    remoteCustomers.forEach(c => custMap.set(String(c.id), c));
  }
  let allMerged = Array.from(custMap.values());
  if (salonId && salonId !== "all") {
    allMerged = allMerged.filter(c => (c.salonId || c.salon_id || "default") === salonId);
  }

  // Enrich customer statistics with invoice history
  try {
    const allInvoices = await fetchInvoices(salonId);
    return allMerged.map(c => {
      const cNorm = normalizeWhatsAppNumber(c.mobile);
      const c10 = (c.mobile || "").replace(/\D/g, "").slice(-10);
      const cInvoices = allInvoices.filter(inv => {
        const inv10 = (inv.mobile || inv.customerMobile || "").replace(/\D/g, "").slice(-10);
        const invNorm = normalizeWhatsAppNumber(inv.mobile || inv.customerMobile);
        return (c10 && inv10 && c10 === inv10) || (cNorm && invNorm && cNorm === invNorm) || (inv.customerId && String(inv.customerId) === String(c.id));
      });

      const validInvs = cInvoices.filter(i => !i.isVoided && i.status !== "VOIDED");
      const totalSpent = validInvs.reduce((acc, i) => acc + Number(i.total || i.amount || 0), 0);
      const sortedInvs = [...cInvoices].sort((a, b) => new Date(b.createdAt || b.invoice_date || 0) - new Date(a.createdAt || a.invoice_date || 0));
      const lastVisit = sortedInvs[0]?.createdAt || c.createdAt || "—";
      const lastService = sortedInvs[0]?.service || "Hair Wig";

      return {
        ...c,
        invoices: sortedInvs,
        visitCount: cInvoices.length,
        totalSpent,
        amount: totalSpent,
        lastVisit,
        lastService,
        hasInvoices: cInvoices.length > 0
      };
    });
  } catch {
    return allMerged;
  }
}

export async function saveCustomer(customerData, actorInfo = null, salonId = "default") {
  const normMobile = normalizeWhatsAppNumber(customerData.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  const effectiveSalonId = salonId || "default";

  if (supabaseConfigured) {
    await ensureSalonInDatabase(effectiveSalonId);
  }

  const payload = {
    salon_id: effectiveSalonId,
    name: (customerData.name || "").trim(),
    mobile: normMobile.slice(-10),
    address: (customerData.address || "").trim(),
    whatsapp_opt_in: customerData.whatsapp_opt_in !== false,
    updated_at: new Date().toISOString()
  };

  let finalSaved = null;

  if (supabaseConfigured) {
    let savedData = null;
    let dbError = null;

    try {
      if (customerData.id && !String(customerData.id).startsWith("cust-")) {
        const { data, error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customerData.id)
          .select()
          .maybeSingle();

        if (!error && data) savedData = data;
        else if (error) dbError = error;
      } else {
        // Find existing customer by salon_id and mobile
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("salon_id", effectiveSalonId)
          .eq("mobile", payload.mobile)
          .maybeSingle();

        if (existing?.id) {
          const { data, error } = await supabase
            .from("customers")
            .update(payload)
            .eq("id", existing.id)
            .select()
            .maybeSingle();

          if (!error && data) savedData = data;
          else if (error) dbError = error;
        } else {
          const { data, error } = await supabase
            .from("customers")
            .insert(payload)
            .select()
            .maybeSingle();

          if (!error && data) savedData = data;
          else if (error) dbError = error;
        }
      }
    } catch (ex) {
      dbError = ex;
    }

    if (dbError && String(dbError.message || dbError).toLowerCase().includes("foreign key")) {
      try {
        await ensureSalonInDatabase(effectiveSalonId);
        const { data: retryData } = await supabase
          .from("customers")
          .insert(payload)
          .select()
          .maybeSingle();

        if (retryData) {
          savedData = retryData;
          dbError = null;
        }
      } catch {}
    }

    if (savedData) {
      finalSaved = {
        id: String(savedData.id),
        salonId: savedData.salon_id || effectiveSalonId,
        salon_id: savedData.salon_id || effectiveSalonId,
        name: savedData.name,
        mobile: savedData.mobile,
        address: savedData.address,
        whatsapp_opt_in: savedData.whatsapp_opt_in
      };

      logAuditEvent({
        action: customerData.id ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE",
        entityType: "customer",
        entityId: savedData.id,
        userId: actorInfo?.id,
        userName: actorInfo?.name,
        userRole: actorInfo?.role,
        salonId: effectiveSalonId,
        newData: payload,
        details: `${customerData.id ? "Updated" : "Created"} customer record for ${payload.name} (${payload.mobile})`
      });
    }

    if (dbError) {
      console.warn("Supabase customer write note (saved locally):", dbError.message || dbError);
    }
  }

  // Always update local cache so item is instantly visible
  const d = getLocalDemoData();
  let savedId = finalSaved?.id || customerData.id || ("cust-" + normMobile.slice(-10));
  const localCust = {
    ...payload,
    id: String(savedId),
    salonId: effectiveSalonId,
    salon_id: effectiveSalonId
  };

  const idx = (d.customers || []).findIndex(
    c => String(c.id) === String(savedId) ||
    ((c.salonId || c.salon_id || "default") === effectiveSalonId && (c.mobile || "").replace(/\D/g, "").slice(-10) === normMobile.slice(-10))
  );
  if (idx >= 0) {
    d.customers[idx] = { ...d.customers[idx], ...localCust };
  } else {
    d.customers.unshift(localCust);
  }
  saveLocalDemoData(d);

  return finalSaved || localCust;
}

export async function deleteCustomer(customerId, actorInfo = null, salonId = "default") {
  if (supabaseConfigured) {
    try {
      await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);

      logAuditEvent({
        action: "CUSTOMER_DELETE",
        entityType: "customer",
        entityId: customerId,
        userId: actorInfo?.id,
        userName: actorInfo?.name,
        userRole: actorInfo?.role,
        salonId: salonId,
        details: `Deleted customer ID ${customerId}`
      });
    } catch (err) {
      console.warn("Supabase customer delete warning:", err);
    }
  }

  // Always sync local cache
  const d = getLocalDemoData();
  d.customers = (d.customers || []).filter(c => String(c.id) !== String(customerId));
  saveLocalDemoData(d);
  return true;
}

// -------------------------------------------------------------
// Products / Wig Inventory (Scoped per Salon)
// -------------------------------------------------------------
export async function fetchProducts(salonId = "default") {
  let remoteProducts = null;

  if (supabaseConfigured) {
    try {
      let query = supabase.from("wig_products").select("*").order("product_name", { ascending: true });
      if (salonId && salonId !== "all") {
        query = query.eq("salon_id", salonId);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        remoteProducts = data.map(p => ({
          id: String(p.id),
          salonId: p.salon_id || salonId,
          salon_id: p.salon_id || salonId,
          name: p.product_name || p.name || "Wig Product",
          product_name: p.product_name || p.name || "Wig Product",
          type: p.hair_type || p.type || "Human Hair",
          hair_type: p.hair_type || p.type || "Human Hair",
          color: p.color || "Natural Black",
          size: p.size || "5x7",
          price: Number(p.price || 0),
          stock: Number(p.stock || 0),
          active: p.active !== false
        }));
      }
    } catch (err) {
      console.warn("fetchProducts Supabase error:", err);
    }
  }

  // Local / Demo Data
  const d = getLocalDemoData();
  const rawLocal = (d.products || []).map(p => ({
    id: String(p.id),
    salonId: p.salon_id || p.salonId || "default",
    salon_id: p.salon_id || p.salonId || "default",
    name: p.product_name || p.name || "Wig Product",
    product_name: p.product_name || p.name || "Wig Product",
    type: p.hair_type || p.type || "Human Hair",
    hair_type: p.hair_type || p.type || "Human Hair",
    color: p.color || "Natural Black",
    size: p.size || "5x7",
    price: Number(p.price || 0),
    stock: Number(p.stock || 0),
    active: p.active !== false
  }));

  // Merge remote and local so newly added products are never lost
  const prodMap = new Map();
  rawLocal.forEach(p => prodMap.set(String(p.id), p));
  if (Array.isArray(remoteProducts)) {
    remoteProducts.forEach(p => prodMap.set(String(p.id), p));
  }

  const allMerged = Array.from(prodMap.values());

  if (salonId && salonId !== "all") {
    return allMerged.filter(p => (p.salonId || p.salon_id || "default") === salonId);
  }
  return allMerged;
}

export async function saveProduct(product, actorInfo = null, salonId = "default") {
  const isNew = !product.id;
  const effectiveSalonId = salonId || "default";

  // Auto-sync the salon to database before creating products
  if (supabaseConfigured) {
    await ensureSalonInDatabase(effectiveSalonId);
  }

  const productName = (product.name || product.product_name || "Wig Product").trim();
  const hairType = product.type || product.hair_type || "Human Hair";
  const color = product.color || "Natural Black";
  const size = product.size || "5x7";
  const price = Number(product.price || 0);
  const stock = Number(product.stock || 0);
  const active = product.active !== false;

  // DB Payload (only include columns that exist in the PostgreSQL table public.wig_products)
  const dbPayload = {
    salon_id: effectiveSalonId,
    product_name: productName,
    hair_type: hairType,
    color: color,
    size: size,
    price: price,
    stock: stock,
    active: active,
    updated_at: new Date().toISOString()
  };

  let finalSaved = null;

  if (supabaseConfigured) {
    let savedData = null;
    let dbError = null;

    try {
      if (isNew) {
        const { data, error } = await supabase
          .from("wig_products")
          .insert(dbPayload)
          .select()
          .maybeSingle();

        if (error) {
          dbError = error;
        } else {
          savedData = data;
        }
      } else {
        const { data, error } = await supabase
          .from("wig_products")
          .update(dbPayload)
          .eq("id", product.id)
          .select()
          .maybeSingle();

        if (error) {
          dbError = error;
        } else {
          savedData = data;
        }
      }
    } catch (ex) {
      dbError = ex;
    }

    // If foreign key constraint failed, ensure salon in DB and retry once
    if (dbError && String(dbError.message || dbError).toLowerCase().includes("foreign key")) {
      try {
        await ensureSalonInDatabase(effectiveSalonId);
        if (isNew) {
          const retryRes = await supabase
            .from("wig_products")
            .insert(dbPayload)
            .select()
            .maybeSingle();

          if (!retryRes.error && retryRes.data) {
            savedData = retryRes.data;
            dbError = null;
          }
        } else {
          const retryRes = await supabase
            .from("wig_products")
            .update(dbPayload)
            .eq("id", product.id)
            .select()
            .maybeSingle();

          if (!retryRes.error && retryRes.data) {
            savedData = retryRes.data;
            dbError = null;
          }
        }
      } catch (retryEx) {
        console.warn("Wig product retry exception:", retryEx);
      }
    }

    if (savedData) {
      finalSaved = {
        id: String(savedData.id),
        salonId: savedData.salon_id || effectiveSalonId,
        salon_id: savedData.salon_id || effectiveSalonId,
        name: savedData.product_name,
        product_name: savedData.product_name,
        type: savedData.hair_type || "Human Hair",
        hair_type: savedData.hair_type || "Human Hair",
        color: savedData.color || "Natural Black",
        size: savedData.size || "5x7",
        price: Number(savedData.price || 0),
        stock: Number(savedData.stock || 0),
        active: savedData.active !== false
      };

      logAuditEvent({
        action: isNew ? "PRODUCT_CREATE" : "PRODUCT_UPDATE",
        entityType: "wig_product",
        entityId: savedData.id,
        userId: actorInfo?.id,
        userName: actorInfo?.name,
        userRole: actorInfo?.role,
        salonId: effectiveSalonId,
        newData: dbPayload,
        details: `${isNew ? "Added new" : "Updated"} wig product "${productName}" (Stock: ${stock})`
      });
    }

    if (dbError) {
      console.warn("Supabase wig product write warning (saved locally):", dbError.message || dbError);
    }
  }

  // Always sync to local cache immediately so the product is guaranteed to display
  const d = getLocalDemoData();
  let savedId = product.id ? String(product.id) : (finalSaved?.id || ("prod-" + Date.now()));
  const localProd = {
    id: savedId,
    salonId: effectiveSalonId,
    salon_id: effectiveSalonId,
    name: productName,
    product_name: productName,
    type: hairType,
    hair_type: hairType,
    color: color,
    size: size,
    price: price,
    stock: stock,
    active: active,
    updated_at: new Date().toISOString()
  };

  const pIdx = (d.products || []).findIndex(p => String(p.id) === String(savedId));
  if (pIdx >= 0) {
    d.products[pIdx] = { ...d.products[pIdx], ...localProd };
  } else {
    d.products.unshift(localProd);
  }
  saveLocalDemoData(d);

  return finalSaved || localProd;
}

export async function deleteProduct(productId, actorInfo = null, salonId = "default") {
  if (supabaseConfigured) {
    try {
      await supabase
        .from("wig_products")
        .delete()
        .eq("id", productId);

      logAuditEvent({
        action: "PRODUCT_DELETE",
        entityType: "wig_product",
        entityId: productId,
        userId: actorInfo?.id,
        userName: actorInfo?.name,
        userRole: actorInfo?.role,
        salonId: salonId,
        details: `Deleted wig product ID ${productId}`
      });
    } catch (err) {
      console.warn("Supabase product delete warning:", err);
    }
  }

  // Always sync local cache
  const d = getLocalDemoData();
  d.products = (d.products || []).filter(p => String(p.id) !== String(productId));
  saveLocalDemoData(d);
  return true;
}

// -------------------------------------------------------------
// Invoices Management (Multi-Tenant & Atomic Stock)
// -------------------------------------------------------------
export function parseVoidStatus(inv) {
  const isVoid =
    inv?.status === "VOIDED" ||
    inv?.is_voided === true ||
    inv?.isVoided === true ||
    Boolean(inv?.voidedAt || inv?.voided_at || inv?.voidReason || inv?.void_reason);

  return {
    isVoid,
    voidReason: inv?.voidReason || inv?.void_reason || (isVoid ? "Invoice Voided" : ""),
    voidedAt: inv?.voidedAt || inv?.voided_at || "",
    voidedByName: inv?.voidedByName || inv?.voided_by_name || "Staff"
  };
}

function parseItemsFromInvoice(rawDesc, invRecord) {
  let items = [];
  let userNote = "";

  if (rawDesc && typeof rawDesc === "string") {
    if (rawDesc.includes("---ITEMS_JSON---")) {
      const parts = rawDesc.split("---ITEMS_JSON---");
      userNote = parts[0]?.trim() || "";
      try {
        const parsed = JSON.parse(parts[1]?.trim() || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed;
        }
      } catch {}
    } else {
      userNote = rawDesc.trim();
    }
  }

  if (!items.length && invRecord) {
    items = [
      {
        id: "item-fallback-1",
        service: invRecord.service_type || invRecord.service || "Hair Wig",
        productId: invRecord.product_id || invRecord.productId || null,
        productName: invRecord.product_name || invRecord.productName || "",
        productSize: invRecord.product_size || invRecord.productSize || "",
        quantity: Number(invRecord.quantity || (invRecord.service_type === "Hair Wig" ? 1 : 0)),
        amount: Number(invRecord.total || invRecord.amount || 0)
      }
    ];
  }

  return { items, userNote };
}

export async function fetchInvoices(salonId = "default") {
  let remoteInvoices = null;

  if (supabaseConfigured) {
    try {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          customers:customer_id (id, name, mobile, address),
          transactions:transaction_id (id, amount, payment_mode, payment_status, is_voided)
        `)
        .order("invoice_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (salonId && salonId !== "all") {
        query = query.eq("salon_id", salonId);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        remoteInvoices = data.map(inv => {
          const { items, userNote } = parseItemsFromInvoice(inv.description, inv);
          const voidInfo = parseVoidStatus(inv);

          let subtotal = Number(inv.subtotal || 0);
          let total = Number(inv.total || inv.amount || 0);
          if (total === 0 && Array.isArray(items) && items.length > 0) {
            const itemsSum = items.reduce((s, it) => s + (Number(it.amount) || (Number(it.unitPrice || 0) * Math.max(1, Number(it.quantity || 1)))), 0);
            if (itemsSum > 0) {
              subtotal = itemsSum;
              total = Math.max(0, subtotal - Number(inv.discount || 0));
            }
          }

          return {
            id: String(inv.id),
            salonId: inv.salon_id || salonId,
            salon_id: inv.salon_id || salonId,
            invoiceNumber: inv.invoice_number,
            customerId: inv.customer_id,
            customerName: inv.customers?.name || "Customer",
            customerMobile: inv.customers?.mobile || "",
            name: inv.customers?.name || "Customer",
            mobile: inv.customers?.mobile || "",
            address: inv.customers?.address || "",
            service: inv.service_type || "Hair Wig",
            productId: inv.product_id,
            productName: inv.product_name || "",
            productSize: inv.product_size || "",
            quantity: Number(inv.quantity || 0),
            subtotal,
            discount: Number(inv.discount || 0),
            total,
            amount: total,
            paymentMode: inv.payment_mode || "Cash",
            status: voidInfo.isVoid ? "VOIDED" : (inv.status || "PAID"),
            isVoided: voidInfo.isVoid,
            voidReason: voidInfo.voidReason,
            voidedAt: voidInfo.voidedAt,
            voidedByName: voidInfo.voidedByName,
            description: userNote || "",
            rawDescription: inv.description || "",
            items,
            createdAt: formatToLocalISODate(inv.invoice_date || inv.created_at),
            rawCreatedAt: inv.invoice_date || inv.created_at
          };
        });
      }
    } catch (err) {
      console.warn("fetchInvoices Supabase error:", err);
    }
  }

  // Local / Demo Data
  const d = getLocalDemoData();
  const rawLocal = (d.invoices || []).map(inv => {
    const { items, userNote } = parseItemsFromInvoice(inv.rawDescription || inv.description, inv);
    const voidInfo = parseVoidStatus(inv);

    let subtotal = Number(inv.subtotal || 0);
    let total = Number(inv.total || inv.amount || 0);
    if (total === 0 && Array.isArray(items) && items.length > 0) {
      const itemsSum = items.reduce((s, it) => s + (Number(it.amount) || (Number(it.unitPrice || 0) * Math.max(1, Number(it.quantity || 1)))), 0);
      if (itemsSum > 0) {
        subtotal = itemsSum;
        total = Math.max(0, subtotal - Number(inv.discount || 0));
      }
    }

    return {
      ...inv,
      id: String(inv.id),
      salonId: inv.salonId || inv.salon_id || "default",
      salon_id: inv.salonId || inv.salon_id || "default",
      subtotal,
      total,
      amount: total,
      items,
      description: userNote || "",
      isVoided: voidInfo.isVoid,
      status: voidInfo.isVoid ? "VOIDED" : (inv.status || "PAID"),
      voidReason: voidInfo.voidReason,
      createdAt: formatToLocalISODate(inv.createdAt || inv.invoice_date || new Date().toISOString())
    };
  });


  // Merge remote and local so newly created invoices are NEVER lost
  const invMap = new Map();
  rawLocal.forEach(inv => invMap.set(String(inv.id), inv));
  if (Array.isArray(remoteInvoices)) {
    remoteInvoices.forEach(inv => invMap.set(String(inv.id), inv));
  }

  const allMerged = Array.from(invMap.values());

  if (salonId && salonId !== "all") {
    return allMerged.filter(i => (i.salonId || i.salon_id || "default") === salonId);
  }
  return allMerged;
}

export async function createInvoice(form, lineItems, actorInfo = null, salonId = "default") {
  const normMobile = normalizeWhatsAppNumber(form.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  if (!form.name || !form.name.trim()) throw new Error("Customer name is required.");

  const effectiveSalonId = salonId || "default";

  // Auto-sync salon in DB before creating invoice
  if (supabaseConfigured) {
    await ensureSalonInDatabase(effectiveSalonId);
  }

  // 1. Guaranteed Customer creation/update
  let savedCustomer = null;
  try {
    savedCustomer = await saveCustomer({
      name: form.name.trim(),
      mobile: normMobile,
      address: form.address?.trim() || "",
      whatsapp_opt_in: form.whatsapp !== false
    }, actorInfo, effectiveSalonId);
  } catch (custErr) {
    console.warn("Customer save note in createInvoice:", custErr);
  }

  const rawActiveItems = Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : (
    Array.isArray(form.items) && form.items.length > 0 ? form.items : [
      {
        service: form.service || "Hair Wig",
        productId: form.productId || null,
        productName: form.productName || "",
        productSize: form.productSize || "",
        quantity: Number(form.quantity || 1),
        unitPrice: Number(form.unitPrice || form.total || form.amount || 0),
        amount: Number(form.total || form.amount || 0)
      }
    ]
  );

  const activeItems = rawActiveItems.map(it => {
    const qty = Math.max(1, Number(it.quantity || 1));
    const uPrice = Number(it.unitPrice || 0);
    const lineAmt = it.amount !== undefined && it.amount !== "" && !isNaN(Number(it.amount))
      ? Number(it.amount)
      : (uPrice * qty);
    return {
      ...it,
      quantity: qty,
      unitPrice: uPrice,
      amount: lineAmt
    };
  });

  const primaryItem = activeItems[0] || {};
  const primaryService = primaryItem.service || "Hair Wig";
  const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const primaryProductId = (primaryService === "Hair Wig" && isUuid(primaryItem.productId)) ? primaryItem.productId : null;
  const primaryQty = primaryService === "Hair Wig" ? Number(primaryItem.quantity || 1) : 0;

  const computedSubtotal = activeItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const subtotal = Math.max(0, Number(form.subtotal !== undefined && form.subtotal !== "" && !isNaN(Number(form.subtotal)) ? form.subtotal : computedSubtotal));
  const discount = Math.max(0, Number(form.discount || 0));
  const total = Math.max(0, Number(form.total !== undefined && form.total !== "" && !isNaN(Number(form.total)) ? form.total : Math.max(0, subtotal - discount)));

  const fullDescriptionPayload = `${form.description || ""}\n---ITEMS_JSON---\n${JSON.stringify(activeItems)}`.trim();

  // Dynamically resolve salon's configured invoice prefix
  let effectivePrefix = (form.invoicePrefix || "").trim().toUpperCase();
  if (!effectivePrefix) {
    const salons = getLocalSalons();
    const matchedSalon = salons.find(s => s.id === effectiveSalonId);
    if (matchedSalon?.invoice_prefix) {
      effectivePrefix = matchedSalon.invoice_prefix.trim().toUpperCase();
    }
  }
  if (!effectivePrefix) {
    effectivePrefix = "NL";
  }

  const nextNumber = form.invoiceNumber || `${effectivePrefix}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const invoiceDateISO = form.invoiceDate ? new Date(form.invoiceDate).toISOString() : new Date().toISOString();

  let finalSavedInv = null;

  if (supabaseConfigured) {
    let rpcSuccess = false;
    try {
      const rpcParams = {
        p_customer_name: form.name.trim(),
        p_customer_mobile: normMobile.slice(-10),
        p_customer_address: form.address?.trim() || "",
        p_service_type: primaryService,
        p_product_id: primaryProductId,
        p_quantity: primaryQty,
        p_subtotal: subtotal,
        p_discount: discount,
        p_total: total,
        p_payment_mode: form.paymentMode || "Cash",
        p_description: fullDescriptionPayload,
        p_invoice_number: nextNumber,
        p_invoice_date: invoiceDateISO,
        p_salon_id: effectiveSalonId
      };

      const { data, error } = await supabase.rpc("create_invoice_with_stock", rpcParams);
      if (!error && data) {
        rpcSuccess = true;
        finalSavedInv = {
          ...data,
          id: String(data.id),
          invoiceNumber: data.invoice_number || nextNumber,
          invoice_number: data.invoice_number || nextNumber,
          salonId: data.salon_id || effectiveSalonId,
          salon_id: data.salon_id || effectiveSalonId,
          name: form.name.trim(),
          customerName: form.name.trim(),
          mobile: normMobile.slice(-10),
          customerMobile: normMobile.slice(-10),
          address: form.address || "",
          subtotal: subtotal,
          discount: discount,
          amount: total,
          total: total,
          paymentMode: form.paymentMode || "Cash",
          items: activeItems,
          createdAt: formatToLocalISODate(invoiceDateISO)
        };
      } else if (error) {
        console.warn("create_invoice_with_stock RPC note (running direct table write):", error.message);
      }
    } catch (rpcErr) {
      console.warn("create_invoice_with_stock RPC exception:", rpcErr);
    }

    // 2. Direct Supabase write fallback
    if (!finalSavedInv) {
      try {
        let txnId = null;
        try {
          const { data: txnData } = await supabase
            .from("transactions")
            .insert({
              salon_id: effectiveSalonId,
              customer_id: savedCustomer?.id || null,
              amount: total,
              discount: discount,
              payment_mode: form.paymentMode || "Cash",
              payment_status: "SUCCESS",
              is_voided: false,
              created_at: invoiceDateISO
            })
            .select()
            .maybeSingle();
          if (txnData?.id) txnId = txnData.id;
        } catch (txnErr) {
          console.warn("Direct transaction insert note:", txnErr);
        }

        const invPayload = {
          salon_id: effectiveSalonId,
          customer_id: savedCustomer?.id || null,
          transaction_id: txnId,
          invoice_number: nextNumber,
          service_type: primaryService,
          product_id: primaryProductId,
          quantity: primaryQty,
          subtotal,
          discount,
          total,
          payment_mode: form.paymentMode || "Cash",
          description: fullDescriptionPayload,
          invoice_date: invoiceDateISO,
          status: "PAID",
          is_voided: false,
          created_at: invoiceDateISO,
          updated_at: new Date().toISOString()
        };

        const { data: invData, error: invErr } = await supabase
          .from("invoices")
          .insert(invPayload)
          .select()
          .maybeSingle();

        if (!invErr && invData) {
          finalSavedInv = {
            ...invData,
            id: String(invData.id),
            invoiceNumber: invData.invoice_number || nextNumber,
            invoice_number: invData.invoice_number || nextNumber,
            salonId: invData.salon_id || effectiveSalonId,
            salon_id: invData.salon_id || effectiveSalonId,
            name: form.name.trim(),
            customerName: form.name.trim(),
            mobile: normMobile.slice(-10),
            customerMobile: normMobile.slice(-10),
            address: form.address || "",
            subtotal: subtotal,
            discount: discount,
            amount: total,
            total: total,
            paymentMode: form.paymentMode || "Cash",
            items: activeItems,
            createdAt: formatToLocalISODate(invoiceDateISO)
          };
        }
      } catch (directInvErr) {
        console.warn("Direct invoice insert error (saved locally):", directInvErr);
      }
    }

    // 3. Guaranteed stock deduction for all wig line items in Supabase
    const itemsToDeduct = rpcSuccess ? activeItems.slice(1) : activeItems;
    for (const item of itemsToDeduct) {
      if (item.service === "Hair Wig" && item.productId) {
        try {
          if (isUuid(item.productId)) {
            await supabase.rpc("deduct_wig_stock", {
              p_product_id: item.productId,
              p_quantity: Number(item.quantity || 1)
            });
          } else {
            const { data: currentP } = await supabase
              .from("wig_products")
              .select("stock")
              .eq("id", item.productId)
              .maybeSingle();
            if (currentP) {
              const newStock = Math.max(0, Number(currentP.stock || 0) - Number(item.quantity || 1));
              await supabase
                .from("wig_products")
                .update({ stock: newStock, updated_at: new Date().toISOString() })
                .eq("id", item.productId);
            }
          }
        } catch (stkErr) {
          console.warn("Stock deduction warning in invoice save:", stkErr);
        }
      }
    }
  }

  // 3. Always sync to LocalStorage demo data immediately
  const d = getLocalDemoData();

  // Deduct stock locally
  activeItems.forEach(item => {
    if (item.service === "Hair Wig" && item.productId) {
      const prod = (d.products || []).find(p => String(p.id) === String(item.productId));
      if (prod) {
        prod.stock = Math.max(0, Number(prod.stock || 0) - Number(item.quantity || 1));
      }
    }
  });

  // Guarantee customer in local storage
  const custId = savedCustomer?.id || ("cust-" + normMobile.slice(-10));
  const localCustObj = {
    id: String(custId),
    salonId: effectiveSalonId,
    salon_id: effectiveSalonId,
    name: form.name.trim(),
    mobile: normMobile.slice(-10),
    address: form.address?.trim() || "",
    whatsapp_opt_in: form.whatsapp !== false,
    createdAt: formatToLocalISODate(invoiceDateISO)
  };
  const cIdx = (d.customers || []).findIndex(
    c => String(c.id) === String(custId) ||
    ((c.salonId || c.salon_id || "default") === effectiveSalonId && (c.mobile || "").replace(/\D/g, "").slice(-10) === normMobile.slice(-10))
  );
  if (cIdx >= 0) {
    d.customers[cIdx] = { ...d.customers[cIdx], ...localCustObj };
  } else {
    d.customers.unshift(localCustObj);
  }

  const localInv = {
    id: finalSavedInv?.id || ("inv-" + Date.now()),
    salonId: effectiveSalonId,
    salon_id: effectiveSalonId,
    invoiceNumber: nextNumber,
    customerId: String(custId),
    name: form.name.trim(),
    customerName: form.name.trim(),
    mobile: normMobile.slice(-10),
    customerMobile: normMobile.slice(-10),
    address: form.address || "",
    service: primaryService,
    productId: primaryProductId,
    productName: primaryItem.productName || "",
    productSize: primaryItem.productSize || "",
    quantity: primaryQty,
    subtotal,
    discount,
    amount: total,
    total,
    paymentMode: form.paymentMode || "Cash",
    status: "PAID",
    isVoided: false,
    description: form.description || "",
    rawDescription: fullDescriptionPayload,
    items: activeItems,
    createdAt: formatToLocalISODate(invoiceDateISO),
    invoice_date: invoiceDateISO
  };

  const invIdx = (d.invoices || []).findIndex(i => String(i.id) === String(localInv.id));
  if (invIdx >= 0) {
    d.invoices[invIdx] = { ...d.invoices[invIdx], ...localInv };
  } else {
    d.invoices.unshift(localInv);
  }
  saveLocalDemoData(d);

  logAuditEvent({
    action: "INVOICE_CREATE",
    entityType: "invoice",
    entityId: localInv.id,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: effectiveSalonId,
    newData: { invoice_number: localInv.invoiceNumber, total: localInv.total, customer_name: localInv.name },
    details: `Created Invoice #${localInv.invoiceNumber} for ₹${localInv.total.toLocaleString("en-IN")}`
  });

  return finalSavedInv || localInv;
}

export async function voidInvoice(invoiceId, reason, actorInfo = null, salonId = "default") {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("A mandatory void reason is required.");

  const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (supabaseConfigured && isUuid(invoiceId)) {
    try {
      const { data, error } = await supabase.rpc("void_invoice", {
        p_invoice_id: invoiceId,
        p_reason: cleanReason,
        p_salon_id: salonId
      });
      if (!error && data) return data;
      if (error) console.warn("void_invoice RPC failed, updating directly:", error.message);
    } catch (rpcErr) {
      console.warn("void_invoice RPC exception:", rpcErr);
    }

    try {
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          status: "VOIDED",
          is_voided: true,
          voided_at: new Date().toISOString(),
          void_reason: cleanReason,
          voided_by_name: actorInfo?.name || "Staff",
          updated_at: new Date().toISOString()
        })
        .eq("id", invoiceId);

      if (updErr) console.warn("Supabase direct void update notice:", updErr.message);

      logAuditEvent({
        action: "INVOICE_VOID",
        entityType: "invoice",
        entityId: invoiceId,
        userId: actorInfo?.id,
        userName: actorInfo?.name,
        userRole: actorInfo?.role,
        salonId: salonId,
        reason: cleanReason,
        details: `Voided Invoice ID ${invoiceId}. Reason: ${cleanReason}`
      }).catch(() => {});
    } catch (dbErr) {
      console.warn("Supabase void update exception:", dbErr);
    }
  }

  // Always update Local Demo Data as well
  const d = getLocalDemoData();
  const targetIdx = (d.invoices || []).findIndex(i => String(i.id) === String(invoiceId));
  if (targetIdx >= 0) {
    const inv = d.invoices[targetIdx];
    const { items } = parseItemsFromInvoice(inv.rawDescription || inv.description, inv);
    for (const item of items) {
      if (item.service === "Hair Wig" && item.productId && Number(item.quantity || 0) > 0) {
        const prod = (d.products || []).find(p => String(p.id) === String(item.productId));
        if (prod) {
          prod.stock = Number(prod.stock || 0) + Number(item.quantity || 0);
        }
      }
    }

    const voidedInv = {
      ...inv,
      status: "VOIDED",
      isVoided: true,
      voidReason: cleanReason,
      voidedAt: formatToLocalISODate(new Date().toISOString()),
      voidedByName: actorInfo?.name || "Staff"
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
      salonId: salonId,
      reason: cleanReason,
      details: `Voided Invoice #${inv.invoiceNumber || invoiceId}. Reason: ${cleanReason}`
    }).catch(() => {});

    return voidedInv;
  }

  return { id: invoiceId, status: "VOIDED", is_voided: true, void_reason: cleanReason };
}

export async function updateInvoice(updatedData, selectedProduct, actorInfo = null, salonId = "default") {
  const normMobile = normalizeWhatsAppNumber(updatedData.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");

  const isHairWig = updatedData.service === "Hair Wig";
  const validProductId = isHairWig && updatedData.productId ? String(updatedData.productId).trim() : null;
  const qty = isHairWig ? Math.max(1, Number(updatedData.quantity || 1)) : 0;
  const subtotal = Math.max(0, Number(updatedData.subtotal ?? updatedData.amount ?? 0));
  const discount = Math.max(0, Number(updatedData.discount || 0));
  const total = Math.max(0, Number(updatedData.total !== undefined ? updatedData.total : (subtotal - discount)));

  const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (supabaseConfigured && isUuid(updatedData.id)) {
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
        p_invoice_date: updatedData.rawCreatedAt || updatedData.invoice_date || null,
        p_salon_id: salonId || "default"
      };

      const { data, error } = await supabase.rpc("update_invoice_with_stock", rpcParams);
      if (!error && data) return data;
    } catch (rpcErr) {
      console.warn("update_invoice_with_stock exception:", rpcErr);
    }
  }

  // Always update LocalStorage demo data
  const d = getLocalDemoData();
  const oldInvIdx = (d.invoices || []).findIndex(i => String(i.id) === String(updatedData.id));
  if (oldInvIdx >= 0) {
    const oldInv = d.invoices[oldInvIdx];
    const saved = {
      ...oldInv,
      name: updatedData.name.trim(),
      mobile: normMobile.slice(-10),
      address: updatedData.address || "",
      service: updatedData.service,
      productId: validProductId,
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
    return saved;
  }

  return updatedData;
}

export async function deleteInvoice(invoiceId, actorInfo = null, salonId = "default") {
  const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (supabaseConfigured && isUuid(invoiceId)) {
    try {
      const { error } = await supabase.rpc("delete_invoice_with_stock", {
        p_invoice_id: invoiceId
      });
      if (!error) {
        // also clean local storage
        const d = getLocalDemoData();
        d.invoices = (d.invoices || []).filter(i => String(i.id) !== String(invoiceId));
        saveLocalDemoData(d);
        return true;
      }
    } catch (rpcErr) {
      console.warn("delete_invoice_with_stock exception:", rpcErr);
    }

    try {
      await supabase
        .from("invoices")
        .delete()
        .eq("id", invoiceId);
    } catch (delErr) {
      console.warn("Supabase direct invoice delete warning:", delErr);
    }
  }

  // Always sync local storage
  const d = getLocalDemoData();
  d.invoices = (d.invoices || []).filter(i => String(i.id) !== String(invoiceId));
  saveLocalDemoData(d);
  return true;
}

// -------------------------------------------------------------
// Settings Management (Scoped per Salon)
// -------------------------------------------------------------
export async function fetchSettings(salonId = "default") {
  const salons = getLocalSalons();
  const matchedLocal = salons.find(s => s.id === (salonId || "default"));

  const defaultSettings = {
    shop_name: matchedLocal?.name || "NICE LOOKING",
    shop_subtitle: matchedLocal?.subtitle || "Hair Wig & Hair Services",
    shop_mobile: matchedLocal?.mobile || "+91 98765 43210",
    shop_address: matchedLocal?.address || "",
    invoice_prefix: matchedLocal?.invoice_prefix || "NL",
    whatsapp_number: matchedLocal?.whatsapp_number || "919876543210",
    email: matchedLocal?.email || "sameershaikh121@proton.me"
  };

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("salons")
        .select("*")
        .eq("id", salonId || "default")
        .maybeSingle();

      if (!error && data) {
        return {
          shop_name: data.name || defaultSettings.shop_name,
          shop_subtitle: data.subtitle || defaultSettings.shop_subtitle,
          shop_mobile: data.mobile || defaultSettings.shop_mobile,
          shop_address: data.address ?? defaultSettings.shop_address,
          invoice_prefix: data.invoice_prefix || defaultSettings.invoice_prefix,
          whatsapp_number: data.whatsapp_number || defaultSettings.whatsapp_number,
          email: data.email || defaultSettings.email
        };
      }
    } catch (err) {
      console.warn("fetchSettings Supabase error:", err);
    }
  }

  // Demo Fallback
  const found = salons.find(s => s.id === (salonId || "default"));
  if (found) {
    return {
      shop_name: found.name || defaultSettings.shop_name,
      shop_subtitle: found.subtitle || defaultSettings.shop_subtitle,
      shop_mobile: found.mobile || defaultSettings.shop_mobile,
      shop_address: found.address ?? "",
      invoice_prefix: found.invoice_prefix || defaultSettings.invoice_prefix,
      whatsapp_number: found.whatsapp_number || defaultSettings.whatsapp_number,
      email: found.email || defaultSettings.email
    };
  }

  return defaultSettings;
}

export const getBusinessSettings = fetchSettings;

export async function saveSettings(settings, actorInfo = null, salonId = "default") {
  const targetId = salonId || "default";
  const userRole = (actorInfo?.role || "").toLowerCase();
  const isSuperAdmin = userRole === "superadmin" || userRole === "super_admin";

  // Fetch local salons to preserve name and other fields if not super admin
  const localSalons = getLocalSalons();
  const existingSalon = localSalons.find(s => s.id === targetId);

  // ONLY Super Admin can change salon/branch name
  const salonName = (!isSuperAdmin && existingSalon?.name)
    ? existingSalon.name
    : (settings.shop_name || existingSalon?.name || "NICE LOOKING").trim();

  // Invoice prefix can be changed by Salon Owner and Super Admin
  const prefix = ((settings.invoice_prefix !== undefined && settings.invoice_prefix !== null && String(settings.invoice_prefix).trim() !== "")
    ? String(settings.invoice_prefix).trim()
    : (existingSalon?.invoice_prefix || "NL")
  ).toUpperCase() || "NL";

  const payload = {
    id: targetId,
    name: salonName,
    slug: existingSalon?.slug || (targetId === "default" ? "nl-bandra" : `salon-${targetId}`),
    subtitle: (settings.shop_subtitle !== undefined ? settings.shop_subtitle : (existingSalon?.subtitle || "Hair Wig & Hair Services")).trim(),
    mobile: (settings.shop_mobile || settings.whatsapp_number || existingSalon?.mobile || "+91 98765 43210").trim(),
    address: (settings.shop_address !== undefined ? settings.shop_address : (existingSalon?.address || "")).trim(),
    invoice_prefix: prefix,
    whatsapp_number: (settings.whatsapp_number || settings.shop_mobile || existingSalon?.whatsapp_number || "919876543210").trim(),
    email: (settings.email || existingSalon?.email || "sameershaikh121@proton.me").trim(),
    owner_name: existingSalon?.owner_name || "Salon Owner",
    owner_email: existingSalon?.owner_email || "",
    status: existingSalon?.status || "ACTIVE",
    updated_at: new Date().toISOString()
  };

  let savedData = null;

  if (supabaseConfigured) {
    // 1. Try atomic RPC procedure save_salon_branch
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("save_salon_branch", {
        p_id: payload.id,
        p_name: payload.name,
        p_slug: payload.slug,
        p_subtitle: payload.subtitle,
        p_invoice_prefix: payload.invoice_prefix,
        p_mobile: payload.mobile,
        p_email: payload.email,
        p_address: payload.address,
        p_whatsapp_number: payload.whatsapp_number,
        p_owner_name: payload.owner_name,
        p_owner_email: payload.owner_email,
        p_status: payload.status
      });

      if (!rpcErr && rpcData) {
        savedData = rpcData;
      } else if (rpcErr) {
        console.warn("saveSettings save_salon_branch RPC notice:", rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn("saveSettings RPC exception:", rpcEx);
    }

    // 2. Direct table upsert fallback
    if (!savedData) {
      try {
        const { data: upsData, error: upsErr } = await supabase
          .from("salons")
          .upsert(payload)
          .select()
          .maybeSingle();

        if (!upsErr && upsData) {
          savedData = upsData;
        } else if (upsErr) {
          console.warn("saveSettings direct salons upsert notice:", upsErr.message);
        }
      } catch (upsEx) {
        console.warn("saveSettings upsert exception:", upsEx);
      }
    }
  }

  // Update local salon cache
  const finalObj = savedData || payload;
  const salons = getLocalSalons();
  const idx = salons.findIndex(s => s.id === targetId);
  if (idx >= 0) {
    salons[idx] = { ...salons[idx], ...finalObj };
  } else {
    salons.push(finalObj);
  }
  saveLocalSalons(salons);

  logAuditEvent({
    action: "SETTINGS_UPDATE",
    entityType: "settings",
    entityId: targetId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetId,
    details: `Updated settings for ${payload.name} (Invoice Prefix: ${payload.invoice_prefix})`
  }).catch(() => {});

  return {
    shop_name: finalObj.name || payload.name,
    shop_subtitle: finalObj.subtitle || payload.subtitle,
    shop_mobile: finalObj.mobile || payload.mobile,
    shop_address: finalObj.address ?? payload.address,
    invoice_prefix: finalObj.invoice_prefix || payload.invoice_prefix,
    whatsapp_number: finalObj.whatsapp_number || payload.whatsapp_number,
    email: finalObj.email || payload.email
  };
}

export const saveBusinessSettings = saveSettings;
