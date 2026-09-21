# NICE LOOKING – Hair Wig & Services Management Portal

A modern, production-grade management portal for **NICE LOOKING Hair Wig & Services**, built with **React JS + Vite**, **Supabase (PostgreSQL, Supabase Auth, RPCs, Edge Functions)**, and **Lucide Icons**.

---

## 🚀 Quick Setup Guide

### 1. Supabase Setup (Database & RPCs)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and create or select your project.
2. Go to the **SQL Editor** in the left sidebar.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql) in this project, copy its entire contents, and paste it into the Supabase SQL Editor.
4. Click **Run** to execute the script.
   
   This script will automatically:
   - Enable `pgcrypto`
   - Create tables: `profiles`, `customers`, `services`, `wig_products`, `transactions`, `invoices`, `settings`, `offers`, `whatsapp_messages`
   - Set up Row Level Security (RLS) policies
   - Create atomic PostgreSQL functions (RPCs):
     - `decrement_product_stock`
     - `restore_product_stock`
     - `create_invoice_with_stock` (atomic billing + stock deduction + customer upsert)
     - `update_invoice_with_stock` (atomic invoice update + stock rebalance)
     - `delete_invoice_with_stock` (atomic invoice delete + stock restore)
   - Seed default services and demo wig products.

---

### 2. Configure Frontend Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your Supabase credentials found in **Project Settings > API**:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_WHATSAPP_NUMBER=919876543210
   ```

---

### 3. Run the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production bundle
npm run build
```

---

## 🌟 Key Features

1. **Supabase 6-Digit Email OTP Registration & Verification Flow**:
   - Secure Staff & Admin registration with 6-digit email OTP verification.
   - **Required Flow**: `Register → 6-Digit OTP Email → Enter 6-Digit OTP → Account Verified Banner → Login Page → Email + Password Login → Dashboard`.
   - Never auto-logs into the Dashboard upon OTP verification; guarantees an explicit email + password login step after account activation.
   - **Supabase Email Template Configuration**: In your [Supabase Dashboard](https://supabase.com/dashboard) under **Authentication > Email Templates > Confirm signup**, use the token variable `{{ .Token }}` so users receive the 6-digit OTP directly (and NOT `{{ .ConfirmationURL }}`):
     ```html
     <h2>Confirm your signup</h2>
     <p>Your 6-digit verification code is: <strong>{{ .Token }}</strong></p>
     ```
   - Ready-to-use template file available at `supabase/email-templates/confirm_signup.html`.

2. **Atomic Inventory & Stock Management**:
   - Stock deduction and restoration happen entirely at the PostgreSQL database level using atomic RPCs (`create_invoice_with_stock`, `update_invoice_with_stock`, `delete_invoice_with_stock`).
   - Prevents race conditions and partial saves.

3. **Customer Mobile Lookup & Auto-fill**:
   - Entering a 10-digit mobile number in **New Billing** automatically searches Supabase and populates the customer name and address with an "Existing customer found" indicator.
   - Unique normalized phone numbers prevent duplicate customer records.

4. **Dynamic Customer Last Visit Calculation**:
   - The **Customers** page does not store stale service or amount data; it calculates the customer's latest remaining invoice dynamically from Supabase.
   - Deleting an invoice automatically shifts the customer's last visit to their previous invoice, and displays `—` if all invoices are deleted (while retaining the customer record).

5. **Live Dashboard Metrics & Revenue Chart**:
   - **Today's Sales**, **Cash Collection**, and **Online Collection** (combining UPI + Card + Online) calculated from actual invoices.
   - **Revenue Overview Chart**: 7-day trend based on Mumbai/local business date (`Asia/Kolkata`).
   - **Customer Base**: Live customer count with exact label `"Number of customer"`.

6. **Wig Products Management**:
   - Add, edit, and delete wig products directly in Supabase with exact wig sizes (`5x7`, `5x8`, `6x8`, `7x9`, etc.).

7. **Multi-field Invoice Search & CSV Export**:
   - Instant filtering by invoice number, customer name, mobile, service, wig product, wig size, or date.
   - Export filtered invoices, customer lists, and wig products to CSV.

8. **WhatsApp Integration**:
   - Send formatted invoices on WhatsApp with one click.
   - Offers & campaign messaging with opt-in consent safeguards.
