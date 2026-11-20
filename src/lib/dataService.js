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
    name: "MY SALON (Main Branch)",
    slug: "my-salon-main",
    subtitle: "Hair Wig & Hair Services",
    mobile: "+91 98765 43210",
    email: "sameershaikh584@gmail.com",
    address: "Shop 4, Hill Road, Bandra West, Mumbai",
    invoice_prefix: "MS",
    whatsapp_number: "919876543210",
    status: "ACTIVE",
    owner_name: "Sameer Shaikh",
    owner_email: "sameershaikh584@gmail.com",
    created_at: "2026-08-01T00:00:00.000Z"
  }
];

// =====================================================================
// High-Performance In-Memory Query Cache & In-Flight Promise Deduplication
// =====================================================================
const queryCache = new Map();
const inFlightRequests = new Map();
const DEFAULT_CACHE_TTL_MS = 120000; // 2 minutes TTL for instant tab switches

export function getCachedQuery(key, maxAgeMs = DEFAULT_CACHE_TTL_MS) {
  const item = queryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAgeMs) {
    queryCache.delete(key);
    return null;
  }
  return item.data;
}

export function peekCachedQuery(key) {
  const item = queryCache.get(key);
  return item ? item.data : null;
}

export function setCachedQuery(key, data) {
  queryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateQueryCache(prefix) {
  if (!prefix) {
    queryCache.clear();
    return;
  }
  for (const k of queryCache.keys()) {
    if (k.startsWith(prefix) || k.includes(prefix)) {
      queryCache.delete(k);
    }
  }
}

export async function deduplicateRequest(key, fetcher) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = (async () => {
    try {
      return await fetcher();
    } finally {
      inFlightRequests.delete(key);
    }
  })();
  inFlightRequests.set(key, promise);
  return promise;
}

