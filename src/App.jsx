import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  BadgeIndianRupee,
  BarChart3,
  Bell,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Grid,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Pencil,
  Percent,
  Phone,
  Plus,
  PlusCircle,
  ReceiptIndianRupee,
  RefreshCw,
  Search,
  Scissors,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  X,
  History,
  UserCheck,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Ban,
  Lock,
  RotateCcw,
  Printer,
  KeyRound,
  Mail,
  ArrowLeft
} from "lucide-react";
import { supabaseConfigured, getMumbaiTodayISO, formatToLocalISODate, getAppBaseUrl } from "./lib/supabase";
import {
  getSession,
  onAuthStateChange,
  loginUser,
  registerUser,
  verifySignUpOtp,
  resendSignUpOtp,
  verifyPasswordResetOtp,
  resetPasswordForEmail,
  updatePassword,
  logoutUser,
  fetchUserProfile,
  fetchAuditLogs,
  logAuditEvent,
  findCustomerByMobile,
  fetchCustomers,
  saveCustomer,
  deleteCustomer,
  fetchProducts,
  saveProduct,
  deleteProduct,
  fetchInvoices,
  createInvoice,
  updateInvoice,
  voidInvoice,
  deleteInvoice,
  fetchSettings,
  saveSettings,
  getBusinessSettings,
  saveBusinessSettings
} from "./lib/dataService";
import { invoiceMessage, offerMessage, openWhatsApp, normalizeWhatsAppNumber } from "./lib/whatsapp";
import AuditLogs from "./components/AuditLogs";
import StaffManagement from "./components/StaffManagement";
import AccessRestricted from "./components/AccessRestricted";

const services = [
  "Hair Wig",
  "Wig Service",
  "Hair Color",
  "Double Tap",
  "Hair Serum",
  "Other"
];

const onlinePaymentMethods = ["UPI", "Card", "Netbanking"];

