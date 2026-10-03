import fs from 'fs';
import path from 'path';

/**
 * Configure Resend SMTP on Supabase and upload 6-digit OTP email templates
 * Usage:
 *   node scripts/setup_resend_smtp.mjs <RESEND_API_KEY> [SENDER_EMAIL]
 * Example:
 *   node scripts/setup_resend_smtp.mjs re_123456789 onboarding@resend.dev
 */

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "vcoeyueuwugfguivfuft";

const resendApiKey = process.argv[2] || process.env.RESEND_API_KEY;
const senderEmail = process.argv[3] || process.env.RESEND_SENDER_EMAIL || "onboarding@resend.dev";
const senderName = "NICE LOOKING Verification";

if (!resendApiKey) {
  console.log(`
========================================================================
🚀 RESEND SMTP AUTOMATION FOR SUPABASE
========================================================================
Please provide your Resend API Key:
  node scripts/setup_resend_smtp.mjs <RESEND_API_KEY> [SENDER_EMAIL]

Examples:
  node scripts/setup_resend_smtp.mjs re_123456789
  node scripts/setup_resend_smtp.mjs re_123456789 auth@yourdomain.com

If you don't have a Resend key yet:
  1. Go to https://resend.com and sign up (Free: 3,000 emails/month, 100/day)
  2. Click "API Keys" -> "Create API Key"
  3. Send your key here or run this command!
========================================================================
  `);
  process.exit(1);
}

const confirmTemplate = fs.readFileSync(path.resolve("supabase/email-templates/confirm_signup.html"), "utf-8");
const resetTemplate = fs.readFileSync(path.resolve("supabase/email-templates/reset_password.html"), "utf-8");

async function configureResend() {
  console.log(`\nConfiguring Resend SMTP for Supabase Project: ${PROJECT_REF}...`);
  console.log(`- SMTP Host: smtp.resend.com:465`);
  console.log(`- SMTP User: resend`);
  console.log(`- Sender: ${senderName} <${senderEmail}>`);

  const payload = {
    smtp_admin_email: senderEmail,
    smtp_sender_name: senderName,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: resendApiKey,
    smtp_max_frequency: 60,
    mailer_templates_confirmation_content: confirmTemplate,
    mailer_templates_recovery_content: resetTemplate,
    mailer_subjects_confirmation: "Your NICE LOOKING Verification Code",
    mailer_subjects_recovery: "Reset Your NICE LOOKING Password",
    mailer_otp_exp: 3600
  };

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log("\n✅ SUCCESS! Resend SMTP & 6-Digit OTP Templates Configured Successfully on Supabase!");
      console.log("Supabase email rate limits are now lifted, and 6-digit OTP verification is live.\n");
    } else {
      const err = await res.json();
      console.error("\n❌ Supabase API Response Error:", err.message || err);
      console.log("\nIf setting port 465 fails, trying with port 587...");
      
      payload.smtp_port = "587";
      const retryRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (retryRes.ok) {
        console.log("\n✅ SUCCESS on port 587! Resend SMTP & 6-Digit OTP Templates Configured Successfully!");
      } else {
        const retryErr = await retryRes.json();
        console.error("❌ Retry error:", retryErr.message || retryErr);
      }
    }
  } catch (e) {
    console.error("Network / Execution Error:", e.message);
  }
}

configureResend();