// Production Multi-Tenant Cache Store
export function getLocalDemoData() {
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
    const parsed = JSON.parse(raw);
    return (parsed || []).map(s => {
      if (s.id === "default" && s.name && s.name.includes("NICE LOOKING")) {
        return { ...s, name: s.name.replace(/NICE LOOKING/g, "MY SALON") };
      }
      return s;
    });
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
  const cacheKey = `salons_${normRole}_${userSalonId}_${cleanEmail}`;

  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
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

    let result = mergedSalons;
    if (!isSuper) {
      const assignedList = Array.isArray(assignedSalons) ? assignedSalons : [];
      result = mergedSalons.filter(s => {
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

    setCachedQuery(cacheKey, result);
    return result;
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

  invalidateQueryCache("salons");
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

  invalidateQueryCache("salons");
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
const verifiedSalonsCache = new Set();

export async function ensureSalonInDatabase(salonId = "default") {
  if (!supabaseConfigured || !salonId) return true;
  const targetId = String(salonId).trim();
  if (!targetId) return true;
  if (verifiedSalonsCache.has(targetId)) return true;

  try {
    const { data, error } = await supabase
      .from("salons")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();

    if (!error && data?.id) {
      verifiedSalonsCache.add(targetId);
      return true;
    }

    const localSalons = getLocalSalons();
    const found = localSalons.find(s => s.id === targetId);

    const fallbackName = targetId === "default"
      ? "MY SALON (Bandra)"
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
      verifiedSalonsCache.add(targetId);
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
  const cacheKey = `customers_${salonId || "default"}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
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
    let enriched = allMerged;
    try {
      const allInvoices = await fetchInvoices(salonId);
      enriched = allMerged.map(c => {
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
      enriched = allMerged;
    }

    setCachedQuery(cacheKey, enriched);
    return enriched;
  });
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
  invalidateQueryCache("customers");

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
  invalidateQueryCache("customers");
  return true;
}

// -------------------------------------------------------------
// Products / Wig Inventory (Scoped per Salon)
// -------------------------------------------------------------
export async function fetchProducts(salonId = "default") {
  const cacheKey = `products_${salonId || "default"}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
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
    let result = allMerged;
    if (salonId && salonId !== "all") {
      result = allMerged.filter(p => (p.salonId || p.salon_id || "default") === salonId);
    }
    setCachedQuery(cacheKey, result);
    return result;
  });
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
  invalidateQueryCache("products");

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
  invalidateQueryCache("products");
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
  let paymentMeta = null;

  if (rawDesc && typeof rawDesc === "string") {
    let cleanText = rawDesc;
    if (cleanText.includes("---PAYMENT_META---")) {
      const pParts = cleanText.split("---PAYMENT_META---");
      cleanText = pParts[0] || "";
      try {
        paymentMeta = JSON.parse(pParts[1]?.trim() || "null");
      } catch {}
    }

    if (cleanText.includes("---ITEMS_JSON---")) {
      const parts = cleanText.split("---ITEMS_JSON---");
      userNote = parts[0]?.trim() || "";
      try {
        const parsed = JSON.parse(parts[1]?.trim() || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          items = parsed;
        }
      } catch {}
    } else {
      userNote = cleanText.trim();
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

  const tot = Number(invRecord?.total !== undefined ? invRecord.total : (invRecord?.amount || 0));
  const rawAdv = paymentMeta?.advanceAmount ?? invRecord?.advanceAmount ?? invRecord?.advance_amount;
  const advanceAmount = rawAdv !== undefined && rawAdv !== null && rawAdv !== "" ? Number(rawAdv) : tot;
  const rawBal = paymentMeta?.balanceAmount ?? invRecord?.balanceAmount ?? invRecord?.balance_amount;
  const balanceAmount = rawBal !== undefined && rawBal !== null && rawBal !== "" ? Number(rawBal) : Math.max(0, tot - advanceAmount);
  const paymentStatus = paymentMeta?.paymentStatus || (balanceAmount > 0 ? (advanceAmount > 0 ? "PARTIAL" : "UDHAR") : "PAID");
  const settlements = Array.isArray(paymentMeta?.settlements) ? paymentMeta.settlements : [];

  return { items, userNote, advanceAmount, balanceAmount, paymentStatus, settlements };
}

export async function fetchInvoices(salonId = "default") {
  const cacheKey = `invoices_${salonId || "default"}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
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
            const { items, userNote, advanceAmount, balanceAmount, paymentStatus, settlements } = parseItemsFromInvoice(inv.description, inv);
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
              advanceAmount,
              balanceAmount,
              paymentStatus,
              settlements: Array.isArray(settlements) ? settlements : [],
              paymentMode: inv.payment_mode || "Cash",
              status: voidInfo.isVoid ? "VOIDED" : (paymentStatus || inv.status || "PAID"),
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
      const { items, userNote, advanceAmount, balanceAmount, paymentStatus, settlements } = parseItemsFromInvoice(inv.rawDescription || inv.description, inv);
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

      const effAdv = inv.advanceAmount !== undefined ? inv.advanceAmount : advanceAmount;
      const effBal = inv.balanceAmount !== undefined ? inv.balanceAmount : balanceAmount;
      const effStatus = inv.paymentStatus || paymentStatus || (effBal > 0 ? (effAdv > 0 ? "PARTIAL" : "UDHAR") : "PAID");
      const effSettlements = Array.isArray(inv.settlements) ? inv.settlements : (Array.isArray(settlements) ? settlements : []);

      return {
        ...inv,
        id: String(inv.id),
        salonId: inv.salonId || inv.salon_id || "default",
        salon_id: inv.salonId || inv.salon_id || "default",
        subtotal,
        total,
        amount: total,
        advanceAmount: effAdv,
        balanceAmount: effBal,
        paymentStatus: effStatus,
        settlements: effSettlements,
        items,
        description: userNote || "",
        isVoided: voidInfo.isVoid,
        status: voidInfo.isVoid ? "VOIDED" : (effStatus || inv.status || "PAID"),
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
    let result = allMerged;
    if (salonId && salonId !== "all") {
      result = allMerged.filter(i => (i.salonId || i.salon_id || "default") === salonId);
    }
    setCachedQuery(cacheKey, result);
    return result;
  });
}

export async function createInvoice(form, lineItems, actorInfo = null, salonId = "default") {
  const normMobile = normalizeWhatsAppNumber(form.mobile);
  if (!normMobile) throw new Error("A valid mobile number is required.");
  if (!form.name || !form.name.trim()) throw new Error("Customer name is required.");

  const effectiveSalonId = salonId || "default";

  // Auto-sync salon in DB before creating invoice (cached in-memory)
  if (supabaseConfigured) {
    await ensureSalonInDatabase(effectiveSalonId);
  }

  let savedCustomer = null;

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

  // Calculate advance and balance / udhar
  const rawAdv = form.advanceAmount !== undefined && form.advanceAmount !== "" ? Number(form.advanceAmount) : total;
  const advanceAmount = Math.max(0, isNaN(rawAdv) ? total : rawAdv);
  const balanceAmount = Math.max(0, total - advanceAmount);
  const paymentStatus = balanceAmount > 0 ? (advanceAmount > 0 ? "PARTIAL" : "UDHAR") : "PAID";

  const paymentMetaObj = { advanceAmount, balanceAmount, paymentStatus };
  const fullDescriptionPayload = `${form.description || ""}\n---ITEMS_JSON---\n${JSON.stringify(activeItems)}\n---PAYMENT_META---\n${JSON.stringify(paymentMetaObj)}`.trim();

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
          advanceAmount,
          balanceAmount,
          paymentStatus,
          status: paymentStatus,
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
        if (!savedCustomer) {
          savedCustomer = await saveCustomer({
            name: form.name.trim(),
            mobile: normMobile,
            address: form.address?.trim() || "",
            whatsapp_opt_in: form.whatsapp !== false
          }, actorInfo, effectiveSalonId).catch(() => null);
        }

        let txnId = null;
        try {
          const { data: txnData } = await supabase
            .from("transactions")
            .insert({
              salon_id: effectiveSalonId,
              customer_id: savedCustomer?.id || null,
              amount: advanceAmount,
              discount: discount,
              payment_mode: form.paymentMode || "Cash",
              payment_status: balanceAmount > 0 ? "PARTIAL" : "SUCCESS",
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
          status: paymentStatus,
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
            advanceAmount,
            balanceAmount,
            paymentStatus,
            status: paymentStatus,
            paymentMode: form.paymentMode || "Cash",
            items: activeItems,
            createdAt: formatToLocalISODate(invoiceDateISO)
          };
        }
      } catch (directInvErr) {
        console.warn("Direct invoice insert error (saved locally):", directInvErr);
      }
    }

    // 3. Guaranteed stock deduction for additional wig line items in Supabase (parallel execution)
    const itemsToDeduct = rpcSuccess ? activeItems.slice(1) : activeItems;
    if (itemsToDeduct.length > 0) {
      await Promise.allSettled(
        itemsToDeduct.map(async (item) => {
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
        })
      );
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
  const custId = savedCustomer?.id || finalSavedInv?.customer_id || ("cust-" + normMobile.slice(-10));
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
    advanceAmount,
    balanceAmount,
    paymentStatus,
    paymentMode: form.paymentMode || "Cash",
    status: paymentStatus,
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

  invalidateQueryCache("invoices");
  invalidateQueryCache("dashboard");
  invalidateQueryCache("reports");

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

    invalidateQueryCache("invoices");
    invalidateQueryCache("dashboard");
    invalidateQueryCache("reports");

    return voidedInv;
  }

  invalidateQueryCache("invoices");
  invalidateQueryCache("dashboard");
  invalidateQueryCache("reports");

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

  // Calculate advance and balance / udhar
  const rawAdv = updatedData.advanceAmount !== undefined && updatedData.advanceAmount !== "" ? Number(updatedData.advanceAmount) : total;
  const advanceAmount = Math.max(0, isNaN(rawAdv) ? total : rawAdv);
  const balanceAmount = Math.max(0, total - advanceAmount);
  const paymentStatus = balanceAmount > 0 ? (advanceAmount > 0 ? "PARTIAL" : "UDHAR") : "PAID";

  const paymentMetaObj = { advanceAmount, balanceAmount, paymentStatus };
  let baseDesc = (updatedData.rawDescription || updatedData.description || "")
    .replace(/---PAYMENT_META---[\s\S]*/g, "")
    .trim();
  const fullDescriptionPayload = `${baseDesc}\n---PAYMENT_META---\n${JSON.stringify(paymentMetaObj)}`.trim();

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
        p_description: fullDescriptionPayload,
        p_invoice_date: updatedData.rawCreatedAt || updatedData.invoice_date || null,
        p_salon_id: salonId || "default"
      };

      const { data, error } = await supabase.rpc("update_invoice_with_stock", rpcParams);
      if (!error && data) {
        // also update status on invoice directly if needed
        await supabase.from("invoices").update({ status: paymentStatus, description: fullDescriptionPayload }).eq("id", updatedData.id);
        return { ...data, advanceAmount, balanceAmount, paymentStatus, status: paymentStatus };
      }
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
      advanceAmount,
      balanceAmount,
      paymentStatus,
      status: paymentStatus,
      paymentMode: updatedData.paymentMode,
      description: updatedData.description || "",
      rawDescription: fullDescriptionPayload
    };

    d.invoices[oldInvIdx] = saved;
    saveLocalDemoData(d);

    invalidateQueryCache("invoices");
    invalidateQueryCache("dashboard");
    invalidateQueryCache("reports");

    return saved;
  }

  invalidateQueryCache("invoices");
  invalidateQueryCache("dashboard");
  invalidateQueryCache("reports");

  return { ...updatedData, advanceAmount, balanceAmount, paymentStatus, status: paymentStatus };
}

export async function settleInvoiceBalance(invoiceId, paymentData, actorInfo = null, salonId = "default", knownInvoice = null) {
  const amountToPay = Math.max(0, Number(paymentData?.amount || paymentData?.amountPaid || 0));
  if (amountToPay <= 0) {
    throw new Error("Please enter a valid payment amount greater than zero.");
  }

  const pMode = paymentData?.paymentMode || "Cash";
  const pNote = String(paymentData?.note || "").trim();
  const paymentDate = paymentData?.paymentDate ? new Date(paymentData.paymentDate).toISOString() : new Date().toISOString();

  // 1. Rapidly resolve target invoice without full network fetch if already known or in local storage
  let targetInv = knownInvoice;
  if (!targetInv) {
    const localInvoices = getLocalDemoData().invoices || [];
    targetInv = localInvoices.find(i => String(i.id) === String(invoiceId));
  }
  if (!targetInv) {
    const invoices = await fetchInvoices(salonId || "default");
    targetInv = invoices.find(i => String(i.id) === String(invoiceId));
  }
  if (!targetInv) {
    throw new Error(`Invoice #${invoiceId} not found.`);
  }

  if (targetInv.isVoided) {
    throw new Error("Cannot collect payment on a voided invoice.");
  }

  const currentTotal = Number(targetInv.total !== undefined ? targetInv.total : (targetInv.amount || 0));
  const currentAdvance = Number(targetInv.advanceAmount !== undefined ? targetInv.advanceAmount : currentTotal);
  const currentBalance = Number(targetInv.balanceAmount !== undefined ? targetInv.balanceAmount : Math.max(0, currentTotal - currentAdvance));

  if (currentBalance <= 0) {
    throw new Error("This invoice is already fully paid. No pending balance.");
  }

  // Calculate new advance and balance
  const actualPayment = Math.min(amountToPay, currentBalance);
  const newAdvance = currentAdvance + actualPayment;
  const newBalance = Math.max(0, currentTotal - newAdvance);
  const newStatus = newBalance === 0 ? "PAID" : "PARTIAL";

  // Build settlement entry
  const newSettlement = {
    id: "pay-" + Date.now(),
    amount: actualPayment,
    paymentMode: pMode,
    date: paymentDate,
    collectedByName: actorInfo?.name || "Staff",
    collectedById: actorInfo?.id || null,
    note: pNote
  };

  const existingSettlements = Array.isArray(targetInv.settlements) ? targetInv.settlements : [];
  const updatedSettlements = [...existingSettlements, newSettlement];

  // Re-encode description with updated PAYMENT_META
  const paymentMetaObj = {
    advanceAmount: newAdvance,
    balanceAmount: newBalance,
    paymentStatus: newStatus,
    settlements: updatedSettlements,
    lastPayment: {
      amount: actualPayment,
      mode: pMode,
      date: paymentDate
    }
  };

  const rawBaseDesc = (targetInv.rawDescription || targetInv.description || "")
    .replace(/---PAYMENT_META---[\s\S]*/g, "")
    .trim();
  const fullDescriptionPayload = `${rawBaseDesc}\n---PAYMENT_META---\n${JSON.stringify(paymentMetaObj)}`.trim();

  const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  // 2. Supabase persistence in parallel
  if (supabaseConfigured && isUuid(invoiceId)) {
    try {
      const salonTarget = targetInv.salonId || targetInv.salon_id || salonId || "default";

      const txnPromise = supabase.from("transactions").insert({
        salon_id: salonTarget,
        customer_id: targetInv.customerId || null,
        amount: actualPayment,
        discount: 0,
        payment_mode: pMode,
        payment_status: "SUCCESS",
        is_voided: false,
        created_at: paymentDate
      });

      const invPromise = supabase.from("invoices").update({
        status: newStatus,
        payment_mode: pMode,
        description: fullDescriptionPayload,
        updated_at: new Date().toISOString()
      }).eq("id", invoiceId);

      await Promise.allSettled([txnPromise, invPromise]);
    } catch (dbErr) {
      console.warn("Supabase settlement exception:", dbErr);
    }
  }

  // 3. Update Local Storage cache
  const d = getLocalDemoData();
  const oldInvIdx = (d.invoices || []).findIndex(i => String(i.id) === String(invoiceId));
  const updatedInv = {
    ...targetInv,
    advanceAmount: newAdvance,
    balanceAmount: newBalance,
    paymentStatus: newStatus,
    status: newStatus,
    paymentMode: pMode,
    settlements: updatedSettlements,
    rawDescription: fullDescriptionPayload
  };

  if (oldInvIdx >= 0) {
    d.invoices[oldInvIdx] = {
      ...d.invoices[oldInvIdx],
      ...updatedInv
    };
    saveLocalDemoData(d);
  }

  // Log Audit Event
  logAuditEvent({
    action: "INVOICE_SETTLEMENT",
    entityType: "invoice",
    entityId: invoiceId,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetInv.salonId || targetInv.salon_id || salonId || "default",
    newData: {
      invoiceNumber: targetInv.invoiceNumber,
      amountPaid: actualPayment,
      remainingBalance: newBalance,
      status: newStatus
    },
    details: `Collected pending payment of ₹${actualPayment.toLocaleString("en-IN")} via ${pMode} for Invoice #${targetInv.invoiceNumber}. Remaining balance: ₹${newBalance.toLocaleString("en-IN")}`
  }).catch(() => {});

  invalidateQueryCache("invoices");
  invalidateQueryCache("dashboard");
  invalidateQueryCache("reports");

  return {
    invoice: updatedInv,
    settlement: newSettlement,
    amountPaid: actualPayment,
    remainingBalance: newBalance,
    isFullyPaid: newBalance === 0
  };
}

export async function findCustomerPendingUdhar(rawMobile, salonId = "default") {
  const norm = normalizeWhatsAppNumber(rawMobile);
  if (!norm) return [];
  const digits10 = norm.slice(-10);

  const allInvoices = await fetchInvoices(salonId || "default");
  return allInvoices.filter(i => {
    if (i.isVoided) return false;
    const invDigits = normalizeWhatsAppNumber(i.mobile || i.customerMobile).slice(-10);
    return invDigits === digits10 && Number(i.balanceAmount || 0) > 0;
  });
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

  invalidateQueryCache("invoices");
  invalidateQueryCache("dashboard");
  invalidateQueryCache("reports");

  return true;
}

// -------------------------------------------------------------
// Settings Management (Scoped per Salon)
// -------------------------------------------------------------
export async function fetchSettings(salonId = "default") {
  const salons = getLocalSalons();
  const matchedLocal = salons.find(s => s.id === (salonId || "default"));

  const defaultSettings = {
    shop_name: matchedLocal?.name || "MY SALON",
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
    : (settings.shop_name || existingSalon?.name || "MY SALON").trim();

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

// =====================================================================
// EMPLOYEE MANAGEMENT, ATTENDANCE & PAYROLL MODULE (Multi-Salon SaaS)
// =====================================================================

// Helper to check if string is UUID
const isUuid = (val) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

// -------------------------------------------------------------
// 1. Employee Directory Management
// -------------------------------------------------------------

export async function fetchEmployees(salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `employees_${targetSalon}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    let remoteEmployees = null;

    if (supabaseConfigured) {
      try {
        let query = supabase
          .from("employees")
          .select("*")
          .order("created_at", { ascending: false });

        if (targetSalon && targetSalon !== "all") {
          query = query.eq("salon_id", targetSalon);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          remoteEmployees = data.map(e => ({
            id: String(e.id),
            salonId: e.salon_id || targetSalon,
            branchId: e.branch_id || e.salon_id || targetSalon,
            name: e.name,
            mobile: e.mobile,
            jobRole: e.job_role,
            joiningDate: e.joining_date || new Date().toISOString().slice(0, 10),
            salaryType: e.salary_type || "MONTHLY", // 'MONTHLY', 'DAILY_WAGE', 'HOURLY'
            baseSalary: Number(e.base_salary || 0),
            monthlyWorkingDays: Number(e.monthly_working_days || 30),
            paidLeavesPerMonth: Number(e.paid_leaves_per_month !== undefined ? e.paid_leaves_per_month : 1),
            overtimeRate: Number(e.overtime_rate || 0),
            fixedAllowance: Number(e.fixed_allowance || 0),
            status: e.status || "ACTIVE", // 'ACTIVE', 'INACTIVE'
            address: e.address || "",
            notes: e.notes || "",
            userId: e.user_id || null,
            createdAt: e.created_at
          }));
        }
      } catch (err) {
        console.warn("fetchEmployees Supabase query warning:", err);
      }
    }

    // Merge with local demo cache
    const d = getLocalDemoData();
    const rawLocal = (d.employees || []).map(e => ({
      id: String(e.id),
      salonId: e.salonId || e.salon_id || targetSalon,
      branchId: e.branchId || e.salonId || targetSalon,
      name: e.name,
      mobile: e.mobile,
      jobRole: e.jobRole || e.job_role || "Staff",
      joiningDate: e.joiningDate || e.joining_date || new Date().toISOString().slice(0, 10),
      salaryType: e.salaryType || e.salary_type || "MONTHLY",
      baseSalary: Number(e.baseSalary || e.base_salary || 0),
      monthlyWorkingDays: Number(e.monthlyWorkingDays || e.monthly_working_days || 30),
      paidLeavesPerMonth: Number(e.paidLeavesPerMonth ?? e.paid_leaves_per_month ?? 1),
      overtimeRate: Number(e.overtimeRate || e.overtime_rate || 0),
      fixedAllowance: Number(e.fixedAllowance || e.fixed_allowance || 0),
      status: e.status || "ACTIVE",
      address: e.address || "",
      notes: e.notes || "",
      userId: e.userId || e.user_id || null,
      createdAt: e.createdAt || e.created_at || new Date().toISOString()
    }));

    const empMap = new Map();
    rawLocal.forEach(e => {
      if (!targetSalon || targetSalon === "all" || e.salonId === targetSalon) {
        empMap.set(String(e.id), e);
      }
    });

    if (Array.isArray(remoteEmployees)) {
      remoteEmployees.forEach(e => empMap.set(String(e.id), e));
    }

    const result = Array.from(empMap.values());
    setCachedQuery(cacheKey, result);
    return result;
  });
}

export async function saveEmployee(employeeData, actorInfo = null, salonId = "default") {
  const effectiveSalonId = employeeData.salonId || employeeData.salon_id || salonId || "default";
  const name = String(employeeData.name || "").trim();
  const mobile = String(employeeData.mobile || "").replace(/\D/g, "");
  const jobRole = String(employeeData.jobRole || employeeData.job_role || "Staff").trim();
  const salaryType = ["MONTHLY", "DAILY_WAGE", "HOURLY"].includes(employeeData.salaryType)
    ? employeeData.salaryType
    : "MONTHLY";
  const baseSalary = Math.max(0, Number(employeeData.baseSalary || 0));
  const monthlyWorkingDays = Math.min(31, Math.max(20, Number(employeeData.monthlyWorkingDays || 30)));
  const paidLeavesPerMonth = Math.max(0, Number(employeeData.paidLeavesPerMonth ?? 1));
  const overtimeRate = Math.max(0, Number(employeeData.overtimeRate || 0));
  const fixedAllowance = Math.max(0, Number(employeeData.fixedAllowance || 0));
  const status = employeeData.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const joiningDate = employeeData.joiningDate || new Date().toISOString().slice(0, 10);
  const address = employeeData.address || "";
  const notes = employeeData.notes || "";
  const branchId = employeeData.branchId || effectiveSalonId;

  if (!name) throw new Error("Employee full name is required.");
  if (mobile.length < 10) throw new Error("A valid 10-digit mobile number is required.");

  let savedEmployee = null;

  if (supabaseConfigured) {
    try {
      const payload = {
        salon_id: effectiveSalonId,
        branch_id: branchId,
        name,
        mobile,
        job_role: jobRole,
        joining_date: joiningDate,
        salary_type: salaryType,
        base_salary: baseSalary,
        monthly_working_days: monthlyWorkingDays,
        paid_leaves_per_month: paidLeavesPerMonth,
        overtime_rate: overtimeRate,
        fixed_allowance: fixedAllowance,
        status,
        address,
        notes,
        updated_at: new Date().toISOString()
      };

      if (employeeData.id && isUuid(employeeData.id)) {
        const { data, error } = await supabase
          .from("employees")
          .update(payload)
          .eq("id", employeeData.id)
          .select()
          .maybeSingle();

        if (!error && data) savedEmployee = data;
      } else {
        payload.created_by = actorInfo?.id && isUuid(actorInfo.id) ? actorInfo.id : null;
        const { data, error } = await supabase
          .from("employees")
          .insert(payload)
          .select()
          .maybeSingle();

        if (!error && data) savedEmployee = data;
      }
    } catch (err) {
      console.warn("saveEmployee Supabase operation warning:", err);
    }
  }

  // Update local demo cache
  const d = getLocalDemoData();
  if (!d.employees) d.employees = [];

  const empId = savedEmployee?.id || employeeData.id || `emp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const localObj = {
    id: String(empId),
    salonId: effectiveSalonId,
    branchId,
    name,
    mobile,
    jobRole,
    joiningDate,
    salaryType,
    baseSalary,
    monthlyWorkingDays,
    paidLeavesPerMonth,
    overtimeRate,
    fixedAllowance,
    status,
    address,
    notes,
    createdAt: savedEmployee?.created_at || employeeData.createdAt || new Date().toISOString()
  };

  const idx = d.employees.findIndex(e => String(e.id) === String(empId));
  if (idx >= 0) {
    d.employees[idx] = { ...d.employees[idx], ...localObj };
  } else {
    d.employees.unshift(localObj);
  }
  saveLocalDemoData(d);

  // Log Audit Event
  logAuditEvent({
    action: employeeData.id ? "EMPLOYEE_UPDATE" : "EMPLOYEE_CREATE",
    entityType: "employee",
    entityId: String(empId),
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: effectiveSalonId,
    details: `${employeeData.id ? "Updated" : "Created"} employee ${name} (${jobRole}) with base salary ₹${baseSalary.toLocaleString("en-IN")}/${salaryType}`
  }).catch(() => {});

  invalidateQueryCache("employees");
  return localObj;
}

export async function deactivateEmployee(employeeId, actorInfo = null, salonId = "default") {
  if (!employeeId) return false;

  if (supabaseConfigured && isUuid(employeeId)) {
    try {
      await supabase
        .from("employees")
        .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
        .eq("id", employeeId);
    } catch (err) {
      console.warn("deactivateEmployee Supabase warning:", err);
    }
  }

  const d = getLocalDemoData();
  if (d.employees) {
    const idx = d.employees.findIndex(e => String(e.id) === String(employeeId));
    if (idx >= 0) {
      d.employees[idx].status = "INACTIVE";
      saveLocalDemoData(d);
    }
  }

  logAuditEvent({
    action: "EMPLOYEE_DEACTIVATE",
    entityType: "employee",
    entityId: String(employeeId),
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: salonId || "default",
    details: `Deactivated employee ID #${employeeId}`
  }).catch(() => {});

  invalidateQueryCache("employees");
  return true;
}

// -------------------------------------------------------------
// 2. Salon Payroll Settings
// -------------------------------------------------------------

export async function fetchSalonPayrollSettings(salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `payroll_settings_${targetSalon}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    let remoteSettings = null;

    if (supabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from("salon_payroll_settings")
          .select("*")
          .eq("salon_id", targetSalon)
          .maybeSingle();

        if (!error && data) {
          remoteSettings = {
            id: data.id,
            salonId: data.salon_id,
            openingTime: data.opening_time || "10:00:00",
            closingTime: data.closing_time || "20:00:00",
            gracePeriodMinutes: Number(data.grace_period_minutes ?? 15),
            salaryDivisorMode: data.salary_divisor_mode || "CALENDAR_DAYS",
            weeklyOffPaid: data.weekly_off_paid !== false,
            holidayPaid: data.holiday_paid !== false,
            halfDayDeductionFactor: Number(data.half_day_deduction_factor ?? 0.5),
            overtimeEnabled: data.overtime_enabled !== false,
            defaultOvertimeMultiplier: Number(data.default_overtime_multiplier ?? 1.5)
          };
        }
      } catch (err) {
        console.warn("fetchSalonPayrollSettings warning:", err);
      }
    }

    const d = getLocalDemoData();
    const localSettings = (d.payrollSettings && d.payrollSettings[targetSalon]) || {};

    const result = {
      salonId: targetSalon,
      openingTime: remoteSettings?.openingTime || localSettings.openingTime || "10:00:00",
      closingTime: remoteSettings?.closingTime || localSettings.closingTime || "20:00:00",
      gracePeriodMinutes: remoteSettings?.gracePeriodMinutes ?? localSettings.gracePeriodMinutes ?? 15,
      salaryDivisorMode: remoteSettings?.salaryDivisorMode || localSettings.salaryDivisorMode || "CALENDAR_DAYS",
      weeklyOffPaid: remoteSettings?.weeklyOffPaid ?? localSettings.weeklyOffPaid ?? true,
      holidayPaid: remoteSettings?.holidayPaid ?? localSettings.holidayPaid ?? true,
      halfDayDeductionFactor: remoteSettings?.halfDayDeductionFactor ?? localSettings.halfDayDeductionFactor ?? 0.5,
      overtimeEnabled: remoteSettings?.overtimeEnabled ?? localSettings.overtimeEnabled ?? true,
      defaultOvertimeMultiplier: remoteSettings?.defaultOvertimeMultiplier ?? localSettings.defaultOvertimeMultiplier ?? 1.5
    };
    setCachedQuery(cacheKey, result);
    return result;
  });
}

export async function saveSalonPayrollSettings(settingsPayload, actorInfo = null, salonId = "default") {
  const targetSalon = settingsPayload.salonId || salonId || "default";

  const payload = {
    salon_id: targetSalon,
    opening_time: settingsPayload.openingTime || "10:00:00",
    closing_time: settingsPayload.closingTime || "20:00:00",
    grace_period_minutes: Number(settingsPayload.gracePeriodMinutes ?? 15),
    salary_divisor_mode: settingsPayload.salaryDivisorMode || "CALENDAR_DAYS",
    weekly_off_paid: settingsPayload.weeklyOffPaid !== false,
    holiday_paid: settingsPayload.holidayPaid !== false,
    half_day_deduction_factor: Number(settingsPayload.halfDayDeductionFactor ?? 0.5),
    overtime_enabled: settingsPayload.overtimeEnabled !== false,
    default_overtime_multiplier: Number(settingsPayload.defaultOvertimeMultiplier ?? 1.5),
    updated_at: new Date().toISOString()
  };

  if (supabaseConfigured) {
    try {
      await supabase
        .from("salon_payroll_settings")
        .upsert(payload, { onConflict: "salon_id" });
    } catch (err) {
      console.warn("saveSalonPayrollSettings warning:", err);
    }
  }

  const d = getLocalDemoData();
  if (!d.payrollSettings) d.payrollSettings = {};
  d.payrollSettings[targetSalon] = { ...settingsPayload, salonId: targetSalon };
  saveLocalDemoData(d);

  logAuditEvent({
    action: "PAYROLL_SETTINGS_UPDATE",
    entityType: "settings",
    entityId: targetSalon,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Updated payroll & attendance policy settings for salon ${targetSalon}`
  }).catch(() => {});

  invalidateQueryCache("payroll_settings");
  return d.payrollSettings[targetSalon];
}

// -------------------------------------------------------------
// 3. Attendance Management
// -------------------------------------------------------------

export async function fetchAttendanceForDate(attendanceDate, salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `attendance_${targetSalon}_${attendanceDate}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    let remoteRecords = null;

    if (supabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from("attendance")
          .select("*")
          .eq("salon_id", targetSalon)
          .eq("attendance_date", attendanceDate);

        if (!error && Array.isArray(data)) {
          remoteRecords = data.map(a => ({
            id: String(a.id),
            salonId: a.salon_id,
            employeeId: String(a.employee_id),
            attendanceDate: a.attendance_date,
            status: a.status,
            checkIn: a.check_in || "",
            checkOut: a.check_out || "",
            workingHours: Number(a.working_hours || 0),
            isLate: Boolean(a.is_late),
            lateMinutes: Number(a.late_minutes || 0),
            overtimeHours: Number(a.overtime_hours || 0),
            notes: a.notes || "",
            markedByName: a.marked_by_name || "Admin"
          }));
        }
      } catch (err) {
        console.warn("fetchAttendanceForDate warning:", err);
      }
    }

    const d = getLocalDemoData();
    const localList = (d.attendance || []).filter(
      a => (a.salonId || a.salon_id || targetSalon) === targetSalon && a.attendanceDate === attendanceDate
    );

    const attMap = new Map();
    localList.forEach(a => attMap.set(String(a.employeeId), a));
    if (Array.isArray(remoteRecords)) {
      remoteRecords.forEach(a => attMap.set(String(a.employeeId), a));
    }

    const result = Array.from(attMap.values());
    setCachedQuery(cacheKey, result);
    return result;
  });
}

export async function saveAttendanceBatch(records, actorInfo = null, salonId = "default") {
  if (!Array.isArray(records) || records.length === 0) return [];
  const targetSalon = salonId || "default";
  const settings = await fetchSalonPayrollSettings(targetSalon);

  // Compute late arrival and working hours
  const processed = records.map(r => {
    let workingHours = Number(r.workingHours || 0);
    let isLate = false;
    let lateMinutes = 0;

    if (r.checkIn && r.checkOut) {
      try {
        const [inH, inM] = r.checkIn.split(":").map(Number);
        const [outH, outM] = r.checkOut.split(":").map(Number);
        const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
        if (totalMinutes > 0) {
          workingHours = Number((totalMinutes / 60).toFixed(2));
        }
      } catch {}
    }

    if (r.checkIn && settings.openingTime) {
      try {
        const [inH, inM] = r.checkIn.split(":").map(Number);
        const [openH, openM] = settings.openingTime.split(":").map(Number);
        const diffMinutes = (inH * 60 + inM) - (openH * 60 + openM);
        if (diffMinutes > (settings.gracePeriodMinutes || 15)) {
          isLate = true;
          lateMinutes = diffMinutes;
        }
      } catch {}
    }

    return {
      ...r,
      salonId: targetSalon,
      workingHours: workingHours || (r.status === "PRESENT" ? 8 : r.status === "HALF_DAY" ? 4 : 0),
      isLate,
      lateMinutes,
      overtimeHours: Number(r.overtimeHours || 0),
      markedByName: actorInfo?.name || "Admin"
    };
  });

  if (supabaseConfigured) {
    try {
      const dbPayloads = processed.map(r => ({
        salon_id: targetSalon,
        employee_id: r.employeeId,
        attendance_date: r.attendanceDate,
        status: r.status,
        check_in: r.checkIn || null,
        check_out: r.checkOut || null,
        working_hours: r.workingHours,
        is_late: r.isLate,
        late_minutes: r.lateMinutes,
        overtime_hours: r.overtimeHours,
        notes: r.notes || null,
        marked_by: actorInfo?.id && isUuid(actorInfo.id) ? actorInfo.id : null,
        marked_by_name: actorInfo?.name || "Admin",
        updated_at: new Date().toISOString()
      }));

      await supabase
        .from("attendance")
        .upsert(dbPayloads, { onConflict: "employee_id,attendance_date" });
    } catch (err) {
      console.warn("saveAttendanceBatch warning:", err);
    }
  }

  // Update local cache
  const d = getLocalDemoData();
  if (!d.attendance) d.attendance = [];

  processed.forEach(p => {
    const idx = d.attendance.findIndex(
      a => String(a.employeeId) === String(p.employeeId) && a.attendanceDate === p.attendanceDate
    );
    const recId = p.id || `att_${p.employeeId}_${p.attendanceDate}`;
    const cleanRec = { ...p, id: recId };
    if (idx >= 0) {
      d.attendance[idx] = cleanRec;
    } else {
      d.attendance.push(cleanRec);
    }
  });

  saveLocalDemoData(d);

  logAuditEvent({
    action: "ATTENDANCE_RECORD",
    entityType: "attendance",
    entityId: processed[0]?.attendanceDate || "date",
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Marked attendance for ${processed.length} employees on date ${processed[0]?.attendanceDate}`
  }).catch(() => {});

  invalidateQueryCache("attendance");
  invalidateQueryCache("att_month");
  invalidateQueryCache("payroll");
  invalidateQueryCache("payroll_dash");
  return processed;
}

export async function fetchMonthlyAttendanceForEmployee(employeeId, monthYear, salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `att_month_${targetSalon}_${employeeId}_${monthYear}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    let remoteRecords = null;

    if (supabaseConfigured && isUuid(employeeId)) {
      try {
        const { data, error } = await supabase
          .from("attendance")
          .select("*")
          .eq("salon_id", targetSalon)
          .eq("employee_id", employeeId)
          .gte("attendance_date", `${monthYear}-01`)
          .lte("attendance_date", `${monthYear}-31`);

        if (!error && Array.isArray(data)) {
          remoteRecords = data.map(a => ({
            id: String(a.id),
            employeeId: String(a.employee_id),
            attendanceDate: a.attendance_date,
            status: a.status,
            workingHours: Number(a.working_hours || 0),
            overtimeHours: Number(a.overtime_hours || 0),
            isLate: Boolean(a.is_late),
            notes: a.notes || ""
          }));
        }
      } catch (err) {
        console.warn("fetchMonthlyAttendanceForEmployee warning:", err);
      }
    }

    const d = getLocalDemoData();
    const localList = (d.attendance || []).filter(
      a => String(a.employeeId) === String(employeeId) && (a.attendanceDate || "").startsWith(monthYear)
    );

    const attMap = new Map();
    localList.forEach(a => attMap.set(a.attendanceDate, a));
    if (Array.isArray(remoteRecords)) {
      remoteRecords.forEach(a => attMap.set(a.attendanceDate, a));
    }

    const result = Array.from(attMap.values());
    setCachedQuery(cacheKey, result);
    return result;
  });
}

// -------------------------------------------------------------
// 4. Payroll Calculation Engine
// -------------------------------------------------------------

export function calculateEmployeeMonthlySalary(employee, monthlyAttendance = [], monthYear, payrollSettings = {}, manualAdjustments = {}) {
  // 1. Determine days in month
  const [yearStr, monthStr] = (monthYear || new Date().toISOString().slice(0, 7)).split("-");
  const yr = Number(yearStr);
  const mo = Number(monthStr);
  const daysInMonth = new Date(yr, mo, 0).getDate(); // e.g. 30 in Nov, 31 in Dec

  // 2. Determine divisor based on payroll settings
  let calculationDays = 30;
  const mode = payrollSettings.salaryDivisorMode || "CALENDAR_DAYS";
  if (mode === "CALENDAR_DAYS") {
    calculationDays = daysInMonth;
  } else if (mode === "FIXED_30") {
    calculationDays = 30;
  } else if (mode === "FIXED_26") {
    calculationDays = 26;
  } else if (mode === "WORKING_DAYS") {
    calculationDays = Number(employee.monthlyWorkingDays || 30);
  }
  if (!calculationDays || calculationDays < 1) calculationDays = 30;

  // 3. Aggregate Attendance counts
  let presentDays = 0;
  let halfDays = 0;
  let rawPaidLeaves = 0;
  let rawUnpaidLeaves = 0;
  let absentDays = 0;
  let weeklyOffs = 0;
  let holidays = 0;
  let totalWorkingHours = 0;
  let totalOvertimeHours = 0;

  monthlyAttendance.forEach(a => {
    switch (a.status) {
      case "PRESENT":
        presentDays += 1;
        totalWorkingHours += Number(a.workingHours || 8);
        break;
      case "HALF_DAY":
        halfDays += 1;
        totalWorkingHours += Number(a.workingHours || 4);
        break;
      case "PAID_LEAVE":
        rawPaidLeaves += 1;
        break;
      case "UNPAID_LEAVE":
        rawUnpaidLeaves += 1;
        break;
      case "ABSENT":
        absentDays += 1;
        break;
      case "WEEKLY_OFF":
        weeklyOffs += 1;
        break;
      case "HOLIDAY":
        holidays += 1;
        break;
      default:
        break;
    }
    totalOvertimeHours += Number(a.overtimeHours || 0);
  });

  // Paid leaves allowance cap check
  const allowedPaidLeaves = Number(employee.paidLeavesPerMonth !== undefined ? employee.paidLeavesPerMonth : 1);
  const paidLeaves = Math.min(rawPaidLeaves, allowedPaidLeaves);
  const excessPaidLeaves = Math.max(0, rawPaidLeaves - allowedPaidLeaves);
  const unpaidLeaves = rawUnpaidLeaves + excessPaidLeaves;

  const baseSalary = Number(employee.baseSalary || 0);
  const salaryType = employee.salaryType || "MONTHLY";

  let dailyRate = 0;
  let hourlyRate = 0;
  let basePayable = 0;
  let absentDeduction = 0;
  let halfDayDeduction = 0;
  let unpaidLeaveDeduction = 0;
  let payableDays = 0;

  if (salaryType === "MONTHLY") {
    dailyRate = Number((baseSalary / calculationDays).toFixed(2));
    hourlyRate = Number((dailyRate / 8).toFixed(2));

    const halfDayFactor = Number(payrollSettings.halfDayDeductionFactor ?? 0.50);
    absentDeduction = Math.round(absentDays * dailyRate);
    halfDayDeduction = Math.round(halfDays * (dailyRate * halfDayFactor));
    unpaidLeaveDeduction = Math.round(unpaidLeaves * dailyRate);

    const totalAttendanceDeduction = absentDeduction + halfDayDeduction + unpaidLeaveDeduction;
    basePayable = Math.max(0, Math.round(baseSalary - totalAttendanceDeduction));

    payableDays = Math.max(0, calculationDays - absentDays - (halfDays * halfDayFactor) - unpaidLeaves);
  } else if (salaryType === "DAILY_WAGE") {
    dailyRate = baseSalary;
    hourlyRate = Number((dailyRate / 8).toFixed(2));

    const weeklyOffPaidCount = payrollSettings.weeklyOffPaid ? weeklyOffs : 0;
    const holidayPaidCount = payrollSettings.holidayPaid ? holidays : 0;

    payableDays = presentDays + (halfDays * 0.5) + paidLeaves + weeklyOffPaidCount + holidayPaidCount;
    basePayable = Math.round(payableDays * dailyRate);
    absentDeduction = 0;
    halfDayDeduction = 0;
    unpaidLeaveDeduction = 0;
  } else if (salaryType === "HOURLY") {
    hourlyRate = baseSalary;
    dailyRate = Number((hourlyRate * 8).toFixed(2));
    payableDays = Number((totalWorkingHours / 8).toFixed(1));
    basePayable = Math.round(totalWorkingHours * hourlyRate);
    absentDeduction = 0;
    halfDayDeduction = 0;
    unpaidLeaveDeduction = 0;
  }

  // Overtime Calculation
  const overtimeMultiplier = Number(payrollSettings.defaultOvertimeMultiplier ?? 1.5);
  const configuredOvertimeRate = Number(employee.overtimeRate || 0);
  const effectiveOvertimeRate = configuredOvertimeRate > 0 ? configuredOvertimeRate : Number((hourlyRate * overtimeMultiplier).toFixed(2));
  const overtimeAmount = payrollSettings.overtimeEnabled !== false
    ? Math.round(totalOvertimeHours * effectiveOvertimeRate)
    : 0;

  // Allowances & Adjustments
  const fixedAllowance = Math.round(Number(employee.fixedAllowance || 0));
  const bonus = Math.round(Number(manualAdjustments.bonus || 0));
  const bonusReason = manualAdjustments.bonusReason || "";

  const advanceDeduction = Math.round(Number(manualAdjustments.advanceDeduction || 0));
  const otherDeductions = Math.round(Number(manualAdjustments.otherDeductions || 0));
  const deductionReason = manualAdjustments.deductionReason || "";

  const grossSalary = Math.round(basePayable + overtimeAmount + fixedAllowance + bonus);
  const totalDeductions = Math.round(advanceDeduction + otherDeductions);
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeMobile: employee.mobile,
    jobRole: employee.jobRole,
    salaryType,
    baseSalary,
    monthYear,
    calculationDays,
    presentDays,
    halfDays,
    paidLeaves,
    unpaidLeaves,
    absentDays,
    weeklyOffs,
    holidays,
    payableDays,
    dailyRate,
    hourlyRate,
    totalWorkingHours,
    overtimeHours: totalOvertimeHours,
    effectiveOvertimeRate,
    overtimeAmount,
    fixedAllowance,
    bonus,
    bonusReason,
    absentDeduction,
    halfDayDeduction,
    unpaidLeaveDeduction,
    advanceDeduction,
    otherDeductions,
    deductionReason,
    grossSalary,
    totalDeductions,
    netSalary,
    amountPaid: 0,
    balancePending: netSalary,
    paymentStatus: "PENDING",
    calculationBreakdown: {
      formula: salaryType === "MONTHLY"
        ? `Base (₹${baseSalary}) - Absent (₹${absentDeduction}) - HalfDay (₹${halfDayDeduction}) - UnpaidLeave (₹${unpaidLeaveDeduction}) + OT (₹${overtimeAmount}) + Allowance (₹${fixedAllowance}) + Bonus (₹${bonus}) - Advances (₹${advanceDeduction}) - Deductions (₹${otherDeductions})`
        : `Payable Days (${payableDays}) × Rate (₹${dailyRate || hourlyRate}) + OT (₹${overtimeAmount}) + Bonus (₹${bonus}) - Deductions (₹${totalDeductions})`,
      divisor: calculationDays,
      daysInMonth
    }
  };
}

// -------------------------------------------------------------
// 5. Monthly Master Payroll Runs (Generate, Preview, Finalize & Reopen)
// -------------------------------------------------------------

export async function generateOrFetchMonthlyPayroll(monthYear, salonId = "default", actorInfo = null) {
  const targetSalon = salonId || "default";
  const cacheKey = `payroll_calc_${targetSalon}_${monthYear}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    // Check if finalized payroll exists in Supabase
    let existingPayroll = null;
    let existingItems = [];

  if (supabaseConfigured) {
    try {
      const { data: pData } = await supabase
        .from("payrolls")
        .select("*")
        .eq("salon_id", targetSalon)
        .eq("month_year", monthYear)
        .maybeSingle();

      if (pData) {
        existingPayroll = pData;
        const { data: iData } = await supabase
          .from("payroll_items")
          .select("*")
          .eq("payroll_id", pData.id)
          .order("employee_name", { ascending: true });

        if (Array.isArray(iData)) {
          existingItems = iData.map(i => ({
            id: String(i.id),
            payrollId: String(i.payroll_id),
            employeeId: String(i.employee_id),
            employeeName: i.employee_name,
            employeeMobile: i.employee_mobile,
            jobRole: i.job_role,
            monthYear: i.month_year,
            salaryType: i.salary_type,
            baseSalary: Number(i.base_salary || 0),
            calculationDays: Number(i.calculation_days || 30),
            presentDays: Number(i.present_days || 0),
            absentDays: Number(i.absent_days || 0),
            halfDays: Number(i.half_days || 0),
            paidLeaves: Number(i.paid_leaves || 0),
            unpaidLeaves: Number(i.unpaid_leaves || 0),
            weeklyOffs: Number(i.weekly_offs || 0),
            holidays: Number(i.holidays || 0),
            payableDays: Number(i.payable_days || 0),
            dailyRate: Number(i.daily_rate || 0),
            hourlyRate: Number(i.hourly_rate || 0),
            overtimeHours: Number(i.overtime_hours || 0),
            overtimeAmount: Number(i.overtime_amount || 0),
            fixedAllowance: Number(i.fixed_allowance || 0),
            bonus: Number(i.bonus || 0),
            bonusReason: i.bonus_reason || "",
            absentDeduction: Number(i.absent_deduction || 0),
            halfDayDeduction: Number(i.half_day_deduction || 0),
            advanceDeduction: Number(i.advance_deduction || 0),
            otherDeductions: Number(i.other_deductions || 0),
            deductionReason: i.deduction_reason || "",
            grossSalary: Number(i.gross_salary || 0),
            totalDeductions: Number(i.total_deductions || 0),
            netSalary: Number(i.net_salary || 0),
            amountPaid: Number(i.amount_paid || 0),
            balancePending: Number(i.balance_pending || 0),
            paymentStatus: i.payment_status || "PENDING",
            calculationBreakdown: i.calculation_breakdown || {}
          }));
        }
      }
    } catch (err) {
      console.warn("generateOrFetchMonthlyPayroll warning:", err);
    }
  }

  // Fetch month salary payment records for this salon and month
  const monthPayments = await fetchSalaryPaymentsForMonth(monthYear, targetSalon);

  // If already finalized, return saved snapshot augmented with real-time disbursement totals
  if (existingPayroll && existingPayroll.status === "FINALIZED") {
    const updatedItems = existingItems.map(item => {
      const empPmts = monthPayments.filter(p => String(p.employeeId) === String(item.employeeId));
      const recordedPaid = empPmts.reduce((s, p) => s + Number(p.amount || 0), 0);
      const effPaid = Math.max(Number(item.amountPaid || 0), recordedPaid);
      const bal = Math.max(0, Number(item.netSalary || 0) - effPaid);
      return {
        ...item,
        amountPaid: effPaid,
        balancePending: bal,
        paymentStatus: bal === 0 && effPaid > 0 ? "PAID" : effPaid > 0 ? "PARTIAL" : "PENDING"
      };
    });

    const totExp = updatedItems.reduce((s, i) => s + Number(i.netSalary || 0), 0);
    const totPaid = updatedItems.reduce((s, i) => s + Number(i.amountPaid || 0), 0);
    const totPending = Math.max(0, totExp - totPaid);

    const resFinal = {
      payroll: {
        id: String(existingPayroll.id),
        salonId: existingPayroll.salon_id,
        monthYear: existingPayroll.month_year,
        status: existingPayroll.status,
        totalSalaryExpense: totExp || Number(existingPayroll.total_salary_expense || 0),
        totalPaid: totPaid,
        totalPending: totPending,
        employeeCount: Number(existingPayroll.employee_count || updatedItems.length),
        finalizedAt: existingPayroll.finalized_at,
        finalizedByName: existingPayroll.finalized_by_name
      },
      items: updatedItems,
      isFinalized: true
    };
    setCachedQuery(cacheKey, resFinal);
    return resFinal;
  }

  // Otherwise, compute real-time calculation preview
  const [employees, payrollSettings] = await Promise.all([
    fetchEmployees(targetSalon),
    fetchSalonPayrollSettings(targetSalon)
  ]);

  const activeEmployees = employees.filter(e => e.status === "ACTIVE");
  const d = getLocalDemoData();
  const draftAdjMap = d.payrollDraftAdjustments || {};

  // Fetch month attendance for all employees
  const previewItems = await Promise.all(
    activeEmployees.map(async emp => {
      const att = await fetchMonthlyAttendanceForEmployee(emp.id, monthYear, targetSalon);
      // Check existing manual adjustments if item was previously saved or adjusted in preview
      const prev = existingItems.find(i => String(i.employeeId) === String(emp.id));
      const draftAdj = draftAdjMap[String(emp.id)] || draftAdjMap[`pi_${emp.id}_${monthYear}`] || {};
      const adjustments = {
        bonus: prev?.bonus !== undefined ? prev.bonus : (draftAdj.bonus || 0),
        bonusReason: prev?.bonusReason || draftAdj.bonusReason || "",
        advanceDeduction: prev?.advanceDeduction !== undefined ? prev.advanceDeduction : (draftAdj.advanceDeduction || 0),
        otherDeductions: prev?.otherDeductions !== undefined ? prev.otherDeductions : (draftAdj.otherDeductions || 0),
        deductionReason: prev?.deductionReason || draftAdj.deductionReason || ""
      };

      const computed = calculateEmployeeMonthlySalary(emp, att, monthYear, payrollSettings, adjustments);
      computed.id = prev?.id || `pi_${emp.id}_${monthYear}`;

      // Aggregate all recorded salary disbursements for this employee and period
      const empPmts = monthPayments.filter(p => String(p.employeeId) === String(emp.id));
      const recordedPaid = empPmts.reduce((s, p) => s + Number(p.amount || 0), 0);
      const effectivePaid = Math.max(Number(prev?.amountPaid || 0), recordedPaid);

      computed.amountPaid = effectivePaid;
      computed.balancePending = Math.max(0, computed.netSalary - effectivePaid);
      computed.paymentStatus = (computed.balancePending === 0 && effectivePaid > 0)
        ? "PAID"
        : (effectivePaid > 0 ? "PARTIAL" : "PENDING");

      return computed;
    })
  );

  const totalSalaryExpense = previewItems.reduce((sum, i) => sum + i.netSalary, 0);
  const totalPaid = previewItems.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
  const totalPending = Math.max(0, totalSalaryExpense - totalPaid);

  const previewPayroll = {
    id: existingPayroll?.id ? String(existingPayroll.id) : `pay_${targetSalon}_${monthYear}`,
    salonId: targetSalon,
    monthYear,
    status: existingPayroll?.status || "DRAFT",
    totalSalaryExpense,
    totalPaid,
    totalPending,
    employeeCount: previewItems.length,
    finalizedAt: null,
    finalizedByName: null
  };

    const resDraft = {
      payroll: previewPayroll,
      items: previewItems,
      isFinalized: false
    };
    setCachedQuery(cacheKey, resDraft);
    return resDraft;
  });
}