function PaymentModeBadge({ mode }) {
  const m = String(mode || "Cash");
  if (m === "Cash") return <span className="pill success">💵 Cash</span>;
  if (m === "UPI") return <span className="pill">📱 UPI</span>;
  if (m === "Card") return <span className="pill" style={{ background: "#f3e8ff", color: "#7e22ce" }}>💳 Card</span>;
  if (m === "Netbanking") return <span className="pill" style={{ background: "#ecfeff", color: "#0e7490" }}>🏦 Netbanking</span>;
  return <span className="pill warning">🌐 {m}</span>;
}

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function compactMoney(v) {
  const n = Number(v || 0);
  if (n === 0) return "₹0";
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function csvDownload(rows, filename) {
  if (!rows || !rows.length) return;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    keys.map(esc).join(","),
    ...rows.map(r => keys.map(k => esc(r[k])).join(","))
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// =====================================================================
// Root Application
// =====================================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState({ text: "", type: "info" });

  const loadProfile = useCallback(async (userId, userEmail = null) => {
    if (!userId) {
      setUserProfile(null);
      return;
    }
    try {
      const prof = await fetchUserProfile(userId, userEmail);
      setUserProfile(prof);
    } catch (err) {
      console.warn("Error loading user profile:", err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Purge any legacy demo auth keys from previous browser sessions
    try {
      localStorage.removeItem("nice-looking-demo-auth");
    } catch {}

    // Check if recovery link was opened in URL
    const isRecovery =
      window.location.pathname.includes("reset-password") ||
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery");

    if (isRecovery) {
      setAuthMode("reset");
    }

    getSession()
      .then(sess => {
        if (mounted) {
          if (sess && sess.user) {
            setSession(sess);
            loadProfile(sess.user.id, sess.user.email);
            // Clean up hash fragments if any
            if (window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("error"))) {
              if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname || "/");
              }
            }
          } else {
            setSession(null);
            setUserProfile(null);
          }
          setAuthChecking(false);
        }
      })
      .catch(err => {
        console.error("Auth session check error:", err);
        if (mounted) {
          setSession(null);
          setUserProfile(null);
          setAuthChecking(false);
        }
      });

    const unsubscribe = onAuthStateChange((sess, event) => {
      if (mounted) {
        if (event === "PASSWORD_RECOVERY") {
          setAuthMode("reset");
          setAuthMessage({
            text: "Please set a new password for your account.",
            type: "info"
          });
        }
        if (sess && sess.user) {
          setSession(sess);
          loadProfile(sess.user.id, sess.user.email);
          if (window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("error"))) {
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname || "/");
            }
          }
        } else {
          setSession(null);
          setUserProfile(null);
        }
        setAuthChecking(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadProfile]);

  async function handleAuthSubmit(email, password, name) {
    setAuthLoading(true);
    setAuthMessage({ text: "", type: "info" });

    try {
      if (authMode === "login") {
        const sess = await loginUser(email, password);
        setSession(sess);
        if (sess?.user?.id) loadProfile(sess.user.id, sess.user.email);
      } else {
        setPendingEmail(email);
        setPendingPassword(password);
        const regResult = await registerUser(email, password, name);
        if (regResult?.session) {
          setSession(regResult.session);
          if (regResult.session.user?.id) loadProfile(regResult.session.user.id, regResult.session.user.email);
          setAuthMessage({
            text: "Account created and logged in successfully!",
            type: "success"
          });
        } else {
          // Move smoothly to OTP verification mode
          setPendingEmail(email);
          setPendingPassword(password);
          setAuthMode("verify-otp");
          setAuthMessage({
            text: `Verification code sent to ${email}. Enter the 6-digit OTP below to access your dashboard.`,
            type: "info"
          });
        }
      }
    } catch (err) {
      console.error("Auth submit error:", err);
      setAuthMessage({
        text: err.message || "Authentication failed. Please try again.",
        type: "error"
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOtp(email, otpToken) {
    setAuthLoading(true);
    setAuthMessage({ text: "", type: "info" });

    try {
      const sess = await verifySignUpOtp(email, otpToken, pendingPassword);
      if (sess && (sess.access_token || sess.user)) {
        setSession(sess);
        if (sess.user?.id) {
          loadProfile(sess.user.id, sess.user.email || email);
        }
        setAuthMode("login");
        setPendingPassword("");
        setAuthMessage({
          text: "OTP verified successfully! Welcome to NICE LOOKING Portal.",
          type: "success"
        });
      } else {
        const currentSess = await getSession();
        if (currentSess && currentSess.user) {
          setSession(currentSess);
          loadProfile(currentSess.user.id, currentSess.user.email || email);
          setAuthMode("login");
          setPendingPassword("");
        } else if (pendingPassword) {
          const loginSess = await loginUser(email, pendingPassword);
          if (loginSess) {
            setSession(loginSess);
            if (loginSess.user?.id) loadProfile(loginSess.user.id, loginSess.user.email || email);
            setAuthMode("login");
            setPendingPassword("");
          }
        }
      }
    } catch (err) {
      console.error("Verify OTP error:", err);
      setAuthMessage({
        text: err.message || "Invalid or expired OTP code. Please check and try again.",
        type: "error"
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResendOtp(email) {
    setAuthLoading(true);
    setAuthMessage({ text: "", type: "info" });
    try {
      await resendSignUpOtp(email);
      setAuthMessage({
        text: `New 6-digit verification code sent to ${email}.`,
        type: "success"
      });
    } catch (err) {
      console.error("Resend OTP error:", err);
      setAuthMessage({
        text: err.message || "Could not resend OTP. Please try again.",
        type: "error"
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleForgotPassword(email) {
    setAuthLoading(true);
    setAuthMessage({ text: "", type: "info" });

    try {
      await resetPasswordForEmail(email);
      setAuthMessage({
        text: "Password reset link has been sent to your email. Please check your inbox and follow the instructions.",
        type: "success"
      });
    } catch (err) {
      console.error("Forgot password error:", err);
      setAuthMessage({
        text: err.message || "Could not send password reset email. Please verify your email and try again.",
        type: "error"
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleUpdatePassword(newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
      setAuthMessage({
        text: "Passwords do not match. Please re-enter identical passwords.",
        type: "error"
      });
      return;
    }
    if (newPassword.length < 6) {
      setAuthMessage({
        text: "Password must be at least 6 characters long.",
        type: "error"
      });
      return;
    }

    setAuthLoading(true);
    setAuthMessage({ text: "", type: "info" });

    try {
      await updatePassword(newPassword);
      await logoutUser();
      setSession(null);
      setUserProfile(null);
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname.replace("/reset-password", "") || "/");
      }
      setAuthMode("login");
      setAuthMessage({
        text: "Password updated successfully! Please login with your new password.",
        type: "success"
      });
    } catch (err) {
      console.error("Password update error:", err);
      setAuthMessage({
        text: err.message || "Failed to update password. The reset link may have expired.",
        type: "error"
      });
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setSession(null);
      setUserProfile(null);
      setAuthMode("login");
      setAuthMessage({ text: "", type: "info" });
    }
  }

  if (authChecking) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="brand-mark" style={{ margin: "0 auto 16px" }}>
            <Scissors size={24} />
          </div>
          <h3>Loading NICE LOOKING Portal...</h3>
          <p className="muted">Connecting to secure system</p>
        </div>
      </div>
    );
  }

  return session && authMode !== "reset" ? (
    <DashboardShell session={session} userProfile={userProfile} onLogout={handleLogout} />
  ) : (
    <AuthScreen
      mode={authMode}
      setMode={setAuthMode}
      pendingEmail={pendingEmail}
      setPendingEmail={setPendingEmail}
      onSubmit={handleAuthSubmit}
      onVerifyOtp={handleVerifyOtp}
      onResendOtp={handleResendOtp}
      onForgotPassword={handleForgotPassword}
      onUpdatePassword={handleUpdatePassword}
      loading={authLoading}
      message={authMessage}
      setMessage={setAuthMessage}
    />
  );
}

// =====================================================================
// 6-Digit OTP Box Component
// =====================================================================
function OtpInput({ length = 6, value = "", onChange, onComplete, disabled }) {
  const inputsRef = React.useRef([]);

  useEffect(() => {
    if (!disabled) {
      const firstEmptyIdx = (value || "").length < length ? (value || "").length : 0;
      inputsRef.current[firstEmptyIdx]?.focus();
    }
  }, [disabled]);

  const digits = useMemo(() => {
    const arr = (value || "").split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  function handleChange(idx, e) {
    const rawVal = e.target.value;
    // Multi-digit paste or fast typing
    if (rawVal.length > 1) {
      const clean = rawVal.replace(/\D/g, "").slice(0, length);
      onChange(clean);
      if (clean.length === length && onComplete) {
        onComplete(clean);
      }
      const nextIdx = Math.min(clean.length, length - 1);
      inputsRef.current[nextIdx]?.focus();
      return;
    }

    const char = rawVal.replace(/\D/g, "");
    const newDigits = [...digits];
    newDigits[idx] = char;
    const combined = newDigits.join("");
    onChange(combined);

    if (char && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
    if (combined.length === length && onComplete) {
      onComplete(combined);
    }
  }

  function handleKeyDown(idx, e) {
    if (e.key === "Backspace") {
      if (!digits[idx] && idx > 0) {
        inputsRef.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasteData) return;
    onChange(pasteData);
    if (pasteData.length === length && onComplete) {
      onComplete(pasteData);
    }
    const nextIdx = Math.min(pasteData.length, length - 1);
    inputsRef.current[nextIdx]?.focus();
  }

  return (
    <div className="otp-container" onPaste={handlePaste}>
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={el => (inputsRef.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          className={`otp-box ${digits[idx] ? "filled" : ""}`}
          value={digits[idx] || ""}
          disabled={disabled}
          onChange={e => handleChange(idx, e)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  );
}

// =====================================================================
// Auth Screen
// =====================================================================
function AuthScreen({
  mode,
  setMode,
  pendingEmail,
  setPendingEmail,
  onSubmit,
  onVerifyOtp,
  onResendOtp,
  onForgotPassword,
  onUpdatePassword,
  loading,
  message,
  setMessage
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(60);

  // Sync email to pendingEmail if entering verify-otp mode
  useEffect(() => {
    if (pendingEmail && !email) {
      setEmail(pendingEmail);
    }
  }, [pendingEmail, email]);

  // Resend cooldown timer for OTP
  useEffect(() => {
    let timer;
    if (mode === "verify-otp" && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown(c => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [mode, resendCooldown]);

  function handleResendClick() {
    if (resendCooldown > 0) return;
    const targetEmail = email || pendingEmail;
    if (!targetEmail) return;
    onResendOtp(targetEmail);
    setResendCooldown(60);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === "login") {
      if (!email || !password) return;
      onSubmit(email, password);
    } else if (mode === "register") {
      if (!name.trim()) {
        if (setMessage) setMessage({ text: "Please enter your full name.", type: "error" });
        return;
      }
      if (!email || !password) {
        if (setMessage) setMessage({ text: "Email and password are required.", type: "error" });
        return;
      }
      if (password.length < 6) {
        if (setMessage) setMessage({ text: "Password must be at least 6 characters long.", type: "error" });
        return;
      }
      if (password !== registerConfirmPassword) {
        if (setMessage) setMessage({ text: "Passwords do not match. Please re-enter identical passwords.", type: "error" });
        return;
      }
      onSubmit(email, password, name.trim());
    } else if (mode === "verify-otp") {
      const targetEmail = email || pendingEmail;
      if (!targetEmail || otpCode.length < 6) {
        if (setMessage) setMessage({ text: "Please enter the complete 6-digit OTP code.", type: "error" });
        return;
      }
      onVerifyOtp(targetEmail, otpCode);
    } else if (mode === "forgot") {
      if (!email) return;
      onForgotPassword(email);
    } else if (mode === "reset") {
      if (!newPassword || !confirmPassword) return;
      onUpdatePassword(newPassword, confirmPassword);
    }
  }

  const titles = {
    login: "Welcome back",
    register: "Create your account",
    "verify-otp": "Verify OTP Code",
    forgot: "Forgot Password?",
    reset: "Set new password"
  };

  const subtitles = {
    login: "Hair Wig & Services Management",
    register: "Hair Wig & Services Management",
    "verify-otp": "Enter the 6-digit verification OTP code sent to your email.",
    forgot: "Enter your registered email to receive a password reset link.",
    reset: "Enter and confirm your new password below."
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">
          {mode === "verify-otp" ? <KeyRound size={22} /> : <Scissors size={22} />}
        </div>
        <div className="eyebrow">NICE LOOKING</div>
        <h1>{titles[mode] || "Welcome back"}</h1>
        <p className="muted">{subtitles[mode] || "Hair Wig & Services Management"}</p>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <label>
              Full Name
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sameer Shaikh"
              />
            </label>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </label>
          )}

          {(mode === "login" || mode === "register") && (
            <div>
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="•••••••• (min 6 characters)"
                />
              </label>
              {mode === "login" && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                  <button
                    type="button"
                    className="link-btn"
                    style={{ padding: 0, fontSize: "11px", fontWeight: "600", color: "var(--blue)" }}
                    onClick={() => {
                      setMode("forgot");
                      if (setMessage) setMessage({ text: "", type: "info" });
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "register" && (
            <label>
              Confirm Password
              <input
                type="password"
                required
                minLength={6}
                value={registerConfirmPassword}
                onChange={e => setRegisterConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          )}

          {mode === "verify-otp" && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ textAlign: "center", marginBottom: "4px" }}>
                <div className="otp-email-badge">
                  <Mail size={13} />
                  <span>{email || pendingEmail}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 10px" }}>
                  Please enter the 6-digit code sent to your email address:
                </p>
              </div>

              <OtpInput
                length={6}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={code => {
                  if (code.length === 6) {
                    onVerifyOtp(email || pendingEmail, code);
                  }
                }}
                disabled={loading}
              />

              <div className="otp-resend-row">
                {resendCooldown > 0 ? (
                  <span className="timer-text">Resend code in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    className="resend-btn"
                    disabled={loading}
                    onClick={handleResendClick}
                  >
                    <RotateCcw size={12} /> Resend OTP
                  </button>
                )}

                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: "11.5px", padding: 0 }}
                  onClick={() => {
                    setMode("register");
                    if (setMessage) setMessage({ text: "", type: "info" });
                  }}
                >
                  Change Email / Back
                </button>
              </div>
            </div>
          )}

          {mode === "reset" && (
            <>
              <label>
                New Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="•••••••• (min 6 characters)"
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
            </>
          )}

          {message?.text && (
            <div
              className={`alert ${message.type === "success" ? "success-box" : ""}`}
              style={
                message.type === "success"
                  ? { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }
                  : {}
              }
            >
              {message.text}
            </div>
          )}

          {!supabaseConfigured && (
            <div className="demo-note" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
              {mode === "verify-otp" ? (
                <span><strong>Demo Mode:</strong> Supabase is in demo mode. Enter <strong>123456</strong> as the OTP code to verify and access dashboard.</span>
              ) : (
                <span>Supabase is not configured. Please add your <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your <code>.env</code> file.</span>
              )}
            </div>
          )}

          <button
            className="btn primary full"
            disabled={
              loading ||
              (mode === "login" && (!email || !password)) ||
              (mode === "register" && (!name || !email || !password || !registerConfirmPassword)) ||
              (mode === "verify-otp" && otpCode.length < 6) ||
              (mode === "forgot" && !email) ||
              (mode === "reset" && (!newPassword || !confirmPassword))
            }
            type="submit"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Login"
              : mode === "register"
              ? "Register & Get OTP"
              : mode === "verify-otp"
              ? "Verify OTP & Continue"
              : mode === "forgot"
              ? "Send Reset Link"
              : "Update Password"}
          </button>
        </form>

        {mode === "login" ? (
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setMode("register");
              if (setMessage) setMessage({ text: "", type: "info" });
            }}
          >
            Create a new account
          </button>
        ) : mode === "register" ? (
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setMode("login");
              if (setMessage) setMessage({ text: "", type: "info" });
            }}
          >
            Already have an account? Login
          </button>
        ) : mode === "verify-otp" ? (
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setMode("login");
              if (setMessage) setMessage({ text: "", type: "info" });
            }}
          >
            ← Back to Login
          </button>
        ) : (
          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setMode("login");
              if (setMessage) setMessage({ text: "", type: "info" });
            }}
          >
            ← Back to Login
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Dashboard Shell (Navigation Layout)
// =====================================================================
function DashboardShell({ session, userProfile, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [headerAction, setHeaderAction] = useState(null);
  const [settings, setSettings] = useState({
    shop_name: "NICE LOOKING",
    shop_subtitle: "Hair Wig & Hair Services",
    shop_mobile: "+91 98765 43210",
    shop_address: "Mumbai, Maharashtra",
    invoice_prefix: "NL",
    whatsapp_number: "919876543210"
  });

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchSettings();
      if (s) setSettings(s);
    } catch (err) {
      console.warn("Failed to load settings in DashboardShell:", err);
    }
  }, []);

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings, refreshTick]);

  // Clear header action when switching tabs
  useEffect(() => {
    setHeaderAction(null);
  }, [page]);

  const userEmail = session?.user?.email || "staff@nicelooking.com";
  const userName =
    userProfile?.fullName ||
    session?.user?.user_metadata?.full_name ||
    userEmail.split("@")[0].toUpperCase() ||
    "Staff";
  const userRole = userProfile?.role || "staff";
  const isAdmin = userRole === "admin" || userRole === "owner";
  const userInitials = (userName.slice(0, 2) || "NL").toUpperCase();

  const actorInfo = useMemo(() => ({
    id: session?.user?.id || "demo-user",
    email: userEmail,
    name: userName,
    role: userRole
  }), [session?.user?.id, userEmail, userName, userRole]);

  const nav = useMemo(() => {
    if (isAdmin) {
      return [
        ["dashboard", "Dashboard", LayoutDashboard],
        ["customers", "Customers", Users],
        ["billing", "New Billing", IndianRupee],
        ["invoices", "Invoices", FileText],
        ["products", "Wig Products", Package],
        ["offers", "Offers & WhatsApp", Percent],
        ["reports", "Reports", BarChart3],
        ["audit", "Audit Logs", History],
        ["staff", "Staff Management", UserCheck],
        ["settings", "Settings", Settings]
      ];
    }
    return [
      ["dashboard", "Dashboard", LayoutDashboard],
      ["customers", "Customers", Users],
      ["billing", "New Billing", IndianRupee],
      ["invoices", "Invoices", FileText],
      ["products", "Wig Products", Package],
      ["offers", "Offers & WhatsApp", Percent],
      ["settings", "Settings", Settings]
    ];
  }, [isAdmin]);

  return (
    <div className="app-shell">
      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          title="Close Navigation"
        />
      )}
      {/* Desktop Collapsible Sidebar / Mobile Off-canvas Drawer */}
      <aside className={`sidebar ${mobileOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          {sidebarCollapsed ? (
            <button
              className="icon-btn sidebar-expand-btn"
              type="button"
              title="Expand Sidebar"
              onClick={() => setSidebarCollapsed(false)}
            >
              <ChevronRight size={18} />
            </button>
          ) : (
            <>
              <div className="brand-info">
                <div className="brand-mark small">
                  <Scissors size={19} />
                </div>
                <div className="brand-text">
                  <strong>{settings?.shop_name || "NICE LOOKING"}</strong>
                  <span>{settings?.shop_subtitle || "Hair Wig & Services"}</span>
                </div>
              </div>
              <button
                className="icon-btn sidebar-toggle-btn"
                type="button"
                title="Collapse Sidebar"
                onClick={() => setSidebarCollapsed(true)}
              >
                <ChevronLeft size={16} />
              </button>
            </>
          )}
          <button
            className="icon-btn mobile-close"
            type="button"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="nav-label">MAIN MENU</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              data-label={label}
              title={sidebarCollapsed ? label : ""}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => {
                setPage(id);
                setMobileOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="staff-card">
            <div className="avatar">{userInitials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <strong>{userName}</strong>
                <span
                  className="role-pill-mini"
                  style={{
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "10px",
                    fontWeight: 700,
                    background: isAdmin ? "#eff6ff" : "#f1f5f9",
                    color: isAdmin ? "#1d4ed8" : "#475569"
                  }}
                >
                  {isAdmin ? "🛡️ ADMIN" : "👤 STAFF"}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                {userEmail}
              </span>
            </div>
          </div>
          <button
            className="nav-item"
            type="button"
            data-label="Logout"
            title={sidebarCollapsed ? "Logout" : ""}
            onClick={onLogout}
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className={`main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Top App Bar */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="icon-btn mobile-menu"
              type="button"
              onClick={() => setMobileOpen(true)}
              title="Open Navigation"
            >
              <Menu size={18} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="top-title">
                {nav.find(n => n[0] === page)?.[1] || "Dashboard"}
              </span>
              <span
                className="role-pill-mini"
                style={{
                  fontSize: "10px",
                  padding: "3px 8px",
                  borderRadius: "12px",
                  fontWeight: 700,
                  background: isAdmin ? "#eff6ff" : "#f8fafc",
                  color: isAdmin ? "#1d4ed8" : "#475569",
                  border: isAdmin ? "1px solid #bfdbfe" : "1px solid #e2e8f0"
                }}
              >
                {isAdmin ? "🛡️ OWNER / ADMIN" : "👤 RECEPTION"}
              </span>
            </div>
          </div>

          <div className="top-actions">
            {headerAction}
            <button
              className="icon-btn"
              title="Refresh Data"
              type="button"
              onClick={triggerGlobalRefresh}
            >
              <RefreshCw size={17} />
            </button>
            <div className="avatar" title={`${userName} (${userRole})`}>{userInitials}</div>
          </div>
        </header>

        {/* Dynamic Page Content with Route Guarding */}
        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              setPage={setPage}
              refreshTick={refreshTick}
              onDataChanged={triggerGlobalRefresh}
              setHeaderAction={setHeaderAction}
              isAdmin={isAdmin}
              userRole={userRole}
              actorInfo={actorInfo}
            />
          )}
          {page === "customers" && (
            <Customers
              setPage={setPage}
              refreshTick={refreshTick}
              onDataChanged={triggerGlobalRefresh}
              setHeaderAction={setHeaderAction}
              isAdmin={isAdmin}
              userRole={userRole}
              actorInfo={actorInfo}
              settings={settings}
            />
          )}
          {page === "billing" && (
            <Billing
              refreshTick={refreshTick}
              onDataChanged={triggerGlobalRefresh}
              isAdmin={isAdmin}
              userRole={userRole}
              actorInfo={actorInfo}
              settings={settings}
            />
          )}
          {page === "invoices" && (
            <Invoices
              refreshTick={refreshTick}
              onDataChanged={triggerGlobalRefresh}
              setHeaderAction={setHeaderAction}
              isAdmin={isAdmin}
              userRole={userRole}
              actorInfo={actorInfo}
              settings={settings}
            />
          )}
          {page === "products" && (
            <Products
              refreshTick={refreshTick}
              onDataChanged={triggerGlobalRefresh}
              setHeaderAction={setHeaderAction}
              isAdmin={isAdmin}
              userRole={userRole}
              actorInfo={actorInfo}
            />
          )}
          {page === "offers" && (
            <Offers refreshTick={refreshTick} isAdmin={isAdmin} settings={settings} />
          )}
          {page === "whatsapp" && (
            <WhatsAppPage refreshTick={refreshTick} setHeaderAction={setHeaderAction} settings={settings} />
          )}
          {page === "reports" && (
            isAdmin ? (
              <Reports refreshTick={refreshTick} setHeaderAction={setHeaderAction} />
            ) : (
              <AccessRestricted userRole={userRole} setPage={setPage} />
            )
          )}
          {page === "audit" && (
            isAdmin ? (
              <AuditLogs refreshTick={refreshTick} setHeaderAction={setHeaderAction} />
            ) : (
              <AccessRestricted userRole={userRole} setPage={setPage} />
            )
          )}
          {page === "staff" && (
            isAdmin ? (
              <StaffManagement refreshTick={refreshTick} onDataChanged={triggerGlobalRefresh} actorInfo={actorInfo} />
            ) : (
              <AccessRestricted userRole={userRole} setPage={setPage} />
            )
          )}
          {page === "settings" && (
            <SettingsPage
              actorInfo={actorInfo}
              isAdmin={isAdmin}
              onSettingsSaved={() => {
                loadSettings();
                triggerGlobalRefresh();
              }}
            />
          )}
        </div>

        {/* Mobile Native Bottom Navigation Bar */}
        <nav className="bottom-nav">
          <button
            type="button"
            className={`nav-tab ${page === "dashboard" && !moreOpen ? "active" : ""}`}
            onClick={() => {
              setPage("dashboard");
              setMoreOpen(false);
            }}
          >
            <LayoutDashboard size={20} />
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${page === "invoices" && !moreOpen ? "active" : ""}`}
            onClick={() => {
              setPage("invoices");
              setMoreOpen(false);
            }}
          >
            <FileText size={20} />
            <span>Invoices</span>
          </button>
          <button
            type="button"
            className={`fab-tab ${page === "billing" && !moreOpen ? "active" : ""}`}
            onClick={() => {
              setPage("billing");
              setMoreOpen(false);
            }}
            title="New Billing"
          >
            <div className="fab-btn">
              <Plus size={24} strokeWidth={2.6} />
            </div>
            <span>Billing</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${page === "customers" && !moreOpen ? "active" : ""}`}
            onClick={() => {
              setPage("customers");
              setMoreOpen(false);
            }}
          >
            <Users size={20} />
            <span>Customers</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${moreOpen ? "active" : ""}`}
            onClick={() => setMoreOpen(o => !o)}
          >
            <Grid size={20} />
            <span>More</span>
          </button>
        </nav>

        {/* Mobile More Features Action Sheet Drawer */}
        {moreOpen && (
          <div className="mobile-drawer-backdrop" onClick={() => setMoreOpen(false)}>
            <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle"></div>
              <div className="modal-head">
                <h3>More Features & Settings</h3>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setMoreOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="drawer-grid">
                <button
                  type="button"
                  className={`drawer-tile ${page === "products" ? "active" : ""}`}
                  onClick={() => {
                    setPage("products");
                    setMoreOpen(false);
                  }}
                >
                  <div className="drawer-icon-wrap">
                    <Package size={20} />
                  </div>
                  <span>Wig Products</span>
                </button>

                <button
                  type="button"
                  className={`drawer-tile ${page === "offers" ? "active" : ""}`}
                  onClick={() => {
                    setPage("offers");
                    setMoreOpen(false);
                  }}
                >
                  <div className="drawer-icon-wrap">
                    <Percent size={20} />
                  </div>
                  <span>Offers & WhatsApp</span>
                </button>

                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className={`drawer-tile ${page === "reports" ? "active" : ""}`}
                      onClick={() => {
                        setPage("reports");
                        setMoreOpen(false);
                      }}
                    >
                      <div className="drawer-icon-wrap">
                        <BarChart3 size={20} />
                      </div>
                      <span>Reports</span>
                    </button>

                    <button
                      type="button"
                      className={`drawer-tile ${page === "audit" ? "active" : ""}`}
                      onClick={() => {
                        setPage("audit");
                        setMoreOpen(false);
                      }}
                    >
                      <div className="drawer-icon-wrap">
                        <History size={20} />
                      </div>
                      <span>Audit Logs</span>
                    </button>

                    <button
                      type="button"
                      className={`drawer-tile ${page === "staff" ? "active" : ""}`}
                      onClick={() => {
                        setPage("staff");
                        setMoreOpen(false);
                      }}
                    >
                      <div className="drawer-icon-wrap">
                        <UserCheck size={20} />
                      </div>
                      <span>Staff Roles</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className={`drawer-tile ${page === "settings" ? "active" : ""}`}
                  onClick={() => {
                    setPage("settings");
                    setMoreOpen(false);
                  }}
                >
                  <div className="drawer-icon-wrap">
                    <Settings size={20} />
                  </div>
                  <span>Settings</span>
                </button>
              </div>

              <div className="staff-card" style={{ marginTop: "10px" }}>
                <div className="avatar">{userInitials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <strong>{userName}</strong>
                    <span className="pill" style={{ fontSize: "9px", padding: "1px 6px" }}>
                      {isAdmin ? "Admin" : "Staff"}
                    </span>
                  </div>
                  <span>{userEmail}</span>
                </div>
                <button
                  className="btn danger small-btn"
                  type="button"
                  onClick={onLogout}
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}



function Kpi({ icon: Icon, label, value, note }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-icon">
          <Icon size={19} />
        </div>
        <span className="status-dot">●</span>
      </div>
      <span className="kpi-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

// =====================================================================
// 1. Dashboard Component
// =====================================================================
function Dashboard({ setPage, refreshTick, setHeaderAction }) {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([fetchInvoices(), fetchCustomers()])
      .then(([invs, custs]) => {
        if (!active) return;
        setInvoices(invs);
        setCustomers(custs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Dashboard fetch error:", err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshTick]);

  const today = getMumbaiTodayISO();
  const activeDate = selectedDate || today;
  const isToday = activeDate === today;

  // Filter invoices strictly for activeDate (exclude VOIDED invoices from revenue)
  const activeInvoices = invoices.filter(
    r => r.createdAt === activeDate && !r.isVoided && r.status !== "VOIDED"
  );

  const sales = activeInvoices.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cash = activeInvoices
    .filter(r => r.paymentMode === "Cash")
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const digital = activeInvoices
    .filter(r => ["UPI", "Card", "Netbanking", "Online"].includes(r.paymentMode))
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  // Compute dynamic KPI labels and notes based on active date
  const kpiLabels = useMemo(() => {
    if (isToday) {
      return {
        sales: "Today's Sales",
        cash: "Cash",
        online: "Online",
        noteSales: "Total today's billing",
        noteCash: "Today's cash collection",
        noteOnline: "UPI + Card + Netbanking"
      };
    }

    const [y, m, d] = activeDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dayMonth = dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "Asia/Kolkata"
    });

    const ydt = new Date();
    ydt.setDate(ydt.getDate() - 1);
    const isYesterday = activeDate === formatToLocalISODate(ydt);
    const dateDescriptor = isYesterday ? "Yesterday" : dayMonth;

    return {
      sales: `Sales — ${dateDescriptor}`,
      cash: `Cash — ${dateDescriptor}`,
      online: `Online — ${dateDescriptor}`,
      noteSales: `Total billing on ${dayMonth}`,
      noteCash: `Cash collection on ${dayMonth}`,
      noteOnline: `UPI + Card + Netbanking (${dayMonth})`
    };
  }, [activeDate, isToday]);

  // Calculate past 7 days revenue for Mumbai local dates (chart always shows full 7 days, excluding voided)
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (6 - i));
      const key = formatToLocalISODate(dt);
      const label = dt.toLocaleDateString("en-IN", {
        weekday: "short",
        timeZone: "Asia/Kolkata"
      });
      const dayNum = dt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Kolkata"
      });
      const amount = invoices
        .filter(r => r.createdAt === key && !r.isVoided && r.status !== "VOIDED")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return { key, label, dayNum, amount };
    });
  }, [invoices]);

  const maxRevenue = Math.max(...days.map(x => x.amount), 0);
  const sevenDayTotal = days.reduce((sum, d) => sum + d.amount, 0);
  const customerCount = customers.length;
  const whatsappOptInCount = customers.filter(c => c.whatsapp_opt_in !== false).length;
  const optInPercentage = customerCount > 0 ? Math.round((whatsappOptInCount / customerCount) * 100) : 100;
  const recentRows = invoices.slice(0, 6);

  // Push action buttons directly to topbar header
  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {!isToday && (
            <button
              className="btn secondary small-btn"
              type="button"
              onClick={() => setSelectedDate(today)}
              title="Reset KPI cards to today"
            >
              <RefreshCw size={13} /> Today
            </button>
          )}
          <button
            className="btn primary small-btn"
            type="button"
            onClick={() => setPage("billing")}
          >
            <Plus size={15} /> New Billing
          </button>
        </div>
      );
    }
  }, [isToday, today, setPage, setHeaderAction]);

  return (
    <>

      {/* Top 3 Date-Sensitive KPI Grid: Sales, Cash, Online (UPI+Card+Netbanking) */}
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        <Kpi
          icon={IndianRupee}
          label={kpiLabels.sales}
          value={money(sales)}
          note={kpiLabels.noteSales}
        />
        <Kpi
          icon={BadgeIndianRupee}
          label={kpiLabels.cash}
          value={money(cash)}
          note={kpiLabels.noteCash}
        />
        <Kpi
          icon={ShoppingBag}
          label={kpiLabels.online}
          value={money(digital)}
          note={kpiLabels.noteOnline}
        />
      </div>

      <div className="grid-2">
        {/* Enhanced 7-Day Revenue Overview Panel */}
        <section className="panel revenue-chart-panel">
          <div className="panel-head">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3>Revenue Overview</h3>
                <span className="pill" style={{ background: "#eff6ff", color: "var(--blue)", borderColor: "#bfdbfe" }}>
                  7D: {money(sevenDayTotal)}
                </span>
              </div>
              <p>Last 7 days • click any bar to filter KPIs for that day</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {!isToday && (
                <button
                  className="btn secondary small-btn"
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  title="Reset to today"
                >
                  <RefreshCw size={12} /> Today
                </button>
              )}
            </div>
          </div>

          <div className="chart-container">
            {/* Background horizontal guide lines */}
            <div className="chart-grid-bg">
              <div className="chart-grid-line">
                <span className="chart-grid-label">{maxRevenue > 0 ? compactMoney(maxRevenue) : "—"}</span>
              </div>
              <div className="chart-grid-line">
                <span className="chart-grid-label">{maxRevenue > 0 ? compactMoney(Math.round(maxRevenue / 2)) : "—"}</span>
              </div>
              <div className="chart-grid-line">
                <span className="chart-grid-label">₹0</span>
              </div>
            </div>

            {/* Interactive bars */}
            <div className="chart-bars-wrap">
              {days.map(day => {
                const isSelected = activeDate === day.key;
                const barHeightPct = maxRevenue > 0
                  ? Math.max((day.amount / maxRevenue) * 80, day.amount > 0 ? 10 : 4)
                  : 4;

                return (
                  <div
                    className={`bar-col ${isSelected ? "selected" : ""}`}
                    key={day.key}
                    onClick={() => setSelectedDate(day.key)}
                    title={`${day.key} (${day.label}): ${money(day.amount)} — Click to inspect date`}
                  >
                    <div className="bar-pill-badge">
                      {compactMoney(day.amount)}
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar"
                        style={{ height: `${barHeightPct}%` }}
                      />
                    </div>
                    <div className="bar-label-group">
                      <span className="bar-label-day">{day.label}</span>
                      <span className="bar-label-date">{day.dayNum}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Enhanced Customer Base Hero Card */}
        <section className="panel customer-hero-panel">
          <div className="panel-head">
            <div>
              <h3>Customer Base</h3>
              <p>Total registered clients & audience</p>
            </div>
            <span className="pill success">Active CRM</span>
          </div>

          <div className="customer-hero-card">
            <div className="customer-hero-main">
              <div className="customer-hero-icon-box">
                <Users size={30} />
              </div>
              <div className="customer-hero-metric-group">
                <div className="customer-hero-count">{customerCount}</div>
                <span className="customer-hero-label">Registered Customers</span>
              </div>
            </div>

            <div className="customer-insights-list">
              <div className="customer-insight-item">
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <MessageCircle size={14} style={{ color: "#16a34a" }} /> WhatsApp Opt-In
                </span>
                <strong>{whatsappOptInCount} ({optInPercentage}%)</strong>
              </div>
              <div className="customer-insight-item">
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShoppingBag size={14} style={{ color: "var(--blue)" }} /> Total Transactions
                </span>
                <strong>{invoices.length} Bills</strong>
              </div>
            </div>

            <div className="customer-hero-actions">
              <button
                className="btn primary"
                type="button"
                onClick={() => setPage("customers")}
              >
                <Users size={15} /> View Customers
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setPage("billing")}
              >
                <Plus size={15} /> New Bill
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h3>Recent Transactions</h3>
            <p>Latest customer payments</p>
          </div>
          <button
            className="link-btn"
            type="button"
            onClick={() => setPage("invoices")}
          >
            View all
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap desktop-only-table">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.length ? (
                recentRows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.mobile}</small>
                    </td>
                    <td>{r.service}</td>
                    <td>
                      <strong>{money(r.amount)}</strong>
                    </td>
                    <td>
                      <PaymentModeBadge mode={r.paymentMode} />
                    </td>
                    <td>{r.createdAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-cell">
                    {loading ? "Loading transactions..." : "No transactions recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Card View */}
        <div className="mobile-only-cards mobile-card-list">
          {recentRows.length ? (
            recentRows.map((r, i) => (
              <div className="mobile-card" key={r.id || i}>
                <div className="mobile-card-header">
                  <div>
                    <h4 className="mobile-card-title">{r.name}</h4>
                    <span className="mobile-card-sub">{r.mobile}</span>
                  </div>
                  <div>
                    <div className="mobile-card-amount">{money(r.amount)}</div>
                    <div className="mobile-card-date">{r.createdAt}</div>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <span className="pill">{r.service}</span>
                  <PaymentModeBadge mode={r.paymentMode} />
                </div>
              </div>
            ))
          ) : (
            <div className="empty-cell">
              {loading ? "Loading transactions..." : "No transactions recorded yet."}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// =====================================================================
// 2. Customers Component (Dynamic Last Visit Computation)
// =====================================================================
function Customers({ setPage, refreshTick, onDataChanged, setHeaderAction, isAdmin, userRole, actorInfo, settings }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn primary small-btn"
          type="button"
          onClick={() => setPage("billing")}
        >
          <Plus size={15} /> Add via Billing
        </button>
      );
    }
  }, [setPage, setHeaderAction]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetchCustomers()
      .then(data => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Customers load failed:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(
      r =>
        `${r.name || ""} ${r.mobile || ""} ${r.lastService || ""} ${r.address || ""}`
          .toLowerCase()
          .includes(q)
    );
  }, [customers, search]);

  async function handleUpdateCustomer(e) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await saveCustomer(editing, actorInfo);
      setEditing(null);
      loadData();
      if (onDataChanged) onDataChanged();
      alert("Customer updated successfully.");
    } catch (err) {
      console.error(err);
      alert("Could not update customer: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCustomer() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteCustomer(confirmDelete.id, actorInfo);
      setConfirmDelete(null);
      await loadData();
      if (onDataChanged) onDataChanged();
      alert("Customer deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Customer could not be deleted: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>

      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer name, mobile, address..."
            />
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={() => csvDownload(filtered, "nice-looking-customers.csv")}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap desktop-only-table">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Mobile</th>
                <th>Visits</th>
                <th>Lifetime Spent</th>
                <th>Last Visit</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.map((r, i) => (
                  <tr key={r.id || i}>
                    <td>
                      <strong style={{ cursor: "pointer", color: "var(--blue)" }} onClick={() => setViewingCustomer(r)}>
                        {r.name}
                      </strong>
                      <small>{r.address || "No address stored"}</small>
                    </td>
                    <td>
                      <a href={`tel:${r.mobile}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {r.mobile}
                      </a>
                    </td>
                    <td>
                      <span className="pill">
                        {r.visitCount || (r.hasInvoices ? 1 : 0)} visit{(r.visitCount || 1) === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td>
                      <strong>{money(r.totalSpent || r.amount || 0)}</strong>
                    </td>
                    <td>{r.lastVisit || r.createdAt || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-action-btn view-action"
                          type="button"
                          title="View Customer Profile & History"
                          onClick={() => setViewingCustomer(r)}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="icon-action-btn whatsapp-action"
                          type="button"
                          title="Send WhatsApp Message"
                          onClick={() =>
                            openWhatsApp(
                              offerMessage(
                                "Special greeting from NICE LOOKING Hair Wig & Salon! Let us know if you need any service or maintenance.",
                                r.name
                              ),
                              r.mobile
                            )
                          }
                        >
                          <MessageCircle size={15} />
                        </button>
                        <button
                          className="icon-action-btn edit-action"
                          type="button"
                          title="Edit Customer Details"
                          onClick={() => setEditing({ ...r })}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-action-btn delete-action"
                          type="button"
                          title="Delete Customer"
                          onClick={() => setConfirmDelete(r)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    {loading ? "Loading customers..." : "No customers found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Card View */}
        <div className="mobile-only-cards mobile-card-list">
          {filtered.length ? (
            filtered.map((r, i) => (
              <div className="mobile-card" key={r.id || i}>
                <div className="mobile-card-header">
                  <div style={{ cursor: "pointer" }} onClick={() => setViewingCustomer(r)}>
                    <h4 className="mobile-card-title">
                      <Users size={15} style={{ color: "var(--blue)" }} />
                      {r.name}
                    </h4>
                    <span className="mobile-card-sub">{r.address || "No address stored"}</span>
                  </div>
                  <div>
                    <div className="mobile-card-amount">
                      {money(r.totalSpent || r.amount || 0)}
                    </div>
                    <div className="mobile-card-date">Last: {r.lastVisit || r.createdAt || "—"}</div>
                  </div>
                </div>

                <div className="mobile-card-body">
                  <div className="mobile-card-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Phone size={13} style={{ color: "var(--blue)" }} />
                      <a
                        href={`tel:${r.mobile}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {r.mobile}
                      </a>
                    </span>
                  </div>
                  <span className="pill">
                    {r.visitCount || (r.hasInvoices ? 1 : 0)} visit{(r.visitCount || 1) === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mobile-card-actions">
                  <button
                    className="icon-action-btn view-action"
                    type="button"
                    onClick={() => setViewingCustomer(r)}
                    title="View Customer Profile"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="icon-action-btn whatsapp-action"
                    type="button"
                    onClick={() =>
                      openWhatsApp(
                        offerMessage(
                          "Special greeting from NICE LOOKING Hair Wig & Salon! Let us know if you need any service or maintenance.",
                          r.name
                        ),
                        r.mobile
                      )
                    }
                    title="Send WhatsApp Message"
                  >
                    <MessageCircle size={15} />
                  </button>
                  <button
                    className="icon-action-btn edit-action"
                    type="button"
                    onClick={() => setEditing({ ...r })}
                    title="Edit Customer"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-action-btn delete-action"
                    type="button"
                    onClick={() => setConfirmDelete(r)}
                    title="Delete Customer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-cell">
              {loading ? "Loading customers..." : "No customers found."}
            </div>
          )}
        </div>
      </section>

      {/* View Customer Profile Modal */}
      {viewingCustomer && (
        <Modal
          title="Customer Profile"
          onClose={() => setViewingCustomer(null)}
        >
          <div className="customer-profile-card">
            <div className="customer-profile-header">
              <div className="customer-avatar-circle">
                {(viewingCustomer.name || "C").slice(0, 2).toUpperCase()}
              </div>
              <div className="customer-profile-info">
                <h3>{viewingCustomer.name}</h3>
                <p>
                  📱 <a href={`tel:${viewingCustomer.mobile}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>{viewingCustomer.mobile}</a>
                  {viewingCustomer.address ? ` • 📍 ${viewingCustomer.address}` : ""}
                </p>
                <div style={{ marginTop: "6px", display: "flex", gap: "6px", alignItems: "center" }}>
                  <span className="pill success" style={{ fontSize: "10px" }}>
                    ✓ {viewingCustomer.whatsapp_opt_in !== false ? "WhatsApp Active" : "No WhatsApp"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                    Joined: {viewingCustomer.createdAt || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="customer-stats-grid">
              <div className="customer-stat-box">
                <span>Total Visits</span>
                <strong>{viewingCustomer.visitCount || (viewingCustomer.invoices?.length || 0)}</strong>
              </div>
              <div className="customer-stat-box">
                <span>Lifetime Spent</span>
                <strong style={{ color: "var(--blue)" }}>
                  {money(viewingCustomer.totalSpent || viewingCustomer.amount || 0)}
                </strong>
              </div>
              <div className="customer-stat-box">
                <span>Last Service</span>
                <strong style={{ fontSize: "13px" }}>
                  {viewingCustomer.lastService || "—"}
                </strong>
              </div>
            </div>

            {/* Billing & Invoices History */}
            <div style={{ marginTop: "4px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 800, margin: "0 0 8px 0", color: "#0f172a" }}>
                📜 Billing & Visit History
              </h4>

              {viewingCustomer.invoices && viewingCustomer.invoices.length > 0 ? (
                <div className="table-wrap" style={{ maxHeight: "230px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Date</th>
                        <th>Service / Product</th>
                        <th>Amount</th>
                        <th>Payment</th>
                        <th>WhatsApp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingCustomer.invoices.map((inv, idx) => (
                        <tr key={inv.id || idx}>
                          <td><strong>{inv.invoiceNumber}</strong></td>
                          <td>{inv.createdAt}</td>
                          <td>
                            {inv.items && inv.items.length > 1 ? (
                              <div>
                                <span className="pill" style={{ background: "#e0f2fe", color: "#0284c7", fontWeight: 700, marginRight: "4px" }}>
                                  {inv.items.length} Items
                                </span>
                                <span style={{ fontSize: "12px" }}>{inv.service}</span>
                              </div>
                            ) : (
                              <span>
                                {inv.service}
                                {inv.productName ? ` (${inv.productName})` : ""}
                              </span>
                            )}
                          </td>
                          <td><strong>{money(inv.amount || inv.total)}</strong></td>
                          <td><PaymentModeBadge mode={inv.paymentMode} /></td>
                          <td>
                            <button
                              type="button"
                              className="icon-action-btn whatsapp-action"
                              style={{ width: "28px", height: "28px" }}
                              title="Send invoice via WhatsApp"
                              onClick={() =>
                                openWhatsApp(
                                  invoiceMessage({
                                    ...inv,
                                    customerName: viewingCustomer.name,
                                    mobile: viewingCustomer.mobile
                                  }, settings),
                                  viewingCustomer.mobile
                                )
                              }
                            >
                              <MessageCircle size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
                  No past billing transactions recorded yet for this customer.
                </div>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "8px" }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setViewingCustomer(null)}
              >
                Close
              </button>
              <button
                className="btn whatsapp"
                type="button"
                onClick={() =>
                  openWhatsApp(
                    offerMessage(
                      "Special greeting from NICE LOOKING Hair Wig & Salon! Let us know if you need any service or maintenance.",
                      viewingCustomer.name
                    ),
                    viewingCustomer.mobile
                  )
                }
              >
                <Send size={15} /> Chat on WhatsApp
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  const custToEdit = viewingCustomer;
                  setViewingCustomer(null);
                  setEditing({ ...custToEdit });
                }}
              >
                <Pencil size={15} /> Edit Customer
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  const custToDel = viewingCustomer;
                  setViewingCustomer(null);
                  setConfirmDelete(custToDel);
                }}
              >
                <Trash2 size={15} /> Delete Customer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Customer" onClose={() => setEditing(null)}>
          <form className="form-panel" onSubmit={handleUpdateCustomer}>
            <label>
              Customer Name *
              <input
                required
                value={editing.name || ""}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              Contact Number * (10 Digits)
              <input
                required
                type="tel"
                maxLength={10}
                inputMode="numeric"
                value={editing.mobile || ""}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setEditing({ ...editing, mobile: digits });
                }}
                placeholder="10-digit mobile number"
              />
            </label>
            <label>
              Address
              <textarea
                value={editing.address || ""}
                onChange={e => setEditing({ ...editing, address: e.target.value })}
                placeholder="Customer address"
              />
            </label>
            <label className="check" style={{ marginTop: "10px" }}>
              <input
                type="checkbox"
                checked={editing.whatsapp_opt_in ?? true}
                onChange={e =>
                  setEditing({ ...editing, whatsapp_opt_in: e.target.checked })
                }
              />
              Opted in to WhatsApp notifications and special offers
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Delete Customer?" onClose={() => setConfirmDelete(null)}>
          <div className="warning-box">
            <strong>Are you sure you want to delete {confirmDelete.name}?</strong>
            <p style={{ marginTop: "6px" }}>
              Mobile: {confirmDelete.mobile}
            </p>
            <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--muted)" }}>
              This removes the customer record from Supabase. Any past invoices and transactions will remain safely preserved in history.
            </p>
          </div>
          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={handleDeleteCustomer}
              disabled={saving}
            >
              {saving ? "Deleting..." : "Delete Customer"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// 3. New Billing Component (Multi-Service / Multi-Item & Atomic Stock)
// =====================================================================
function Billing({ refreshTick, onDataChanged, isAdmin, userRole, actorInfo, settings }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    address: "",
    items: [
      {
        id: `item-1`,
        service: "Hair Wig",
        productId: "",
        productName: "",
        productSize: "",
        quantity: "1",
        unitPrice: "",
        amount: "",
        note: ""
      }
    ],
    discount: "",
    paymentCategory: "Cash",
    onlineSubMethod: "UPI",
    paymentMode: "Cash",
    description: "",
    whatsapp: true
  });
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [done, setDone] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Load wig products
  useEffect(() => {
    let active = true;
    fetchProducts()
      .then(prods => {
        if (!active) return;
        setProducts(prods);
      })
      .catch(err => console.error("Billing product load failed:", err));
    return () => {
      active = false;
    };
  }, [refreshTick]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Debounced customer lookup by mobile
  useEffect(() => {
    let cancelled = false;
    const clean = form.mobile.replace(/\D/g, "");
    if (clean.length < 10) {
      setExistingCustomer(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const found = await findCustomerByMobile(clean);
        if (cancelled) return;
        if (found) {
          setExistingCustomer(found);
          setForm(f => ({
            ...f,
            name: found.name || f.name,
            address: found.address || f.address
          }));
        } else {
          setExistingCustomer(null);
        }
      } catch (err) {
        if (!cancelled) console.error("Customer lookup failed:", err);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.mobile]);

  // Line Items Handlers
  function addLineItem(serviceName = "Hair Wig") {
    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      service: serviceName,
      productId: "",
      productName: "",
      productSize: "",
      quantity: "1",
      unitPrice: "",
      amount: "",
      note: ""
    };
    setForm(f => ({
      ...f,
      items: [...f.items, newItem]
    }));
  }

  function removeLineItem(itemId) {
    setForm(f => {
      if (f.items.length <= 1) return f;
      return {
        ...f,
        items: f.items.filter(it => it.id !== itemId)
      };
    });
  }

  function updateItem(itemId, field, value) {
    setForm(f => {
      const updatedItems = f.items.map(it => {
        if (it.id !== itemId) return it;

        if (field === "service") {
          if (value === "Hair Wig") {
            return {
              ...it,
              service: value,
              productId: "",
              productName: "",
              productSize: "",
              unitPrice: "",
              amount: ""
            };
          } else {
            return {
              ...it,
              service: value,
              productId: "",
              productName: "",
              productSize: "",
              unitPrice: it.unitPrice || "",
              amount: it.amount || it.unitPrice || ""
            };
          }
        }

        if (field === "productId") {
          const prod = products.find(p => String(p.id) === String(value));
          if (prod) {
            const qty = Math.max(1, Number(it.quantity || 1));
            const uPrice = Number(prod.price || 0);
            return {
              ...it,
              productId: value,
              productName: prod.name,
              productSize: prod.size || "Standard",
              unitPrice: String(uPrice),
              amount: String(uPrice * qty)
            };
          } else {
            return {
              ...it,
              productId: "",
              productName: "",
              productSize: "",
              unitPrice: "",
              amount: ""
            };
          }
        }

        if (field === "quantity") {
          const qtyVal = value;
          const qty = Math.max(1, Number(qtyVal || 1));
          const prod = it.service === "Hair Wig" && it.productId
            ? products.find(p => String(p.id) === String(it.productId))
            : null;
          const uPrice = prod ? Number(prod.price || 0) : Number(it.unitPrice || 0);
          const newAmount = uPrice > 0 ? String(uPrice * qty) : it.amount;
          return {
            ...it,
            quantity: qtyVal,
            amount: newAmount
          };
        }

        if (field === "unitPrice") {
          const qty = Math.max(1, Number(it.quantity || 1));
          const amt = Number(value || 0) * qty;
          return {
            ...it,
            unitPrice: value,
            amount: value !== "" ? String(amt) : ""
          };
        }

        if (field === "amount") {
          return {
            ...it,
            amount: value
          };
        }

        if (field === "note") {
          return {
            ...it,
            note: value
          };
        }

        return { ...it, [field]: value };
      });

      return { ...f, items: updatedItems };
    });
  }

  // Calculate live Grand Subtotal across all line items
  const subtotal = useMemo(() => {
    return form.items.reduce((sum, it) => {
      const lineAmt = Number(it.amount);
      if (!isNaN(lineAmt) && it.amount !== "") {
        return sum + lineAmt;
      }
      const prod = it.service === "Hair Wig" && it.productId
        ? products.find(p => String(p.id) === String(it.productId))
        : null;
      const unit = prod ? Number(prod.price || 0) : Number(it.unitPrice || 0);
      const qty = Math.max(1, Number(it.quantity || 1));
      return sum + (unit * qty);
    }, 0);
  }, [form.items, products]);

  const discount = Number(form.discount || 0);
  const total = Math.max(0, subtotal - discount);

  const discountPercents = [5, 10, 15, 20, 25];

  function applyDiscountPercent(pct) {
    const base = Number(subtotal || 0);
    if (base <= 0) {
      update("discount", "0");
      return;
    }
    const calc = Math.round((base * pct) / 100);
    update("discount", String(calc));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Customer name is required.");
    const cleanMobile = form.mobile.replace(/\D/g, "");
    if (cleanMobile.length < 10) {
      return alert("Please enter a valid 10-digit contact number.");
    }

    if (!form.items || form.items.length === 0) {
      return alert("Please add at least one service or product item.");
    }

    // Validate wig stocks & requirements across all line items
    const wigDemand = {};
    for (let i = 0; i < form.items.length; i++) {
      const it = form.items[i];
      if (it.service === "Hair Wig") {
        if (!it.productId) {
          return alert(`Please select a wig product for line item #${i + 1}.`);
        }
        const prod = products.find(p => String(p.id) === String(it.productId));
        if (!prod) {
          return alert(`Selected wig product for item #${i + 1} does not exist.`);
        }
        const qty = Math.max(1, Number(it.quantity || 1));
        wigDemand[it.productId] = (wigDemand[it.productId] || 0) + qty;
        if (wigDemand[it.productId] > Number(prod.stock || 0)) {
          return alert(
            `Insufficient stock for "${prod.name}" (${prod.size || "Standard"}): total requested ${wigDemand[it.productId]} unit(s), but only ${prod.stock} unit(s) available.`
          );
        }
      }
    }

    setSubmitting(true);
    try {
      const created = await createInvoice(form, form.items, actorInfo);
      setDone({
        ...created,
        sendWhatsApp: form.whatsapp
      });

      // Clear form
      setForm({
        name: "",
        mobile: "",
        address: "",
        items: [
          {
            id: `item-1`,
            service: "Hair Wig",
            productId: "",
            productName: "",
            productSize: "",
            quantity: "1",
            unitPrice: "",
            amount: "",
            note: ""
          }
        ],
        discount: "",
        paymentCategory: "Cash",
        onlineSubMethod: "UPI",
        paymentMode: "Cash",
        description: "",
        whatsapp: true
      });
      setExistingCustomer(null);

      // Refresh product list and global data
      fetchProducts().then(setProducts);
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Billing submit error:", err);
      alert("Invoice could not be saved: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="billing-layout" onSubmit={handleSubmit}>
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <h3>Customer & Billing Details</h3>
              <p>Add multiple salon services and wig products to a single invoice.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Contact Number * (10 Digits)
              <input
                required
                type="tel"
                maxLength={10}
                inputMode="numeric"
                value={form.mobile}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  update("mobile", digits);
                }}
                placeholder="10-digit mobile number"
              />
              {existingCustomer ? (
                <span className="field-hint" style={{ color: "#16a34a" }}>
                  ✓ Existing customer found — details loaded automatically.
                </span>
              ) : (
                <span className="field-hint">
                  Enter 10-digit mobile number to auto-fill customer info.
                </span>
              )}
            </label>

            <label>
              Customer Name *
              <input
                required
                value={form.name}
                onChange={e => update("name", e.target.value)}
                placeholder="Full name"
              />
            </label>

            <label className="span-2">
              Address
              <input
                value={form.address}
                onChange={e => update("address", e.target.value)}
                placeholder="Customer address (locality / area)"
              />
            </label>

            {/* Itemized Services & Products Section */}
            <div className="line-items-section">
              <div className="line-items-header">
                <div className="line-items-title">
                  <Scissors size={18} className="line-items-icon" />
                  <span>Services & Products</span>
                  <span className="item-count-badge">
                    {form.items.length} {form.items.length === 1 ? "Item" : "Items"}
                  </span>
                </div>
              </div>

              {/* Quick Tap Service Chips to Add New Item (Smooth Horizontal Scroll on Mobile) */}
              <div className="quick-add-bar">
                <span className="quick-add-label">+ Quick Add:</span>
                <div className="quick-add-chips-scroll">
                  {services.map(s => (
                    <button
                      key={s}
                      type="button"
                      className="quick-add-btn"
                      onClick={() => addLineItem(s)}
                    >
                      <Plus size={12} /> {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Items List */}
              {form.items.map((it, idx) => {
                const isWig = it.service === "Hair Wig";
                const prod = isWig && it.productId
                  ? products.find(p => String(p.id) === String(it.productId))
                  : null;
                const lineAmt = Number(it.amount) || (Number(it.unitPrice || prod?.price || 0) * Math.max(1, Number(it.quantity || 1)));

                return (
                  <div key={it.id || idx} className="line-item-card">
                    <div className="line-item-top">
                      <div className="line-item-index">
                        <span className="badge-num">{idx + 1}</span>
                        <span className="line-item-name-heading">{it.service || "Service Line"}</span>
                        {isWig && prod && (
                          <span className="line-item-prod-hint">
                            • {prod.name} ({prod.size || "Standard"})
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="line-item-total-badge">
                          {money(lineAmt)}
                        </span>
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            className="line-item-remove-btn"
                            title="Remove this item"
                            onClick={() => removeLineItem(it.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="line-item-grid">
                      <div className="line-field line-col-service">
                        <label>Service Type *</label>
                        <select
                          required
                          value={it.service}
                          onChange={e => updateItem(it.id, "service", e.target.value)}
                        >
                          {services.map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isWig ? (
                        <div className="line-field line-col-product">
                          <label>Wig Product *</label>
                          <select
                            required
                            value={it.productId}
                            onChange={e => updateItem(it.id, "productId", e.target.value)}
                          >
                            <option value="">Select wig product...</option>
                            {products.map(p => (
                              <option
                                disabled={Number(p.stock) <= 0}
                                key={p.id}
                                value={p.id}
                              >
                                {p.name} • {p.size || "Standard"} • Stock: {p.stock} • ₹{Number(p.price || 0).toLocaleString("en-IN")}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="line-field line-col-note">
                          <label>Service Note / Details</label>
                          <input
                            type="text"
                            value={it.note || ""}
                            onChange={e => updateItem(it.id, "note", e.target.value)}
                            placeholder="e.g. First fitting, Dark brown color, Scalp wash"
                          />
                        </div>
                      )}

                      <div className="line-field line-col-price">
                        <label>{isWig ? "Unit Price" : "Charge *"}</label>
                        <div className="input-with-symbol">
                          <span className="input-currency-symbol">₹</span>
                          <input
                            required
                            type="number"
                            min="0"
                            readOnly={isWig && Boolean(prod)}
                            value={isWig && prod ? String(prod.price) : it.unitPrice}
                            onChange={e => updateItem(it.id, "unitPrice", e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="line-field line-col-qty">
                        <label>Qty *</label>
                        <input
                          required
                          type="number"
                          min="1"
                          max={prod?.stock || 99}
                          value={it.quantity || "1"}
                          onChange={e => updateItem(it.id, "quantity", e.target.value)}
                        />
                      </div>
                    </div>

                    {isWig && prod && (
                      <div className="line-item-stock-info">
                        <span style={{ color: Number(prod.stock) < 3 ? "#dc2626" : "#059669", fontWeight: 700 }}>
                          ✓ Available Stock: {prod.stock} unit(s)
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          ₹{Number(prod.price).toLocaleString("en-IN")} × {it.quantity || 1} = <strong>{money(lineAmt)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Payment Mode Selection: Cash or Online (UPI, Card, Netbanking) */}
            <div className="span-2 payment-mode-section">
              <label className="section-field-label">Payment Mode *</label>
              <div className="payment-mode-buttons">
                <button
                  type="button"
                  className={`payment-mode-btn ${form.paymentCategory === "Cash" ? "active" : ""}`}
                  onClick={() => {
                    setForm(f => ({ ...f, paymentCategory: "Cash", paymentMode: "Cash" }));
                  }}
                >
                  <BadgeIndianRupee size={18} /> Cash
                </button>
                <button
                  type="button"
                  className={`payment-mode-btn ${form.paymentCategory === "Online" ? "active" : ""}`}
                  onClick={() => {
                    setForm(f => ({ ...f, paymentCategory: "Online", paymentMode: f.onlineSubMethod || "UPI" }));
                  }}
                >
                  <ShoppingBag size={18} /> Online
                </button>
              </div>

              {form.paymentCategory === "Online" && (
                <div className="online-methods-box">
                  <span className="online-methods-title">
                    Select Online Method:
                  </span>
                  <div className="online-chips-row">
                    {onlinePaymentMethods.map(method => (
                      <button
                        key={method}
                        type="button"
                        className={`service-chip ${form.paymentMode === method ? "active" : ""}`}
                        onClick={() => {
                          setForm(f => ({ ...f, paymentMode: method, onlineSubMethod: method }));
                        }}
                      >
                        {method === "UPI" ? "📱 UPI (GPay / PhonePe / QR)" : method === "Card" ? "💳 Card (Debit / Credit)" : "🏦 Netbanking"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Discount Section */}
            <div className="span-2 discount-section">
              <div className="discount-header-row">
                <label className="section-field-label">
                  Discount <span className="subtotal-hint">({money(subtotal)} Subtotal)</span>
                </label>
                <div className="discount-chips-group">
                  <span className="quick-pct-label">Quick %:</span>
                  {discountPercents.map(pct => {
                    const calc = Math.round((subtotal * pct) / 100);
                    const isActive = subtotal > 0 && String(form.discount) === String(calc);
                    return (
                      <button
                        key={pct}
                        type="button"
                        className={`discount-chip ${isActive ? "active" : ""}`}
                        onClick={() => applyDiscountPercent(pct)}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                  {form.discount && Number(form.discount) > 0 && (
                    <button
                      type="button"
                      className="discount-chip clear-chip"
                      onClick={() => update("discount", "")}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="input-with-symbol">
                <span className="input-currency-symbol">₹</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal || undefined}
                  value={form.discount}
                  onChange={e => update("discount", e.target.value)}
                  placeholder="0 (or tap quick % above)"
                />
              </div>
              {subtotal > 0 && Number(form.discount) > 0 && (
                <span className="field-hint" style={{ color: "#059669", fontWeight: 600 }}>
                  Discount applied: ₹{Number(form.discount).toLocaleString("en-IN")} ({Math.round((Number(form.discount) / subtotal) * 100)}% off) • Net Payable: {money(total)}
                </span>
              )}
            </div>

            <label className="span-2">
              Invoice Description / Notes <span className="optional">Optional</span>
              <textarea
                value={form.description}
                onChange={e => update("description", e.target.value)}
                placeholder="Any special customer requests or bill notes..."
              />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={form.whatsapp}
              onChange={e => update("whatsapp", e.target.checked)}
            />
            Send itemized invoice on WhatsApp after saving
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setForm({
                  name: "",
                  mobile: "",
                  address: "",
                  items: [
                    {
                      id: `item-1`,
                      service: "Hair Wig",
                      productId: "",
                      productName: "",
                      productSize: "",
                      quantity: "1",
                      unitPrice: "",
                      amount: "",
                      note: ""
                    }
                  ],
                  discount: "",
                  paymentCategory: "Cash",
                  onlineSubMethod: "UPI",
                  paymentMode: "Cash",
                  description: "",
                  whatsapp: true
                });
                setExistingCustomer(null);
              }}
            >
              Clear
            </button>
            <button className="btn primary" type="submit" disabled={submitting}>
              <FileText size={17} />{" "}
              {submitting ? "Saving & Deducting Stock..." : `Save & Generate Invoice (${money(total)})`}
            </button>
          </div>
        </section>

        {/* Live Invoice Preview Box */}
        <aside className="panel invoice-preview">
          <div className="invoice-logo">
            <Scissors size={18} /> {settings?.shop_name || "NICE LOOKING"}
          </div>
          {settings?.shop_subtitle && (
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "-4px", marginBottom: "8px", fontWeight: 500 }}>
              {settings.shop_subtitle}
            </div>
          )}
          <span className="eyebrow">INVOICE PREVIEW</span>
          <h3>{form.name || "Customer Name"}</h3>
          <p>{form.mobile || "10-digit mobile"}</p>
          {(settings?.shop_address || settings?.shop_mobile || settings?.whatsapp_number) && (
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "12px", lineHeight: "1.4" }}>
              {(settings?.shop_mobile || settings?.whatsapp_number) && (
                <div>📞 {settings.shop_mobile || settings.whatsapp_number}</div>
              )}
              {settings?.shop_address && <div>📍 {settings.shop_address}</div>}
            </div>
          )}

          {/* Itemized Line Items in Receipt Preview */}
          <div className="receipt-items-list">
            {form.items.map((it, idx) => {
              const prod = it.service === "Hair Wig" && it.productId
                ? products.find(p => String(p.id) === String(it.productId))
                : null;
              const lineAmt = Number(it.amount) || (Number(it.unitPrice || prod?.price || 0) * Math.max(1, Number(it.quantity || 1)));

              return (
                <div key={it.id || idx} className="receipt-item-row">
                  <div className="receipt-item-info">
                    <span className="receipt-item-name">{it.service}</span>
                    <span className="receipt-item-sub">
                      {it.service === "Hair Wig" && (it.productName || prod?.name)
                        ? `${it.productName || prod?.name} (${it.productSize || prod?.size || "Standard"}) × ${it.quantity || 1}`
                        : `${it.note ? `${it.note} • ` : ""}Qty: ${it.quantity || 1}`}
                    </span>
                  </div>
                  <span className="receipt-item-amt">{money(lineAmt)}</span>
                </div>
              );
            })}
          </div>

          <div className="invoice-line">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          {Number(form.discount || 0) > 0 && (
            <div className="invoice-line" style={{ color: "#16a34a" }}>
              <span>Discount</span>
              <strong>- {money(form.discount)}</strong>
            </div>
          )}
          <div className="invoice-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <span className="muted small">Payment: {form.paymentMode}</span>
        </aside>
      </form>

      {/* Invoice Generated Success Modal */}
      {done && (
        <Modal title="Invoice Generated & Saved" onClose={() => setDone(null)}>
          <div className="success-box">
            <Sparkles size={20} />
            <div>
              <strong>{done.invoiceNumber}</strong>
              <p>Customer, billing data and wig stock update have been saved successfully.</p>
              {done.items && done.items.length > 0 && (
                <div style={{ marginTop: "8px", fontSize: "12.5px" }}>
                  <span style={{ fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "4px" }}>
                    Included Services / Items:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: "18px", color: "#475569" }}>
                    {done.items.map((it, idx) => (
                      <li key={it.id || idx}>
                        {it.service}
                        {it.service === "Hair Wig" && it.productName ? ` (${it.productName} - ${it.productSize})` : ""}
                        {" "}× {it.quantity || 1} — {money(it.amount || it.unitPrice)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {done.sendWhatsApp && (
            <button
              className="btn whatsapp full"
              type="button"
              onClick={() =>
                openWhatsApp(
                  invoiceMessage(done, settings),
                  done.mobile
                )
              }
            >
              <Send size={16} /> Send Itemized Invoice on WhatsApp
            </button>
          )}
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// 4. Invoices Component (Multi-field Search, View, Void Control, Edit & Audit)
// =====================================================================
function Invoices({ refreshTick, onDataChanged, setHeaderAction, isAdmin, userRole, actorInfo, settings }) {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all"); // "all" | "active" | "voided"
  const [period, setPeriod] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [voidModalInvoice, setVoidModalInvoice] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const discountPercents = [5, 10, 15, 20, 25];
  const todayISO = useMemo(() => getMumbaiTodayISO(), []);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([fetchInvoices(), fetchProducts()])
      .then(([invs, prods]) => {
        setInvoices(invs);
        setProducts(prods);
        setLoading(false);
      })
      .catch(err => {
        console.error("Invoices load failed:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // Period filter logic
  function checkPeriodMatch(invDateStr) {
    if (!invDateStr || period === "all") return true;
    const d = invDateStr.slice(0, 10);

    if (period === "today") {
      return d === todayISO;
    }

    if (period === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return d === formatToLocalISODate(y);
    }

    if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const minD = formatToLocalISODate(weekAgo);
      return d >= minD && d <= todayISO;
    }

    if (period === "month") {
      const currentMonthPrefix = todayISO.slice(0, 7);
      return d.startsWith(currentMonthPrefix);
    }

    if (period === "custom") {
      if (customStart && d < customStart) return false;
      if (customEnd && d > customEnd) return false;
      return true;
    }

    return true;
  }

  // Multi-field search + status tab + period filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return invoices.filter(i => {
      // 1. Status tab filter
      if (statusTab === "active" && i.isVoided) return false;
      if (statusTab === "voided" && !i.isVoided) return false;

      // 2. Period filter
      if (!checkPeriodMatch(i.createdAt)) {
        return false;
      }

      // 3. Search query filter
      if (!q) return true;
      const itemsText = (i.items || []).map(it => `${it.service} ${it.productName || ""} ${it.note || ""}`).join(" ");
      const matchText = `${i.invoiceNumber || ""} ${i.name || ""} ${i.mobile || ""} ${i.service || ""} ${itemsText} ${i.productName || ""} ${i.productSize || ""} ${i.createdAt || ""} ${i.paymentMode || ""} ${i.status || ""} ${i.voidReason || ""}`.toLowerCase();
      return matchText.includes(q);
    });
  }, [invoices, search, statusTab, period, customStart, customEnd, todayISO]);

  // Revenue computations EXCLUDE voided invoices
  const activeFiltered = useMemo(() => filtered.filter(i => !i.isVoided), [filtered]);

  const periodTotal = useMemo(() => {
    return activeFiltered.reduce((sum, i) => sum + (Number(i.amount || i.total) || 0), 0);
  }, [activeFiltered]);

  const periodCash = useMemo(() => {
    return activeFiltered
      .filter(i => String(i.paymentMode || "").toLowerCase() === "cash")
      .reduce((sum, i) => sum + (Number(i.amount || i.total) || 0), 0);
  }, [activeFiltered]);

  const periodOnline = useMemo(() => {
    return activeFiltered
      .filter(i => String(i.paymentMode || "").toLowerCase() !== "cash")
      .reduce((sum, i) => sum + (Number(i.amount || i.total) || 0), 0);
  }, [activeFiltered]);

  const activeCount = useMemo(() => invoices.filter(i => !i.isVoided).length, [invoices]);
  const voidedCount = useMemo(() => invoices.filter(i => i.isVoided).length, [invoices]);

  const selectedEditProduct = useMemo(() => {
    if (!editing || !editing.productId) return null;
    return products.find(p => String(p.id) === String(editing.productId)) || null;
  }, [editing, products]);

  const openEditModal = useCallback((inv) => {
    if (inv.isVoided) {
      return alert("Voided invoices cannot be edited.");
    }
    const isCash = String(inv.paymentMode || "").toLowerCase() === "cash";
    const sub = Number(inv.subtotal || inv.amount || inv.total || 0);
    const disc = Number(inv.discount || 0);
    const tot = Math.max(0, Number(inv.total ?? (sub - disc)));
    setEditing({
      ...inv,
      name: inv.name || "",
      mobile: inv.mobile || "",
      address: inv.address || "",
      service: inv.service || "Hair Wig",
      productId: inv.productId || "",
      productName: inv.productName || "",
      productSize: inv.productSize || "",
      quantity: Number(inv.quantity || (inv.service === "Hair Wig" ? 1 : 0)),
      amount: String(sub),
      subtotal: String(sub),
      discount: String(disc),
      total: tot,
      paymentCategory: isCash ? "Cash" : "Online",
      onlineSubMethod: ["UPI", "Card", "Netbanking"].includes(inv.paymentMode) ? inv.paymentMode : "UPI",
      paymentMode: inv.paymentMode || "Cash",
      description: inv.description || ""
    });
  }, []);

  async function handleSaveEditInvoice(e) {
    e.preventDefault();
    if (!editing) return;

    if (!editing.name || !editing.name.trim()) {
      return alert("Customer name is required.");
    }
    const cleanMobile = String(editing.mobile || "").replace(/\D/g, "");
    if (cleanMobile.length < 10) {
      return alert("A valid 10-digit mobile number is required.");
    }
    if (editing.service === "Hair Wig" && (!editing.productId || String(editing.productId).trim() === "")) {
      return alert("Please select a valid Wig Product for Hair Wig service.");
    }

    setSaving(true);
    try {
      await updateInvoice(editing, selectedEditProduct, actorInfo);
      setEditing(null);
      loadData();
      if (onDataChanged) onDataChanged();
      alert("Invoice updated successfully. Stock adjusted and audit trail recorded.");
    } catch (err) {
      console.error("Invoice update error:", err);
      alert("Could not update invoice: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVoidInvoice(e) {
    if (e) e.preventDefault();
    if (!voidModalInvoice) return;
    if (!voidReason || !voidReason.trim()) {
      return alert("A mandatory void reason is required.");
    }

    setVoiding(true);
    try {
      await voidInvoice(voidModalInvoice.id, voidReason.trim(), actorInfo);
      setVoidModalInvoice(null);
      setVoidReason("");
      loadData();
      if (onDataChanged) onDataChanged();
      alert(`Invoice #${voidModalInvoice.invoiceNumber} was successfully marked as VOIDED. Wig inventory stock was restored.`);
    } catch (err) {
      console.error("Void invoice error:", err);
      alert("Could not void invoice: " + err.message);
    } finally {
      setVoiding(false);
    }
  }

  async function handleDeleteInvoice() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteInvoice(confirmDelete.id, actorInfo);
      setConfirmDelete(null);
      loadData();
      if (onDataChanged) onDataChanged();
      alert("Invoice deleted permanently.");
    } catch (err) {
      console.error("Invoice delete error:", err);
      alert("Invoice could not be deleted: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn secondary small-btn"
          type="button"
          onClick={() => csvDownload(filtered, `nice-looking-invoices-${todayISO}.csv`)}
        >
          <Download size={14} /> Export CSV
        </button>
      );
    }
  }, [filtered, setHeaderAction, todayISO]);

  return (
    <>
      <section className="panel">
        <div className="invoices-filter-bar">
          <div className="invoices-search-status-row">
            <div className="search">
              <Search size={17} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by invoice #, customer, mobile, service, wig..."
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Status Filter Segmented Tabs: All, Active, Voided */}
            <div className="invoice-status-tabs">
              <button
                type="button"
                className={`status-tab ${statusTab === "all" ? "active" : ""}`}
                onClick={() => setStatusTab("all")}
              >
                All ({invoices.length})
              </button>
              <button
                type="button"
                className={`status-tab active-tab ${statusTab === "active" ? "active" : ""}`}
                onClick={() => setStatusTab("active")}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                className={`status-tab voided-tab ${statusTab === "voided" ? "active" : ""}`}
                onClick={() => setStatusTab("voided")}
              >
                Voided ({voidedCount})
              </button>
            </div>
          </div>

          {/* Date Period Chips with Smooth Touch Scroll */}
          <div className="invoice-period-chips-scroll">
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
            <div className="custom-date-range-row" style={{ marginTop: "8px" }}>
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

          {/* Period Summary Strip */}
          <div className="invoices-summary-strip" style={{ marginTop: "10px" }}>
            <div className="summary-strip-left">
              <span className="summary-badge-main">
                <strong>{filtered.length}</strong> {filtered.length === 1 ? "invoice" : "invoices"} found
                {voidedCount > 0 && statusTab === "all" ? ` (${activeFiltered.length} active, ${filtered.length - activeFiltered.length} voided)` : ""}
              </span>
              <span className="summary-badge-amount">
                Active Revenue: <strong>{money(periodTotal)}</strong>
              </span>
            </div>
            <div className="summary-strip-right">
              <span className="summary-sub-badge">💵 Cash: {money(periodCash)}</span>
              <span className="summary-sub-badge">📱 Online: {money(periodOnline)}</span>
            </div>
          </div>
        </div>

        {invoices.length > 0 ? (
          <>
            {/* Desktop Table View */}
            <div className="table-wrap desktop-only-table">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Services / Items</th>
                    <th>Wig Product(s)</th>
                    <th>Total</th>
                    <th>Payment & Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? (
                    filtered.map(i => {
                      const hasMulti = i.items && i.items.length > 1;
                      const wigItems = (i.items || []).filter(it => it.service === "Hair Wig" && it.productName);

                      return (
                        <tr key={i.id} style={i.isVoided ? { opacity: 0.75, background: "#fef2f2" } : {}}>
                          <td>
                            <strong>{i.invoiceNumber}</strong>
                            {i.isVoided && (
                              <span
                                className="pill danger"
                                style={{
                                  display: "inline-block",
                                  marginTop: "4px",
                                  fontSize: "10px",
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                  fontWeight: 700
                                }}
                              >
                                VOIDED
                              </span>
                            )}
                          </td>
                          <td>
                            {i.name}
                            <small>{i.mobile}</small>
                          </td>
                          <td>
                            {hasMulti ? (
                              <div>
                                <span className="pill" style={{ background: "#e0f2fe", color: "#0284c7", fontWeight: 700, marginRight: "4px" }}>
                                  {i.items.length} Items
                                </span>
                                <span style={{ fontSize: "12px", color: "#334155" }}>{i.service}</span>
                              </div>
                            ) : (
                              <span>{i.service}</span>
                            )}
                          </td>
                          <td>
                            {wigItems.length > 0 ? (
                              wigItems.map((w, idx) => (
                                <div key={idx} style={{ marginBottom: idx < wigItems.length - 1 ? "4px" : "0" }}>
                                  <strong>{w.productName}</strong>
                                  <small>
                                    {w.productSize ? `Size: ${w.productSize} • ` : ""}
                                    Qty: {w.quantity || 1}
                                  </small>
                                </div>
                              ))
                            ) : i.service === "Hair Wig" && i.productName ? (
                              <>
                                <strong>{i.productName}</strong>
                                <small>
                                  {i.productSize ? `Size: ${i.productSize} • ` : ""}
                                  Qty: {i.quantity || 1}
                                </small>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <strong style={i.isVoided ? { textDecoration: "line-through", color: "#94a3b8" } : {}}>
                              {money(i.amount || i.total)}
                            </strong>
                          </td>
                          <td>
                            {i.isVoided ? (
                              <div title={i.voidReason ? `Reason: ${i.voidReason}` : "Invoice Voided"}>
                                <span className="pill danger" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>
                                  🚫 VOIDED
                                </span>
                                {i.voidReason && (
                                  <small style={{ display: "block", color: "#b91c1c", fontSize: "10.5px", marginTop: "2px" }}>
                                    "{i.voidReason.slice(0, 20)}{i.voidReason.length > 20 ? "..." : ""}"
                                  </small>
                                )}
                              </div>
                            ) : (
                              <PaymentModeBadge mode={i.paymentMode} />
                            )}
                          </td>
                          <td>{i.createdAt}</td>
                          <td>
                            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                              <button
                                className="icon-action-btn view-action"
                                type="button"
                                title="View Itemized Breakdown"
                                onClick={() => setViewingInvoice(i)}
                              >
                                <Eye size={15} />
                              </button>

                              {!i.isVoided && (
                                <button
                                  className="icon-action-btn whatsapp-action"
                                  type="button"
                                  title="Send Itemized Invoice on WhatsApp"
                                  onClick={() =>
                                    openWhatsApp(
                                      invoiceMessage(i, settings),
                                      i.mobile
                                    )
                                  }
                                >
                                  <MessageCircle size={15} />
                                </button>
                              )}

                              {/* Edit is ONLY available for Admin / Owner */}
                              {isAdmin && !i.isVoided && (
                                <button
                                  className="icon-action-btn edit-action"
                                  type="button"
                                  title="Edit Invoice (Admin Only)"
                                  onClick={() => openEditModal(i)}
                                >
                                  <Pencil size={15} />
                                </button>
                              )}

                              {/* Void Invoice (Safe cancellation available for Staff & Admin) */}
                              {!i.isVoided && (
                                <button
                                  className="icon-action-btn void-action"
                                  type="button"
                                  style={{ color: "#dc2626" }}
                                  title="Void Invoice (Safe cancellation with reason)"
                                  onClick={() => {
                                    setVoidModalInvoice(i);
                                    setVoidReason("");
                                  }}
                                >
                                  <Ban size={15} />
                                </button>
                              )}

                              {/* Permanent Delete is strictly Admin-only */}
                              {isAdmin && (
                                <button
                                  className="icon-action-btn delete-action"
                                  type="button"
                                  title="Permanently Delete (Admin Only)"
                                  onClick={() => setConfirmDelete(i)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty-cell">
                        No invoices match your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Native Card View */}
            <div className="mobile-only-cards mobile-card-list">
              {filtered.length ? (
                filtered.map(i => {
                  const hasMulti = i.items && i.items.length > 1;

                  return (
                    <div className="mobile-card" key={i.id} style={i.isVoided ? { background: "#fef2f2", borderLeft: "4px solid #ef4444" } : {}}>
                      <div className="mobile-card-header">
                        <div>
                          <h4 className="mobile-card-title">
                            <FileText size={15} style={{ color: i.isVoided ? "#dc2626" : "var(--blue)" }} />
                            {i.invoiceNumber}
                          </h4>
                          <span className="mobile-card-sub">{i.name}</span>
                        </div>
                        <div>
                          <div
                            className="mobile-card-amount"
                            style={i.isVoided ? { textDecoration: "line-through", color: "#94a3b8" } : {}}
                          >
                            {money(i.amount || i.total)}
                          </div>
                          <div className="mobile-card-date">{i.createdAt}</div>
                        </div>
                      </div>

                      <div className="mobile-card-body">
                        <div>
                          {hasMulti ? (
                            <span className="pill" style={{ background: "#e0f2fe", color: "#0284c7", fontWeight: 700, marginRight: "6px" }}>
                              {i.items.length} Items
                            </span>
                          ) : (
                            <span className="pill" style={{ marginRight: "6px" }}>{i.service}</span>
                          )}

                          {i.isVoided ? (
                            <span className="pill danger" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>
                              🚫 VOIDED
                            </span>
                          ) : (
                            <PaymentModeBadge mode={i.paymentMode} />
                          )}

                          {hasMulti ? (
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                              {i.service}
                            </div>
                          ) : i.service === "Hair Wig" && i.productName && (
                            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                              {i.productName} ({i.productSize || "Wig"}) × {i.quantity || 1}
                            </div>
                          )}

                          {i.isVoided && i.voidReason && (
                            <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "4px" }}>
                              Void Reason: "{i.voidReason}"
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "#475569" }}>
                          <a
                            href={`tel:${i.mobile}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {i.mobile}
                          </a>
                        </div>
                      </div>

                      <div className="mobile-card-actions">
                        <button
                          className="icon-action-btn view-action"
                          type="button"
                          onClick={() => setViewingInvoice(i)}
                          title="View Invoice Breakdown"
                        >
                          <Eye size={15} />
                        </button>

                        {!i.isVoided && (
                          <button
                            className="icon-action-btn whatsapp-action"
                            type="button"
                            onClick={() =>
                              openWhatsApp(
                                invoiceMessage(i, settings),
                                i.mobile
                              )
                            }
                            title="Send Invoice on WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </button>
                        )}

                        {isAdmin && !i.isVoided && (
                          <button
                            className="icon-action-btn edit-action"
                            type="button"
                            onClick={() => openEditModal(i)}
                            title="Edit Invoice (Admin Only)"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        {!i.isVoided && (
                          <button
                            className="icon-action-btn void-action"
                            type="button"
                            style={{ color: "#dc2626" }}
                            onClick={() => {
                              setVoidModalInvoice(i);
                              setVoidReason("");
                            }}
                            title="Void Invoice"
                          >
                            <Ban size={15} />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            className="icon-action-btn delete-action"
                            type="button"
                            onClick={() => setConfirmDelete(i)}
                            title="Delete Invoice (Admin Only)"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-cell">
                  No invoices match your search query.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            <FileText size={30} />
            <strong>No invoices recorded yet</strong>
            <p>Generate a new bill from New Billing to see invoices here.</p>
          </div>
        )}
      </section>

      {/* View Itemized Invoice Breakdown Modal */}
      {viewingInvoice && (
        <Modal
          title={`Invoice Details: ${viewingInvoice.invoiceNumber}`}
          onClose={() => setViewingInvoice(null)}
        >
          <div className="view-invoice-modal-content">
            {/* If Voided, display prominent warning banner */}
            {viewingInvoice.isVoided && (
              <div
                className="alert danger"
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  borderColor: "#f87171",
                  marginBottom: "14px",
                  padding: "12px 14px",
                  borderRadius: "8px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700", fontSize: "14px" }}>
                  <Ban size={18} />
                  <span>THIS INVOICE HAS BEEN VOIDED</span>
                </div>
                <div style={{ fontSize: "12px", marginTop: "4px" }}>
                  Voided on: <strong>{viewingInvoice.voidedAt || viewingInvoice.rawVoidedAt || "—"}</strong>
                  {viewingInvoice.voidedByName ? ` by ${viewingInvoice.voidedByName}` : ""}
                </div>
                {viewingInvoice.voidReason && (
                  <div style={{ fontSize: "12px", marginTop: "3px", fontStyle: "italic" }}>
                    Reason: "{viewingInvoice.voidReason}"
                  </div>
                )}
                <div style={{ fontSize: "11px", marginTop: "4px", opacity: 0.9 }}>
                  • Inventory stock was restored and this invoice is excluded from revenue calculations.
                </div>
              </div>
            )}

            {/* Dynamic Business Shop Header */}
            <div className="view-invoice-shop-header" style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "19px", fontWeight: 800, color: "var(--navy, #0f172a)", letterSpacing: "-0.02em" }}>
                    {viewingInvoice.shopSettings?.shop_name || settings?.shop_name || "NICE LOOKING"}
                  </h3>
                  {(viewingInvoice.shopSettings?.shop_subtitle || settings?.shop_subtitle) && (
                    <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, marginTop: "2px" }}>
                      {viewingInvoice.shopSettings?.shop_subtitle || settings?.shop_subtitle}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: "12px", color: "#475569" }}>
                  {(viewingInvoice.shopSettings?.shop_mobile || viewingInvoice.shopSettings?.whatsapp_number || settings?.shop_mobile || settings?.whatsapp_number) && (
                    <div>Contact: <strong>{viewingInvoice.shopSettings?.shop_mobile || viewingInvoice.shopSettings?.whatsapp_number || settings?.shop_mobile || settings?.whatsapp_number}</strong></div>
                  )}
                  {(viewingInvoice.shopSettings?.shop_address || settings?.shop_address) && (
                    <div style={{ maxWidth: "260px", color: "#64748b", marginTop: "2px" }}>
                      {viewingInvoice.shopSettings?.shop_address || settings?.shop_address}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="view-invoice-header">
              <div>
                <h4>{viewingInvoice.invoiceNumber}</h4>
                <span>Date: {viewingInvoice.createdAt}</span>
              </div>
              {viewingInvoice.isVoided ? (
                <span className="pill danger" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>
                  🚫 VOIDED
                </span>
              ) : (
                <PaymentModeBadge mode={viewingInvoice.paymentMode} />
              )}
            </div>

            <div className="view-invoice-cust-box">
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                Customer Information
              </span>
              <div className="view-invoice-cust-grid">
                <div>
                  <span style={{ color: "#64748b" }}>Name: </span>
                  <strong>{viewingInvoice.name}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b" }}>Mobile: </span>
                  <strong>{viewingInvoice.mobile}</strong>
                </div>
                {viewingInvoice.address && (
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "#64748b" }}>Address: </span>
                    <strong>{viewingInvoice.address}</strong>
                  </div>
                )}
                {viewingInvoice.description && (
                  <div style={{ gridColumn: "span 2", marginTop: "4px" }}>
                    <span style={{ color: "#64748b" }}>Notes: </span>
                    <span style={{ fontStyle: "italic", color: "#334155" }}>{viewingInvoice.description}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="view-invoice-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Service / Product</th>
                    <th>Unit Price</th>
                    <th>Qty</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingInvoice.items || []).map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{it.service}</strong>
                        {it.service === "Hair Wig" && it.productName && (
                          <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            {it.productName} ({it.productSize || "Standard"})
                          </div>
                        )}
                        {it.note && (
                          <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                            Note: {it.note}
                          </div>
                        )}
                      </td>
                      <td>{money(it.unitPrice || Math.round(Number(it.amount || 0) / Math.max(1, Number(it.quantity || 1))))}</td>
                      <td>{it.quantity || 1}</td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{money(it.amount || (Number(it.unitPrice || 0) * Number(it.quantity || 1)))}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="view-invoice-summary-box">
              <div className="view-invoice-summary-row">
                <span>Subtotal</span>
                <strong>{money(viewingInvoice.subtotal || viewingInvoice.amount || viewingInvoice.total)}</strong>
              </div>
              {Number(viewingInvoice.discount || 0) > 0 && (
                <div className="view-invoice-summary-row" style={{ color: "#16a34a" }}>
                  <span>Discount</span>
                  <strong>- {money(viewingInvoice.discount)}</strong>
                </div>
              )}
              <div className="view-invoice-summary-row total-row">
                <span>Grand Total</span>
                <strong style={viewingInvoice.isVoided ? { textDecoration: "line-through", color: "#94a3b8" } : {}}>
                  {money(viewingInvoice.total || viewingInvoice.amount)}
                </strong>
              </div>
            </div>

            <div className="form-actions no-print">
              <button
                className="btn secondary"
                type="button"
                onClick={() => setViewingInvoice(null)}
              >
                Close
              </button>
              <button
                className="btn secondary"
                type="button"
                title="Print Invoice Receipt"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Print Invoice
              </button>
              {!viewingInvoice.isVoided && (
                <button
                  className="btn whatsapp"
                  type="button"
                  onClick={() =>
                    openWhatsApp(
                      invoiceMessage(viewingInvoice, settings),
                      viewingInvoice.mobile
                    )
                  }
                >
                  <Send size={15} /> Send on WhatsApp
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Void Invoice Confirmation Modal (With Required Reason) */}
      {voidModalInvoice && (
        <Modal
          title={`Void Invoice #${voidModalInvoice.invoiceNumber}`}
          onClose={() => {
            setVoidModalInvoice(null);
            setVoidReason("");
          }}
        >
          <form onSubmit={handleVoidInvoice}>
            <div
              className="warning-box"
              style={{
                background: "#fff1f2",
                borderColor: "#fecdd3",
                color: "#9f1239",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "14px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, marginBottom: "6px", fontSize: "14px" }}>
                <AlertTriangle size={18} />
                <span>Confirm Void Invoice Action</span>
              </div>
              <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#881337" }}>
                Are you sure you want to void invoice <strong>{voidModalInvoice.invoiceNumber}</strong> for{" "}
                <strong>{voidModalInvoice.name}</strong> (Total: {money(voidModalInvoice.total || voidModalInvoice.amount)})?
              </p>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: "1.5" }}>
                <li>This will mark the invoice as <strong>VOIDED</strong> in the ledger.</li>
                <li>If this bill included Hair Wigs, stock will be <strong>automatically returned to inventory</strong> exactly once.</li>
                <li>The invoice history and audit trail will remain intact for owner audit compliance.</li>
              </ul>
            </div>

            <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
              Reason for Voiding * (Required)
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="Specify reason (e.g. Customer cancelled order, incorrect billing amount entered, duplicate bill)..."
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  fontFamily: "inherit"
                }}
              />
            </label>

            <div className="form-actions" style={{ marginTop: "16px" }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setVoidModalInvoice(null);
                  setVoidReason("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                type="submit"
                disabled={voiding || !voidReason.trim()}
              >
                {voiding ? "Voiding Invoice..." : "Confirm & Void Invoice"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Invoice Modal (Admin Only) */}
      {editing && (
        <Modal
          title={`Edit Invoice ${editing.invoiceNumber}`}
          onClose={() => setEditing(null)}
        >
          <form className="form-panel" onSubmit={handleSaveEditInvoice}>
            <div className="form-grid">
              <label>
                Customer Name *
                <input
                  required
                  value={editing.name || ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, name: e.target.value }))
                  }
                />
              </label>

              <label>
                Contact Number * (10 Digits)
                <input
                  required
                  type="tel"
                  maxLength={10}
                  inputMode="numeric"
                  value={editing.mobile || ""}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setEditing(x => ({ ...x, mobile: digits }));
                  }}
                  placeholder="10-digit mobile number"
                />
              </label>

              <label className="span-2">
                Address
                <input
                  value={editing.address || ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, address: e.target.value }))
                  }
                />
              </label>

              <label className="span-2">
                Service Type
                <select
                  value={editing.service}
                  onChange={e => {
                    const nextSvc = e.target.value;
                    const isWig = nextSvc === "Hair Wig";
                    const defaultProd = isWig ? (products.find(p => String(p.id) === String(editing.productId)) || products[0] || null) : null;
                    const qty = isWig ? Math.max(1, Number(editing.quantity || 1)) : 0;
                    const newSub = isWig && defaultProd ? Number(defaultProd.price) * qty : Number(editing.amount || 0);
                    const disc = Number(editing.discount || 0);
                    setEditing(x => ({
                      ...x,
                      service: nextSvc,
                      productId: isWig ? (defaultProd?.id || "") : "",
                      productName: isWig ? (defaultProd?.name || "") : "",
                      productSize: isWig ? (defaultProd?.size || "") : "",
                      quantity: qty,
                      amount: String(newSub),
                      subtotal: String(newSub),
                      total: Math.max(0, newSub - disc)
                    }));
                  }}
                >
                  {services.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {editing.service === "Hair Wig" && (
                <label>
                  Wig Product *
                  <select
                    required
                    value={editing.productId || ""}
                    onChange={e => {
                      const pid = e.target.value;
                      const p = products.find(prod => String(prod.id) === String(pid));
                      const qty = Math.max(1, Number(editing.quantity || 1));
                      const newSub = p ? Number(p.price) * qty : Number(editing.amount || 0);
                      const disc = Number(editing.discount || 0);
                      setEditing(x => ({
                        ...x,
                        productId: pid,
                        productName: p ? p.name : "",
                        productSize: p ? p.size : "",
                        amount: String(newSub),
                        subtotal: String(newSub),
                        total: Math.max(0, newSub - disc)
                      }));
                    }}
                  >
                    <option value="">Select Wig Product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} • {p.size} (Stock: {p.stock})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {editing.service === "Hair Wig" && (
                <label>
                  Quantity *
                  <input
                    required
                    type="number"
                    min="1"
                    value={editing.quantity || 1}
                    onChange={e => {
                      const val = e.target.value;
                      const qty = Math.max(1, Number(val || 1));
                      const prod = products.find(p => String(p.id) === String(editing.productId));
                      const newSub = prod ? Number(prod.price) * qty : Number(editing.amount || 0);
                      const disc = Number(editing.discount || 0);
                      setEditing(x => ({
                        ...x,
                        quantity: val,
                        amount: String(newSub),
                        subtotal: String(newSub),
                        total: Math.max(0, newSub - disc)
                      }));
                    }}
                  />
                </label>
              )}

              {/* Edit Payment Mode Selection */}
              <div className="span-2" style={{ marginBottom: "6px" }}>
                <label style={{ marginBottom: "8px" }}>Payment Mode</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className={`payment-mode-btn ${editing.paymentCategory === "Cash" ? "active" : ""}`}
                    onClick={() => {
                      setEditing(x => ({ ...x, paymentCategory: "Cash", paymentMode: "Cash" }));
                    }}
                  >
                    <BadgeIndianRupee size={17} /> Cash
                  </button>
                  <button
                    type="button"
                    className={`payment-mode-btn ${editing.paymentCategory === "Online" ? "active" : ""}`}
                    onClick={() => {
                      setEditing(x => ({ ...x, paymentCategory: "Online", paymentMode: x.onlineSubMethod || "UPI" }));
                    }}
                  >
                    <ShoppingBag size={17} /> Online
                  </button>
                </div>

                {editing.paymentCategory === "Online" && (
                  <div style={{ marginTop: "10px", padding: "12px 14px", background: "#f1f5f9", borderRadius: "10px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "8px" }}>
                      Select Online Method:
                    </span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {onlinePaymentMethods.map(method => (
                        <button
                          key={method}
                          type="button"
                          className={`service-chip ${editing.paymentMode === method ? "active" : ""}`}
                          onClick={() => {
                            setEditing(x => ({ ...x, paymentMode: method, onlineSubMethod: method }));
                          }}
                        >
                          {method === "UPI" ? "📱 UPI" : method === "Card" ? "💳 Card" : "🏦 Netbanking"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label>
                Amount (Subtotal ₹) *
                <div className="input-with-symbol">
                  <span className="input-currency-symbol">₹</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={editing.amount ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      const sub = Number(val || 0);
                      const disc = Number(editing.discount || 0);
                      setEditing(x => ({
                        ...x,
                        amount: val,
                        subtotal: val,
                        total: Math.max(0, sub - disc)
                      }));
                    }}
                  />
                </div>
              </label>

              <div className="span-2">
                <div className="discount-quick-row">
                  <label style={{ margin: 0 }}>Discount (₹ or Quick %)</label>
                  <div className="discount-chips-group">
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>Quick %:</span>
                    {discountPercents.map(pct => {
                      const baseAmt = Number(editing.amount || editing.subtotal || 0);
                      const calc = Math.round((baseAmt * pct) / 100);
                      const isActive = baseAmt > 0 && String(editing.discount) === String(calc);
                      return (
                        <button
                          key={pct}
                          type="button"
                          className={`discount-chip ${isActive ? "active" : ""}`}
                          onClick={() => {
                            const sub = Number(editing.amount || editing.subtotal || 0);
                            setEditing(x => ({
                              ...x,
                              discount: String(calc),
                              total: Math.max(0, sub - calc)
                            }));
                          }}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                    {editing.discount && Number(editing.discount) > 0 && (
                      <button
                        type="button"
                        className="discount-chip clear-chip"
                        onClick={() => {
                          const sub = Number(editing.amount || editing.subtotal || 0);
                          setEditing(x => ({
                            ...x,
                            discount: "",
                            total: sub
                          }));
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="input-with-symbol">
                  <span className="input-currency-symbol">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={editing.discount ?? ""}
                    onChange={e => {
                      const discVal = e.target.value;
                      const sub = Number(editing.amount || editing.subtotal || 0);
                      const disc = Number(discVal || 0);
                      setEditing(x => ({
                        ...x,
                        discount: discVal,
                        total: Math.max(0, sub - disc)
                      }));
                    }}
                    placeholder="0 (or tap quick % above)"
                  />
                </div>
                {Number(editing.amount || 0) > 0 && (
                  <span className="field-hint" style={{ color: "#059669", fontWeight: 600 }}>
                    Net Payable: ₹{Math.max(0, Number(editing.amount || 0) - Number(editing.discount || 0)).toLocaleString("en-IN")}
                    {Number(editing.discount || 0) > 0 ? ` (₹${Number(editing.discount).toLocaleString("en-IN")} discount applied)` : ""}
                  </span>
                )}
              </div>

              <label className="span-2">
                Description / Notes
                <textarea
                  value={editing.description || ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, description: e.target.value }))
                  }
                />
              </label>
            </div>

            {editing.service === "Hair Wig" && (
              <div className="consent-note">
                Stock changes will automatically adjust in Supabase based on the updated product or quantity, and this change will be logged in the Owner Audit Logs.
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal (Admin Only) */}
      {confirmDelete && (
        <Modal title="Delete Invoice?" onClose={() => setConfirmDelete(null)}>
          <div className="warning-box">
            <strong>
              Are you sure you want to permanently delete invoice {confirmDelete.invoiceNumber}?
            </strong>
            <p>
              This erases the invoice permanently. Note: Voiding is recommended over permanent deletion to maintain financial compliance.
            </p>
          </div>
          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={handleDeleteInvoice}
              disabled={saving}
            >
              {saving ? "Deleting..." : "Permanently Delete Invoice"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// 5. Wig Products Component (Supabase CRUD & Exact Sizes)
// =====================================================================
function Products({ refreshTick, onDataChanged, setHeaderAction, isAdmin, userRole, actorInfo }) {
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const blank = {
    name: "",
    size: "5x7",
    price: "",
    stock: "",
    type: "Human Hair",
    color: "Natural Black",
    description: ""
  };

  const loadData = useCallback(() => {
    setLoading(true);
    fetchProducts()
      .then(prods => {
        setProducts(prods || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Products load failed:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  function openAdd() {
    setEditing({ ...blank });
    setIsEditing(false);
    setModal(true);
  }

  function openEdit(product) {
    setEditing({ ...product });
    setIsEditing(true);
    setModal(true);
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    if (!editing || !editing.name || !editing.name.trim()) {
      return alert("Wig Product Name is required.");
    }
    setSaving(true);
    try {
      await saveProduct(editing, actorInfo);
      setModal(false);
      setEditing(null);
      setIsEditing(false);
      await loadData();
      if (onDataChanged) onDataChanged();
      alert(isEditing ? "Wig product updated successfully." : "New wig stock saved successfully.");
    } catch (err) {
      console.error("Product save failed:", err);
      alert("Failed to save wig stock: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteProduct(confirmDelete.id, actorInfo);
      setConfirmDelete(null);
      await loadData();
      if (onDataChanged) onDataChanged();
      alert("Wig product deleted successfully.");
    } catch (err) {
      console.error("Product delete failed:", err);
      alert("Wig product could not be deleted: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(null);
    }
  }, [setHeaderAction]);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Wig Products & Stock Management</h3>
            <p>Supported sizes: 5x7, 5x8, 6x8, 7x9, 8x10 • Track inventory and prices</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              className="btn primary"
              type="button"
              onClick={openAdd}
            >
              <Plus size={16} /> Add Wig Stock
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => csvDownload(products, "nice-looking-wig-products.csv")}
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="table-wrap desktop-only-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Hair Type</th>
                <th>Color</th>
                <th>Actual Size</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.length ? (
                products.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.type}</td>
                    <td>{p.color}</td>
                    <td>
                      <span className="pill">{p.size || "—"}</span>
                    </td>
                    <td>
                      <strong>{money(p.price)}</strong>
                    </td>
                    <td>
                      <strong style={p.stock <= 2 ? { color: "#dc2626" } : {}}>{p.stock}</strong>
                    </td>
                    <td>
                      <span className={`pill ${p.stock < 4 ? "warning" : ""}`}>
                        {p.stock > 0 ? "Available" : "Out of stock"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn secondary small-btn"
                          type="button"
                          onClick={() => openEdit(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn danger small-btn"
                          type="button"
                          onClick={() => setConfirmDelete(p)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="empty-cell">
                    {loading ? "Loading products..." : "No wig products found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Native Card View */}
        <div className="mobile-only-cards mobile-card-list">
          {products.length ? (
            products.map(p => (
              <div className="mobile-card" key={p.id}>
                <div className="mobile-card-header">
                  <div>
                    <h4 className="mobile-card-title">{p.name}</h4>
                    <span className="mobile-card-sub">{p.type} • {p.color}</span>
                  </div>
                  <div>
                    <div className="mobile-card-amount">{money(p.price)}</div>
                    <div className="mobile-card-date">Size: {p.size || "—"}</div>
                  </div>
                </div>

                <div className="mobile-card-body">
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span>Stock: <strong>{p.stock} units</strong></span>
                  </div>
                  <span className={`pill ${p.stock < 4 ? "warning" : "success"}`}>
                    {p.stock > 0 ? "In Stock" : "Out of stock"}
                  </span>
                </div>

                <div className="mobile-card-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => openEdit(p)}
                  >
                    Edit / Update Stock
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => setConfirmDelete(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-cell">
              {loading ? "Loading products..." : "No wig products found."}
            </div>
          )}
        </div>
      </section>

      {/* Add / Edit Wig Stock Modal */}
      {modal && (
        <Modal
          title={isEditing ? "Edit Wig Product & Stock" : "Add Wig Stock"}
          onClose={() => {
            setModal(false);
            setEditing(null);
            setIsEditing(false);
          }}
        >
          <form className="form-panel" onSubmit={handleSaveProduct}>
            <label>
              Wig Product Name *
              <input
                required
                value={editing?.name || ""}
                onChange={e =>
                  setEditing(x => ({ ...x, name: e.target.value }))
                }
                placeholder="e.g. Premium Natural Wig"
              />
            </label>

            <div className="form-grid">
              <label>
                Wig Size *
                <input
                  required
                  value={editing?.size || ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, size: e.target.value }))
                  }
                  placeholder="e.g. 5x7, 5x8, 6x8, 7x9, 8x10"
                />
              </label>

              <label>
                Price (₹) *
                <input
                  required
                  type="number"
                  min="0"
                  value={editing?.price ?? ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, price: e.target.value }))
                  }
                  placeholder="12000"
                />
              </label>

              <label>
                Quantity / Stock *
                <input
                  required
                  type="number"
                  min="0"
                  value={editing?.stock ?? ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, stock: e.target.value }))
                  }
                  placeholder="5"
                />
              </label>

              <label>
                Hair Type
                <select
                  value={editing?.type || "Human Hair"}
                  onChange={e =>
                    setEditing(x => ({ ...x, type: e.target.value }))
                  }
                >
                  <option value="Human Hair">Human Hair</option>
                  <option value="Synthetic">Synthetic</option>
                  <option value="Blended">Blended</option>
                </select>
              </label>

              <label className="span-2">
                Color
                <input
                  value={editing?.color || "Natural Black"}
                  onChange={e =>
                    setEditing(x => ({ ...x, color: e.target.value }))
                  }
                  placeholder="e.g. Natural Black / Dark Brown"
                />
              </label>

              <label className="span-2">
                Description (Optional)
                <textarea
                  rows={2}
                  value={editing?.description || ""}
                  onChange={e =>
                    setEditing(x => ({ ...x, description: e.target.value }))
                  }
                  placeholder="Optional notes or details about this wig product..."
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setModal(false);
                  setEditing(null);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : isEditing ? "Save Changes" : "Save Wig Stock"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Product Confirmation Modal */}
      {confirmDelete && (
        <Modal
          title="Delete Wig Product?"
          onClose={() => setConfirmDelete(null)}
        >
          <div className="warning-box">
            <strong>Are you sure you want to delete {confirmDelete.name}?</strong>
            <p>
              This deactivates the wig product from future billing. Existing invoices and
              historical sales records will remain preserved.
            </p>
          </div>
          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={handleDeleteProduct}
              disabled={saving}
            >
              {saving ? "Deleting..." : "Permanently Deactivate Product"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// =====================================================================
// 6A. Offers & Promotional Campaigns Component
// =====================================================================
function Offers({ refreshTick, isAdmin = true, settings }) {
  const [customers, setCustomers] = useState([]);
  const [offer, setOffer] = useState({
    title: "Hair Wig Special Festive Offer",
    description: "Get special pricing and free styling consultation on all Hair Wigs.",
    discount: "20",
    validUntil: ""
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCustomers()
      .then(custs => {
        if (active) {
          // Filter opted-in customers with valid phone numbers
          const optedIn = custs.filter(
            c => (c.whatsapp_opt_in ?? true) && normalizeWhatsAppNumber(c.mobile)
          );
          setCustomers(optedIn);
        }
      })
      .catch(err => console.error("Offers customer fetch error:", err));
    return () => {
      active = false;
    };
  }, [refreshTick]);

  async function handleSendAll() {
    if (!customers.length) {
      return alert("No opted-in customers with valid phone numbers found.");
    }
    if (
      !confirm(
        `Send this offer to ${customers.length} opted-in customer(s)?`
      )
    ) {
      return;
    }

    setSending(true);
    const msg = offerMessage(offer, settings);

    // Open WhatsApp link for first customer or show instructions
    if (customers.length === 1) {
      openWhatsApp(msg, customers[0].mobile);
    } else {
      openWhatsApp(msg, customers[0].mobile);
      alert(
        `Started WhatsApp chat for ${customers[0].name} (${customers[0].mobile}). For automated bulk broadcasting, deploy the included Supabase WhatsApp Edge Function.`
      );
    }
    setSending(false);
  }

  return (
    <>
      <div className="grid-2">
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <h3>Special Promotional Offers</h3>
              <p>Audience: {customers.length} opted-in customer(s)</p>
            </div>
          </div>

          <label>
            Offer Title
            <input
              value={offer.title}
              onChange={e => setOffer({ ...offer, title: e.target.value })}
            />
          </label>

          <label>
            Description
            <textarea
              value={offer.description}
              onChange={e => setOffer({ ...offer, description: e.target.value })}
            />
          </label>

          <div className="form-grid">
            <label>
              Discount %
              <input
                type="number"
                value={offer.discount}
                onChange={e => setOffer({ ...offer, discount: e.target.value })}
              />
            </label>
            <label>
              Valid Until
              <input
                type="date"
                value={offer.validUntil}
                onChange={e => setOffer({ ...offer, validUntil: e.target.value })}
              />
            </label>
          </div>

          <div className="consent-note">
            In compliance with WhatsApp Business policies, promotional messages are
            only addressed to customers who gave opt-in consent.
          </div>

          <button
            className="btn whatsapp full"
            disabled={sending || !customers.length}
            type="button"
            onClick={handleSendAll}
          >
            <Send size={16} />
            {sending
              ? "Preparing..."
              : `Send Offer to Opted-in Customers (${customers.length})`}
          </button>
        </section>

        <section className="panel phone-preview">
          <div className="preview-head">
            <Percent size={18} style={{ color: "#16a34a" }} /> WhatsApp Offer Preview
          </div>
          <div className="wa-message">{offerMessage(offer)}</div>
        </section>
      </div>
    </>
  );
}

// =====================================================================
// 6B. WhatsApp Direct Communicator & Template Hub Component
// =====================================================================
function WhatsAppPage({ refreshTick }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [templateKey, setTemplateKey] = useState("reminder");
  const [customText, setCustomText] = useState("");
  const [serviceName, setServiceName] = useState("Hair Wig Consultation");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [optInFilter, setOptInFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCustomers()
      .then(custs => {
        if (active) {
          setCustomers(custs);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("WhatsAppPage customer fetch error:", err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  function handleSelectCustomer(cId) {
    setSelectedCustomerId(cId);
    if (!cId) {
      setRecipientPhone("");
      setRecipientName("");
      return;
    }
    const cust = customers.find(c => String(c.id) === String(cId));
    if (cust) {
      setRecipientPhone(cust.mobile || "");
      setRecipientName(cust.name || "");
    }
  }

  const messageBody = useMemo(() => {
    const name = recipientName.trim() || "Valued Client";
    if (templateKey === "reminder") {
      return [
        `Hello ${name},`,
        "",
        `This is a friendly reminder from NICE LOOKING for your upcoming *${serviceName}*${appointmentDate ? ` on ${appointmentDate}` : ""}.`,
        "",
        "Please let us know if you need to reschedule or have any questions.",
        "",
        "Thank you,",
        "NICE LOOKING – Hair Wig & Hair Services"
      ].join("\n");
    }

    if (templateKey === "service_due") {
      return [
        `Hello ${name},`,
        "",
        "Your Hair Wig regular maintenance & styling service is due at NICE LOOKING.",
        "",
        "Regular washing, conditioning, and color refreshment keeps your wig looking natural and vibrant.",
        "",
        "Visit our salon or reply here to book your slot.",
        "",
        "Best regards,",
        "NICE LOOKING – Hair Wig & Hair Services"
      ].join("\n");
    }

    if (templateKey === "feedback") {
      return [
        `Hello ${name},`,
        "",
        "Thank you for choosing NICE LOOKING!",
        "",
        "How was your recent experience with our hair wig services? Your feedback means the world to us.",
        "",
        "Warm regards,",
        "NICE LOOKING Team"
      ].join("\n");
    }

    return (
      customText.trim() ||
      `Hello ${name},\n\nGreetings from NICE LOOKING Hair Wig & Services!`
    );
  }, [recipientName, templateKey, serviceName, appointmentDate, customText]);

  function handleSendWhatsApp(phone, text) {
    const targetPhone = phone || recipientPhone;
    if (!targetPhone) {
      return alert("Please enter or select a customer phone number.");
    }
    openWhatsApp(text || messageBody, targetPhone);
  }

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (optInFilter === "opted-in" && c.whatsapp_opt_in === false) return false;
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        const m = (c.mobile || "").toLowerCase();
        const n = (c.name || "").toLowerCase();
        return m.includes(q) || n.includes(q);
      }
      return true;
    });
  }, [customers, optInFilter, filterQuery]);

  return (
    <>
      <div className="grid-2">
        <section className="panel form-panel">
          <div className="panel-head">
            <div>
              <h3>WhatsApp Message Composer</h3>
              <p>Direct 1-to-1 client communicator & quick service templates</p>
            </div>
          </div>

          <label>
            Select Customer (Optional)
            <select
              value={selectedCustomerId}
              onChange={e => handleSelectCustomer(e.target.value)}
            >
              <option value="">-- Choose from existing customers --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.mobile}) {c.whatsapp_opt_in === false ? "⚠️ No Opt-in" : "✓ WA Opt-in"}
                </option>
              ))}
            </select>
          </label>

          <div className="form-grid">
            <label>
              Recipient Name
              <input
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
              />
            </label>

            <label>
              Mobile / WhatsApp Number *
              <input
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value)}
                placeholder="e.g. 9876543210"
              />
            </label>
          </div>

          <label>
            Message Template
            <select
              value={templateKey}
              onChange={e => setTemplateKey(e.target.value)}
            >
              <option value="reminder">📅 Appointment & Consultation Reminder</option>
              <option value="service_due">✂️ Wig Maintenance & Service Due</option>
              <option value="feedback">🌟 Customer Care & Feedback Note</option>
              <option value="custom">✏️ Custom Message Text</option>
            </select>
          </label>

          {templateKey === "reminder" && (
            <div className="form-grid">
              <label>
                Service / Consultation
                <input
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="Hair Wig Fitting"
                />
              </label>
              <label>
                Appointment Date
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={e => setAppointmentDate(e.target.value)}
                />
              </label>
            </div>
          )}

          {templateKey === "custom" && (
            <label>
              Custom Message Text
              <textarea
                rows={4}
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="Type your custom WhatsApp message here..."
              />
            </label>
          )}

          <div className="consent-note">
            <MessageCircle size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "4px", color: "#16a34a" }} />
            Clicking <strong>Open WhatsApp Chat</strong> directly launches WhatsApp Web / Desktop / Mobile app with your pre-filled text.
          </div>

          <button
            type="button"
            className="btn whatsapp full"
            disabled={!recipientPhone.trim()}
            onClick={() => handleSendWhatsApp()}
          >
            <Send size={16} /> Open WhatsApp Chat
          </button>
        </section>

        <section className="panel phone-preview">
          <div className="preview-head">
            <MessageCircle size={18} style={{ color: "#16a34a" }} /> WhatsApp Live Message Preview
          </div>
          <div className="wa-message">{messageBody}</div>
        </section>
      </div>

      <section className="panel table-panel" style={{ marginTop: "20px" }}>
        <div className="panel-head">
          <div>
            <h3>Customer WhatsApp Directory</h3>
            <p>1-Click direct chat access for all registered clients ({filteredCustomers.length})</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="search-bar" style={{ minWidth: "220px" }}>
              <Search size={15} />
              <input
                type="text"
                placeholder="Search name / phone..."
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
              />
            </div>
            <select
              value={optInFilter}
              onChange={e => setOptInFilter(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: "8px", fontSize: "12px", border: "1px solid var(--border)", background: "#fff" }}
            >
              <option value="all">All Clients ({customers.length})</option>
              <option value="opted-in">Opted-in Only ({customers.filter(c => c.whatsapp_opt_in !== false).length})</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                <th>WhatsApp Opt-In</th>
                <th>Total Spent</th>
                <th>Quick Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length ? (
                filteredCustomers.map(cust => (
                  <tr key={cust.id}>
                    <td>
                      <strong>{cust.name}</strong>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "13px" }}>{cust.mobile}</span>
                    </td>
                    <td>
                      <span className={`pill ${cust.whatsapp_opt_in !== false ? "success" : "warning"}`}>
                        {cust.whatsapp_opt_in !== false ? "✓ Opted-in" : "⚠️ No Opt-in"}
                      </span>
                    </td>
                    <td>
                      <strong>₹{Number(cust.totalSpent || 0).toLocaleString("en-IN")}</strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn whatsapp small-btn"
                        onClick={() => {
                          handleSelectCustomer(cust.id);
                          openWhatsApp(`Hello ${cust.name},\n\nThank you for choosing NICE LOOKING Hair Wig & Services. How can we assist you today?`, cust.mobile);
                        }}
                      >
                        <Send size={13} /> Chat
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-cell">
                    {loading ? "Loading clients..." : "No customers found matching filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// =====================================================================
// 7. Reports Component
// =====================================================================
function Reports({ refreshTick, setHeaderAction }) {
  const [invoices, setInvoices] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchInvoices(), fetchCustomers()])
      .then(([invs, custs]) => {
        if (!active) return;
        setInvoices(invs);
        setCustomerCount(custs.length);
        setLoading(false);
      })
      .catch(err => {
        console.error("Reports load failed:", err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  const activeInvoices = invoices.filter(r => !r.isVoided && r.status !== "VOIDED");
  const total = activeInvoices.reduce((s, r) => s + Number(r.amount || 0), 0);
  const cash = activeInvoices
    .filter(r => r.paymentMode === "Cash")
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const online = activeInvoices
    .filter(r => ["UPI", "Card", "Netbanking", "Online"].includes(r.paymentMode))
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  useEffect(() => {
    if (setHeaderAction) {
      setHeaderAction(
        <button
          className="btn secondary small-btn"
          type="button"
          onClick={() => csvDownload(activeInvoices, "nice-looking-active-sales-report.csv")}
        >
          <Download size={14} /> Export CSV
        </button>
      );
    }
  }, [activeInvoices, setHeaderAction]);

  return (
    <>

      <div className="kpi-grid">
        <Kpi
          icon={IndianRupee}
          label="Total Revenue"
          value={money(total)}
          note="Active billing revenue"
        />
        <Kpi
          icon={BadgeIndianRupee}
          label="Cash"
          value={money(cash)}
          note="Cash collections"
        />
        <Kpi
          icon={ShoppingBag}
          label="Online"
          value={money(online)}
          note="UPI + Card + Netbanking"
        />
        <Kpi
          icon={Users}
          label="Customers"
          value={customerCount}
          note="Total client base"
        />
      </div>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h3>Sales Transactions</h3>
            <p>Exportable billing records ({activeInvoices.length} active bills)</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length ? (
                invoices.map((r, i) => (
                  <tr key={r.id || i} style={r.isVoided ? { opacity: 0.7, background: "#fef2f2" } : {}}>
                    <td>
                      <strong>{r.invoiceNumber}</strong>
                      {r.isVoided && (
                        <span className="pill danger" style={{ display: "inline-block", marginLeft: "6px", fontSize: "10px" }}>
                          VOIDED
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.mobile}</small>
                    </td>
                    <td>{r.service}</td>
                    <td>
                      <strong style={r.isVoided ? { textDecoration: "line-through", color: "#94a3b8" } : {}}>
                        {money(r.amount)}
                      </strong>
                    </td>
                    <td>
                      {r.isVoided ? <span className="pill danger">🚫 Voided</span> : <PaymentModeBadge mode={r.paymentMode} />}
                    </td>
                    <td>{r.createdAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    {loading ? "Loading report data..." : "No sales records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// =====================================================================
// 8. Settings Component (Supabase Persistence)
// =====================================================================
function SettingsPage({ actorInfo, isAdmin = true, onSettingsSaved }) {
  const [form, setForm] = useState({
    shop_name: "NICE LOOKING",
    shop_subtitle: "Hair Wig & Hair Services",
    shop_mobile: "+91 98765 43210",
    shop_address: "Mumbai, Maharashtra",
    invoice_prefix: "NL",
    whatsapp_number: "919876543210"
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then(data => {
        if (data) {
          setForm({
            shop_name: data.shop_name || "",
            shop_subtitle: data.shop_subtitle || "",
            shop_mobile: data.shop_mobile || "",
            whatsapp_number: data.whatsapp_number || "",
            shop_address: data.shop_address || "",
            invoice_prefix: data.invoice_prefix || "NL"
          });
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Settings load error:", err);
        setLoading(false);
      });
  }, []);

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await saveSettings(form, actorInfo);
      if (saved) {
        setForm({
          shop_name: saved.shop_name || "",
          shop_subtitle: saved.shop_subtitle || "",
          shop_mobile: saved.shop_mobile || "",
          whatsapp_number: saved.whatsapp_number || "",
          shop_address: saved.shop_address || "",
          invoice_prefix: saved.invoice_prefix || "NL"
        });
      }
      if (onSettingsSaved) onSettingsSaved();
      alert("Settings saved successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to save settings: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid-2">
        <section className="panel form-panel">
          <h3>Business Profile & Shop Settings</h3>
          <form onSubmit={handleSaveSettings}>
            <label>
              Business Name *
              <input
                required
                value={form.shop_name || ""}
                onChange={e => setForm({ ...form, shop_name: e.target.value })}
                placeholder="NICE LOOKING"
              />
            </label>
            <label>
              Business Subtitle
              <input
                value={form.shop_subtitle || ""}
                onChange={e =>
                  setForm({ ...form, shop_subtitle: e.target.value })
                }
                placeholder="Hair Wig & Hair Services"
              />
            </label>
            <label>
              WhatsApp Business Number
              <input
                value={form.whatsapp_number || form.shop_mobile || ""}
                onChange={e =>
                  setForm({
                    ...form,
                    whatsapp_number: e.target.value,
                    shop_mobile: e.target.value
                  })
                }
                placeholder="e.g. 9000000000 or 919876543210"
              />
            </label>
            <label>
              Shop Address
              <textarea
                rows={3}
                value={form.shop_address || ""}
                onChange={e =>
                  setForm({ ...form, shop_address: e.target.value })
                }
                placeholder="Full salon / business address"
              />
            </label>
            <label>
              Invoice Prefix
              <input
                value={form.invoice_prefix || "NL"}
                onChange={e =>
                  setForm({ ...form, invoice_prefix: e.target.value.toUpperCase() })
                }
                placeholder="NL"
              />
            </label>
            <button
              className="btn primary"
              type="submit"
              disabled={saving || loading}
              style={{ marginTop: "14px" }}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

// =====================================================================
// Shared Modal Component (Responsive Native Bottom Sheet on Mobile)
// =====================================================================
function Modal({ title, children, onClose }) {
  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="sheet-handle"></div>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
