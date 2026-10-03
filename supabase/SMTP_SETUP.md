# How to Configure Custom SMTP in Supabase to Eliminate Rate Limits

By default, Supabase's built-in shared email service has a strict **rate limit of 3–4 emails per hour** for authentication confirmation and OTP verification.

To enable **unlimited 6-digit OTP emails and password resets**, you must enable **Custom SMTP** in your Supabase project dashboard.

---

## 🚀 Step-by-Step Setup Guide

### Option 1: Using Gmail SMTP (Free & Quick)

1. **Generate a Google App Password**:
   - Go to your Google Account: [https://myaccount.google.com/security](https://myaccount.google.com/security)
   - Enable **2-Step Verification** (if not already enabled).
   - Go to **App passwords**: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - App name: `NICE LOOKING Supabase Auth`
   - Click **Create**. Google will generate a 16-character password (e.g. `abcd efgh ijkl mnop`). Copy it.

2. **Configure in Supabase Dashboard**:
   - Open your project: [https://supabase.com/dashboard/project/vcoeyueuwugfguivfuft](https://supabase.com/dashboard/project/vcoeyueuwugfguivfuft)
   - Navigate to: **Project Settings** (gear icon) $\rightarrow$ **Authentication** $\rightarrow$ scroll to **SMTP Settings** (or go to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Email** $\rightarrow$ **SMTP Settings**).
   - Toggle **Enable Custom SMTP** to **ON**.
   - Fill in the values:
     | Field | Value |
     | :--- | :--- |
     | **Sender email** | `sameershaikh584@gmail.com` |
     | **Sender name** | `NICE LOOKING Portal` |
     | **Host** | `smtp.gmail.com` |
     | **Port** | `587` |
     | **Minimum TLS Version** | `1.2` or `Default` |
     | **Username** | `sameershaikh584@gmail.com` |
     | **Password** | *Your 16-character Google App Password* |
   - Click **Save changes**.

---

### Option 2: Using Resend (Recommended for High Volume / Custom Domains)

1. Create a free account at [https://resend.com](https://resend.com) (gives 3,000 free emails/month).
2. In Resend, go to **API Keys** and generate a new key (e.g. `re_123456...`).
3. In Supabase Dashboard -> **SMTP Settings**:
   | Field | Value |
   | :--- | :--- |
   | **Sender email** | `onboarding@resend.dev` *(or your verified domain email)* |
   | **Sender name** | `NICE LOOKING Portal` |
   | **Host** | `smtp.resend.com` |
   | **Port** | `465` (SSL) or `587` (TLS) |
   | **Username** | `resend` |
   | **Password** | `re_your_api_key_here` |
4. Click **Save changes**.

---

### Option 3: Using Brevo / Sendinblue (Free 300 emails/day)

1. Sign up at [https://www.brevo.com](https://www.brevo.com).
2. Go to **SMTP & API** $\rightarrow$ **SMTP**.
3. In Supabase Dashboard -> **SMTP Settings**:
   | Field | Value |
   | :--- | :--- |
   | **Sender email** | `sameershaikh584@gmail.com` |
   | **Sender name** | `NICE LOOKING Portal` |
   | **Host** | `smtp-relay.brevo.com` |
   | **Port** | `587` |
   | **Username** | *Your Brevo SMTP login email* |
   | **Password** | *Your Brevo SMTP key* |
4. Click **Save changes**.

---

## 📧 Email Template Configuration for 6-Digit OTP

Make sure your Supabase Auth email template sends the **6-digit numeric OTP code** rather than a magic link:

1. In Supabase Dashboard $\rightarrow$ **Authentication** $\rightarrow$ **Email Templates** $\rightarrow$ **Confirm signup**.
2. **Subject**: `{{ .Token }} is your NICE LOOKING verification code`
3. **Body**: Copy the contents of [`supabase/email-templates/confirm_signup.html`](supabase/email-templates/confirm_signup.html).
4. Click **Save changes**.