export async function updatePayrollItemAdjustments(payrollItemId, adjustments, actorInfo = null, salonId = "default") {
  const targetSalon = salonId || "default";

  if (supabaseConfigured && isUuid(payrollItemId)) {
    try {
      await supabase
        .from("payroll_items")
        .update({
          bonus: Number(adjustments.bonus || 0),
          bonus_reason: adjustments.bonusReason || null,
          advance_deduction: Number(adjustments.advanceDeduction || 0),
          other_deductions: Number(adjustments.otherDeductions || 0),
          deduction_reason: adjustments.deductionReason || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", payrollItemId);
    } catch (err) {
      console.warn("updatePayrollItemAdjustments warning:", err);
    }
  }

  // Persist adjustments in local draft cache so preview calculations reflect immediately
  const d = getLocalDemoData();
  if (!d.payrollDraftAdjustments) d.payrollDraftAdjustments = {};
  d.payrollDraftAdjustments[String(payrollItemId)] = {
    bonus: Number(adjustments.bonus || 0),
    bonusReason: adjustments.bonusReason || "",
    advanceDeduction: Number(adjustments.advanceDeduction || 0),
    otherDeductions: Number(adjustments.otherDeductions || 0),
    deductionReason: adjustments.deductionReason || ""
  };
  saveLocalDemoData(d);

  logAuditEvent({
    action: "PAYROLL_ADJUSTMENT",
    entityType: "payroll_item",
    entityId: String(payrollItemId),
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Updated salary adjustments (Bonus: ₹${adjustments.bonus || 0}, Deductions: ₹${(Number(adjustments.advanceDeduction || 0) + Number(adjustments.otherDeductions || 0))}) for item #${payrollItemId}`
  }).catch(() => {});

  invalidateQueryCache("payroll");
  invalidateQueryCache("payroll_dash");
  return true;
}

export async function finalizeMonthlyPayroll(monthYear, payrollItems, actorInfo = null, salonId = "default") {
  const targetSalon = salonId || "default";
  const totalSalaryExpense = payrollItems.reduce((sum, i) => sum + Number(i.netSalary || 0), 0);
  const totalPaid = payrollItems.reduce((sum, i) => sum + Number(i.amountPaid || 0), 0);
  const totalPending = Math.max(0, totalSalaryExpense - totalPaid);

  let finalizedPayrollId = null;

  if (supabaseConfigured) {
    try {
      // 1. Upsert master payroll run
      const { data: pData, error: pErr } = await supabase
        .from("payrolls")
        .upsert({
          salon_id: targetSalon,
          month_year: monthYear,
          status: "FINALIZED",
          total_salary_expense: totalSalaryExpense,
          total_paid: totalPaid,
          total_pending: totalPending,
          employee_count: payrollItems.length,
          finalized_at: new Date().toISOString(),
          finalized_by: actorInfo?.id && isUuid(actorInfo.id) ? actorInfo.id : null,
          finalized_by_name: actorInfo?.name || "Admin",
          updated_at: new Date().toISOString()
        }, { onConflict: "salon_id,month_year" })
        .select()
        .maybeSingle();

      if (!pErr && pData) {
        finalizedPayrollId = pData.id;

        // 2. Upsert each snapshot item
        const dbItems = payrollItems.map(item => ({
          payroll_id: pData.id,
          salon_id: targetSalon,
          employee_id: item.employeeId,
          employee_name: item.employeeName,
          employee_mobile: item.employeeMobile,
          job_role: item.jobRole,
          month_year: monthYear,
          salary_type: item.salaryType,
          base_salary: item.baseSalary,
          calculation_days: item.calculationDays,
          present_days: item.presentDays,
          absent_days: item.absentDays,
          half_days: item.halfDays,
          paid_leaves: item.paidLeaves,
          unpaid_leaves: item.unpaidLeaves,
          weekly_offs: item.weeklyOffs,
          holidays: item.holidays,
          payable_days: item.payableDays,
          daily_rate: item.dailyRate,
          hourly_rate: item.hourlyRate,
          overtime_hours: item.overtimeHours,
          overtime_amount: item.overtimeAmount,
          fixed_allowance: item.fixedAllowance,
          bonus: item.bonus,
          bonus_reason: item.bonusReason,
          absent_deduction: item.absentDeduction,
          half_day_deduction: item.halfDayDeduction,
          advance_deduction: item.advanceDeduction,
          other_deductions: item.otherDeductions,
          deduction_reason: item.deductionReason,
          gross_salary: item.grossSalary,
          total_deductions: item.totalDeductions,
          net_salary: item.netSalary,
          amount_paid: item.amountPaid,
          balance_pending: item.balancePending,
          payment_status: item.paymentStatus,
          calculation_breakdown: item.calculationBreakdown,
          updated_at: new Date().toISOString()
        }));

        await supabase
          .from("payroll_items")
          .upsert(dbItems, { onConflict: "employee_id,month_year" });
      }
    } catch (err) {
      console.warn("finalizeMonthlyPayroll Supabase warning:", err);
    }
  }

  // Update local demo cache
  const d = getLocalDemoData();
  if (!d.payrolls) d.payrolls = [];
  if (!d.payrollItems) d.payrollItems = [];

  const localPayroll = {
    id: finalizedPayrollId || `pay_${targetSalon}_${monthYear}`,
    salonId: targetSalon,
    monthYear,
    status: "FINALIZED",
    totalSalaryExpense,
    totalPaid,
    totalPending,
    employeeCount: payrollItems.length,
    finalizedAt: new Date().toISOString(),
    finalizedByName: actorInfo?.name || "Admin"
  };

  const pIdx = d.payrolls.findIndex(p => p.salonId === targetSalon && p.monthYear === monthYear);
  if (pIdx >= 0) d.payrolls[pIdx] = localPayroll;
  else d.payrolls.push(localPayroll);

  payrollItems.forEach(i => {
    const itemIdx = d.payrollItems.findIndex(x => x.employeeId === i.employeeId && x.monthYear === monthYear);
    if (itemIdx >= 0) d.payrollItems[itemIdx] = { ...i, payrollId: localPayroll.id };
    else d.payrollItems.push({ ...i, payrollId: localPayroll.id });
  });

  saveLocalDemoData(d);

  logAuditEvent({
    action: "PAYROLL_FINALIZED",
    entityType: "payroll",
    entityId: `${targetSalon}_${monthYear}`,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Finalized and locked monthly payroll for ${monthYear} (Total Expense: ₹${totalSalaryExpense.toLocaleString("en-IN")}, Employees: ${payrollItems.length})`
  }).catch(() => {});

  invalidateQueryCache("payroll");
  invalidateQueryCache("payroll_dash");
  return localPayroll;
}

export async function reopenMonthlyPayroll(monthYear, reason, actorInfo = null, salonId = "default") {
  const targetSalon = salonId || "default";

  if (supabaseConfigured) {
    try {
      await supabase
        .from("payrolls")
        .update({
          status: "DRAFT",
          reopened_at: new Date().toISOString(),
          reopened_by: actorInfo?.id && isUuid(actorInfo.id) ? actorInfo.id : null,
          reopen_reason: reason || "Manual correction",
          updated_at: new Date().toISOString()
        })
        .eq("salon_id", targetSalon)
        .eq("month_year", monthYear);
    } catch (err) {
      console.warn("reopenMonthlyPayroll Supabase warning:", err);
    }
  }

  const d = getLocalDemoData();
  if (d.payrolls) {
    const pIdx = d.payrolls.findIndex(p => p.salonId === targetSalon && p.monthYear === monthYear);
    if (pIdx >= 0) {
      d.payrolls[pIdx].status = "DRAFT";
      d.payrolls[pIdx].reopenReason = reason;
      saveLocalDemoData(d);
    }
  }

  logAuditEvent({
    action: "PAYROLL_REOPENED",
    entityType: "payroll",
    entityId: `${targetSalon}_${monthYear}`,
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Reopened finalized payroll for ${monthYear}. Reason: "${reason || 'Attendance or salary adjustment required'}"`
  }).catch(() => {});

  invalidateQueryCache("payroll");
  invalidateQueryCache("payroll_dash");
  return true;
}

// -------------------------------------------------------------
// 6. Salary Payment Disbursement Records
// -------------------------------------------------------------

export async function fetchSalaryPaymentsForMonth(monthYear, salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `sal_payments_${targetSalon}_${monthYear}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    let remotePayments = [];

    if (supabaseConfigured) {
      try {
        let query = supabase.from("salary_payments").select("*");
        if (targetSalon !== "all") {
          query = query.eq("salon_id", targetSalon);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          remotePayments = data
            .filter(p => {
              const matchesMonth = p.month_year === monthYear || (p.payment_date && p.payment_date.startsWith(monthYear));
              return matchesMonth;
            })
            .map(p => ({
              id: String(p.id),
              salonId: p.salon_id,
              payrollItemId: p.payroll_item_id ? String(p.payroll_item_id) : null,
              employeeId: String(p.employee_id),
              amount: Number(p.amount || 0),
              paymentMode: p.payment_mode,
              paymentDate: p.payment_date,
              monthYear: p.month_year || (p.payment_date ? p.payment_date.slice(0, 7) : monthYear),
              transactionRef: p.transaction_ref || "",
              notes: p.notes || "",
              paidByName: p.paid_by_name || "Admin",
              createdAt: p.created_at
            }));
        }
      } catch (err) {
        console.warn("fetchSalaryPaymentsForMonth warning:", err);
      }
    }

    const d = getLocalDemoData();
    const localList = (d.salaryPayments || [])
      .filter(p => {
        const matchSalon = targetSalon === "all" || p.salonId === targetSalon || !p.salonId;
        const matchMonth = p.monthYear === monthYear || (p.paymentDate && p.paymentDate.startsWith(monthYear));
        return matchSalon && matchMonth;
      })
      .map(p => ({
        id: String(p.id),
        salonId: p.salonId || targetSalon,
        payrollItemId: p.payrollItemId ? String(p.payrollItemId) : null,
        employeeId: String(p.employeeId),
        amount: Number(p.amount || 0),
        paymentMode: p.paymentMode || "Cash",
        paymentDate: p.paymentDate,
        monthYear: p.monthYear || (p.paymentDate ? p.paymentDate.slice(0, 7) : monthYear),
        transactionRef: p.transactionRef || "",
        notes: p.notes || "",
        paidByName: p.paidByName || "Admin",
        createdAt: p.createdAt
      }));

    const map = new Map();
    localList.forEach(p => map.set(p.id, p));
    remotePayments.forEach(p => map.set(p.id, p));
    const result = Array.from(map.values());
    setCachedQuery(cacheKey, result);
    return result;
  });
}

export async function recordSalaryPayment(paymentData, actorInfo = null, salonId = "default") {
  const targetSalon = salonId || "default";
  const amount = Math.round(Number(paymentData.amount || 0));
  const mode = paymentData.paymentMode || "Cash";
  const paymentDate = paymentData.paymentDate || new Date().toISOString().slice(0, 10);
  const transactionRef = paymentData.transactionRef || "";
  const notes = paymentData.notes || "";
  const payrollItemId = paymentData.payrollItemId;
  const employeeId = paymentData.employeeId;
  const monthYear = paymentData.monthYear || (paymentDate ? paymentDate.slice(0, 7) : new Date().toISOString().slice(0, 7));

  if (amount <= 0) throw new Error("Payment amount must be greater than zero.");

  let savedPayment = null;

  if (supabaseConfigured) {
    try {
      if (employeeId && isUuid(employeeId)) {
        const payload = {
          salon_id: targetSalon,
          employee_id: employeeId,
          amount,
          payment_mode: mode,
          payment_date: paymentDate,
          month_year: monthYear,
          transaction_ref: transactionRef || null,
          notes: notes || null,
          paid_by: actorInfo?.id && isUuid(actorInfo.id) ? actorInfo.id : null,
          paid_by_name: actorInfo?.name || "Admin"
        };

        if (payrollItemId && isUuid(payrollItemId)) {
          payload.payroll_item_id = payrollItemId;
        }

        const { data: pData, error: pErr } = await supabase
          .from("salary_payments")
          .insert(payload)
          .select()
          .maybeSingle();

        if (!pErr && pData) {
          savedPayment = pData;
        } else if (pErr) {
          console.warn("recordSalaryPayment primary insert warning:", pErr.message);
          const fallbackPayload = { ...payload };
          delete fallbackPayload.month_year;
          const { data: retryData, error: retryErr } = await supabase
            .from("salary_payments")
            .insert(fallbackPayload)
            .select()
            .maybeSingle();
          if (!retryErr && retryData) savedPayment = retryData;
        }
      }

      // Update payroll item if payrollItemId is a real DB UUID
      if (payrollItemId && isUuid(payrollItemId)) {
        const { data: curItem } = await supabase
          .from("payroll_items")
          .select("net_salary, amount_paid, payroll_id")
          .eq("id", payrollItemId)
          .maybeSingle();

        if (curItem) {
          const newPaid = Number(curItem.amount_paid || 0) + amount;
          const newBal = Math.max(0, Number(curItem.net_salary || 0) - newPaid);
          const newStatus = newBal === 0 ? "PAID" : "PARTIAL";

          await supabase
            .from("payroll_items")
            .update({
              amount_paid: newPaid,
              balance_pending: newBal,
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", payrollItemId);

          if (curItem.payroll_id) {
            const { data: allItems } = await supabase
              .from("payroll_items")
              .select("amount_paid, balance_pending")
              .eq("payroll_id", curItem.payroll_id);

            if (Array.isArray(allItems)) {
              const totPaid = allItems.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
              const totPending = allItems.reduce((s, i) => s + Number(i.balance_pending || 0), 0);

              await supabase
                .from("payrolls")
                .update({
                  total_paid: totPaid,
                  total_pending: totPending,
                  updated_at: new Date().toISOString()
                })
                .eq("id", curItem.payroll_id);
            }
          }
        }
      }
    } catch (err) {
      console.warn("recordSalaryPayment Supabase warning:", err);
    }
  }

  // Update local demo cache
  const d = getLocalDemoData();
  if (!d.salaryPayments) d.salaryPayments = [];
  const localPayment = {
    id: savedPayment?.id || `sp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    salonId: targetSalon,
    payrollItemId,
    employeeId,
    monthYear,
    amount,
    paymentMode: mode,
    paymentDate,
    transactionRef,
    notes,
    paidByName: actorInfo?.name || "Admin",
    createdAt: new Date().toISOString()
  };
  d.salaryPayments.push(localPayment);

  // Update payroll items in cache if exists
  if (d.payrollItems) {
    const item = d.payrollItems.find(i => String(i.id) === String(payrollItemId) || (String(i.employeeId) === String(employeeId) && i.monthYear === monthYear));
    if (item) {
      item.amountPaid = Number(item.amountPaid || 0) + amount;
      item.balancePending = Math.max(0, Number(item.netSalary || 0) - item.amountPaid);
      item.paymentStatus = item.balancePending === 0 ? "PAID" : "PARTIAL";
    }
  }

  saveLocalDemoData(d);

  logAuditEvent({
    action: "SALARY_PAYMENT",
    entityType: "salary_payment",
    entityId: String(payrollItemId || employeeId),
    userId: actorInfo?.id,
    userName: actorInfo?.name,
    userRole: actorInfo?.role,
    salonId: targetSalon,
    details: `Disbursed salary of ₹${amount.toLocaleString("en-IN")} via ${mode} to employee #${employeeId} for period ${monthYear}`
  }).catch(() => {});

  invalidateQueryCache("payroll");
  invalidateQueryCache("payroll_dash");
  invalidateQueryCache("sal_payments");
  return localPayment;
}

export async function fetchSalaryPaymentHistory(payrollItemIdOrId, salonId = "default", employeeId = null, monthYear = null) {
  const targetSalon = salonId || "default";
  let remotePayments = [];

  if (supabaseConfigured) {
    try {
      let query = supabase.from("salary_payments").select("*");
      if (targetSalon !== "all") {
        query = query.eq("salon_id", targetSalon);
      }
      if (employeeId && isUuid(employeeId)) {
        query = query.eq("employee_id", employeeId);
      } else if (payrollItemIdOrId && isUuid(payrollItemIdOrId)) {
        query = query.eq("payroll_item_id", payrollItemIdOrId);
      }
      const { data, error } = await query.order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        remotePayments = data.map(p => ({
          id: String(p.id),
          salonId: p.salon_id,
          payrollItemId: p.payroll_item_id ? String(p.payroll_item_id) : null,
          employeeId: String(p.employee_id),
          amount: Number(p.amount || 0),
          paymentMode: p.payment_mode,
          paymentDate: p.payment_date,
          monthYear: p.month_year || (p.payment_date ? p.payment_date.slice(0, 7) : ""),
          transactionRef: p.transaction_ref || "",
          notes: p.notes || "",
          paidByName: p.paid_by_name || "Admin",
          createdAt: p.created_at
        }));
      }
    } catch (err) {
      console.warn("fetchSalaryPaymentHistory warning:", err);
    }
  }

  const d = getLocalDemoData();
  const localList = (d.salaryPayments || [])
    .filter(p => {
      const matchEmp = employeeId ? String(p.employeeId) === String(employeeId) : false;
      const matchItem = payrollItemIdOrId ? String(p.payrollItemId) === String(payrollItemIdOrId) : false;
      return matchEmp || matchItem;
    })
    .map(p => ({
      id: String(p.id),
      salonId: p.salonId || targetSalon,
      payrollItemId: p.payrollItemId ? String(p.payrollItemId) : null,
      employeeId: String(p.employeeId),
      amount: Number(p.amount || 0),
      paymentMode: p.paymentMode || "Cash",
      paymentDate: p.paymentDate,
      monthYear: p.monthYear || (p.paymentDate ? p.paymentDate.slice(0, 7) : ""),
      transactionRef: p.transactionRef || "",
      notes: p.notes || "",
      paidByName: p.paidByName || "Admin",
      createdAt: p.createdAt
    }));

  const map = new Map();
  localList.forEach(p => map.set(p.id, p));
  remotePayments.forEach(p => map.set(p.id, p));

  let results = Array.from(map.values());
  if (monthYear) {
    results = results.filter(p => p.monthYear === monthYear || (p.paymentDate && p.paymentDate.startsWith(monthYear)));
  }
  return results.sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));
}

