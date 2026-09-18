import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://vcoeyueuwugfguivfuft.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_yvHCYU_1Sml8Nj6LEZf13g_5Y6-wIq2";

const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : (typeof process !== "undefined" && process.env ? process.env : {});
const rawUrl = metaEnv.VITE_SUPABASE_URL || metaEnv.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const rawAnonKey = metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY || metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.SUPABASE_PUBLISHABLE_KEY || metaEnv.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

export const supabaseUrl = typeof rawUrl === "string" ? rawUrl.trim().replace(/^["']|["']$/g, "") : DEFAULT_SUPABASE_URL;
export const supabaseAnonKey = typeof rawAnonKey === "string" ? rawAnonKey.trim().replace(/^["']|["']$/g, "") : DEFAULT_SUPABASE_KEY;

export const supabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  (supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://"))
);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

/**
 * Creates a standalone isolated Supabase client without session persistence.
 * Used when an Admin creates a Staff account so the Admin session is not overwritten.
 */
export function createIsolatedClient() {
  if (!supabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * Returns today's date in YYYY-MM-DD format using India/Mumbai timezone (Asia/Kolkata).
 * Prevents UTC midnight drift issues.
 */
export function getMumbaiTodayISO() {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

/**
 * Formats an ISO or timestamp date string into YYYY-MM-DD in Asia/Kolkata.
 */
export function formatToLocalISODate(dateVal) {
  if (!dateVal) return getMumbaiTodayISO();
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal).slice(0, 10);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  } catch {
    return String(dateVal).slice(0, 10);
  }
}

/**
 * Returns the dynamic base application URL (Origin).
 * In live production environments, dynamically captures the live domain/origin (e.g. https://nice-looking-portal.netlify.app or custom domain).
 * In local development, dynamically captures current localhost and port (e.g. http://localhost:5173).
 */
export function getAppBaseUrl() {
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== "null" && !origin.startsWith("file://")) {
      return origin.replace(/\/+$/, "");
    }
    const protocol = window.location.protocol || "http:";
    const host = window.location.host || (window.location.hostname ? `${window.location.hostname}${window.location.port ? `:${window.location.port}` : ""}` : "localhost:5173");
    return `${protocol}//${host}`.replace(/\/+$/, "");
  }
  const fallback = typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_URL ? import.meta.env.VITE_APP_URL : "http://localhost:5173";
  return fallback.replace(/\/+$/, "");
}