// -------------------------------------------------------------
// 7. Dashboard HR & Payroll Metrics
// -------------------------------------------------------------

export async function fetchPayrollDashboardMetrics(monthYear, salonId = "default") {
  const targetSalon = salonId || "default";
  const cacheKey = `payroll_dash_${targetSalon}_${monthYear}`;
  const cached = getCachedQuery(cacheKey);
  if (cached) return cached;

  return deduplicateRequest(cacheKey, async () => {
    const todayISO = new Date().toISOString().slice(0, 10);

    const [employees, todayAttendance, payrollData] = await Promise.all([
      fetchEmployees(targetSalon),
      fetchAttendanceForDate(todayISO, targetSalon),
      generateOrFetchMonthlyPayroll(monthYear, targetSalon)
    ]);

    const activeEmployees = employees.filter(e => e.status === "ACTIVE");
    const presentToday = todayAttendance.filter(a => a.status === "PRESENT" || a.status === "HALF_DAY").length;
    const absentToday = todayAttendance.filter(a => a.status === "ABSENT").length;

    const totalExpense = payrollData.items.reduce((s, i) => s + Number(i.netSalary || 0), 0);
    const paidSalary = payrollData.items.reduce((s, i) => s + Number(i.amountPaid || 0), 0);
    const pendingSalary = Math.max(0, totalExpense - paidSalary);

    const result = {
      totalEmployees: activeEmployees.length,
      presentToday,
      absentToday,
      monthlySalaryExpense: totalExpense,
      paidSalary,
      pendingSalary,
      monthYear
    };
    setCachedQuery(cacheKey, result);
    return result;
  });
}
