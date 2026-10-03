/**
 * Email Delivery Service for NICE LOOKING Multi-Salon Portal
 * Primary: Web3Forms API (Access Key: c90b1a9d-0c4a-4177-8add-a6e208d0cc23, Recipient: sameershaikh121@proton.me)
 * Fallback: FormSubmit (Endpoint: https://formsubmit.co/ajax/sameershaikh584@gmail.com, CC: sameershaikh121@proton.me)
 */

import { getAppBaseUrl } from "./supabase.js";

const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : (typeof process !== "undefined" && process.env ? process.env : {});

export const WEB3FORMS_ACCESS_KEY = metaEnv.VITE_WEB3FORMS_ACCESS_KEY || "c90b1a9d-0c4a-4177-8add-a6e208d0cc23";
export const WEB3FORMS_ENDPOINT = metaEnv.VITE_WEB3FORMS_ENDPOINT || "https://api.web3forms.com/submit";
export const PRIMARY_NOTIFICATION_EMAIL = metaEnv.VITE_PRIMARY_NOTIFICATION_EMAIL || "sameershaikh121@proton.me";
export const FALLBACK_NOTIFICATION_EMAIL = metaEnv.VITE_FALLBACK_NOTIFICATION_EMAIL || "sameershaikh584@gmail.com";
export const FORMSUBMIT_ENDPOINT = metaEnv.VITE_FORMSUBMIT_ENDPOINT || `https://formsubmit.co/ajax/${FALLBACK_NOTIFICATION_EMAIL}`;

/**
 * Returns configuration metadata for Settings & UI display.
 */
export function getEmailConfigStatus() {
  return {
    provider: "Web3Forms",
    accessKeyMasked: WEB3FORMS_ACCESS_KEY ? `${WEB3FORMS_ACCESS_KEY.slice(0, 8)}...${WEB3FORMS_ACCESS_KEY.slice(-6)}` : "Not Configured",
    accessKey: WEB3FORMS_ACCESS_KEY,
    primaryEmail: PRIMARY_NOTIFICATION_EMAIL,
    fallbackEmail: FALLBACK_NOTIFICATION_EMAIL,
    web3FormsEndpoint: WEB3FORMS_ENDPOINT,
    formSubmitEndpoint: FORMSUBMIT_ENDPOINT,
    isConfigured: Boolean(WEB3FORMS_ACCESS_KEY)
  };
}

/**
 * Core email dispatcher: Sends via Web3Forms with automatic FormSubmit fallback.
 */
export async function sendEmail({
  subject,
  message,
  recipientEmail,
  senderName = "NICE LOOKING Portal",
  salonName = "NICE LOOKING",
  extraData = {}
}) {
  const cleanRecipient = String(recipientEmail || "").trim();
  const cleanSubject = String(subject || `Notification from ${salonName}`).trim();
  const cleanMessage = String(message || "").trim();

  // 1. Try Web3Forms (Primary)
  try {
    const payload = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: cleanSubject,
      from_name: `${salonName} | NICE LOOKING`,
      email: cleanRecipient || PRIMARY_NOTIFICATION_EMAIL,
      name: senderName,
      message: cleanMessage,
      salon_name: salonName,
      sent_at: new Date().toISOString(),
      ...extraData
    };

    const response = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok && (result.success || result.status === "success" || result.message)) {
      return {
        success: true,
        provider: "Web3Forms",
        message: "Email sent successfully via Web3Forms.",
        details: result
      };
    }
    console.warn("Web3Forms response not successful, attempting FormSubmit fallback:", result);
  } catch (web3Err) {
    console.warn("Web3Forms delivery failed with network error, trying FormSubmit fallback:", web3Err);
  }

  // 2. Fallback: FormSubmit
  try {
    const fallbackPayload = {
      _subject: cleanSubject,
      _replyto: cleanRecipient || PRIMARY_NOTIFICATION_EMAIL,
      _cc: PRIMARY_NOTIFICATION_EMAIL,
      _template: "table",
      name: senderName,
      salon: salonName,
      message: cleanMessage,
      ...extraData
    };

    const fallbackRes = await fetch(FORMSUBMIT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(fallbackPayload)
    });

    const fallbackResult = await fallbackRes.json().catch(() => ({}));
    if (fallbackRes.ok) {
      return {
        success: true,
        provider: "FormSubmit (Fallback)",
        message: "Email sent successfully via FormSubmit fallback.",
        details: fallbackResult
      };
    }
    throw new Error(fallbackResult.message || `FormSubmit returned status ${fallbackRes.status}`);
  } catch (fallbackErr) {
    console.error("All email delivery providers failed:", fallbackErr);
    throw new Error(`Email delivery failed: ${fallbackErr.message}`);
  }
}

/**
 * Generates and sends a formatted digital invoice receipt to a customer or owner.
 */
export async function sendInvoiceEmail({
  invoice,
  recipientEmail,
  customerName = "Valued Customer",
  customSettings = null,
  actorInfo = null
}) {
  if (!invoice) throw new Error("Invoice data is required.");

  const shopName = invoice?.shopSettings?.shop_name || customSettings?.shop_name || customSettings?.name || "NICE LOOKING";
  const shopSubtitle = invoice?.shopSettings?.shop_subtitle || customSettings?.shop_subtitle || customSettings?.subtitle || "Hair Wig & Hair Services";
  const shopMobile = invoice?.shopSettings?.shop_mobile || customSettings?.shop_mobile || customSettings?.mobile || "";
  const shopAddress = invoice?.shopSettings?.shop_address || customSettings?.shop_address || customSettings?.address || "";
  const appOrigin = getAppBaseUrl();

  const invNumber = invoice.invoiceNumber || invoice.id || "NL-INV";
  const invDate = invoice.createdAt || invoice.invoiceDate || new Date().toLocaleDateString("en-IN");
  const custName = customerName || invoice.name || invoice.customerName || "Customer";
  const custMobile = invoice.mobile || invoice.customerMobile || "";
  const subtotal = Number(invoice.subtotal || invoice.amount || invoice.total || 0);
  const discount = Number(invoice.discount || 0);
  const total = Number(invoice.total || invoice.amount || 0);
  const paymentMode = invoice.paymentMode || "Cash";

  // Build Itemized Text Summary
  const itemLines = [];
  if (Array.isArray(invoice.items) && invoice.items.length > 0) {
    invoice.items.forEach((it, idx) => {
      let desc = it.service || "Service";
      if (it.service === "Hair Wig" && it.productName) {
        desc = `Hair Wig (${it.productName}${it.productSize ? ` - ${it.productSize}` : ""})`;
      } else if (it.note) {
        desc = `${it.service} (${it.note})`;
      }
      const qty = Number(it.quantity || 1);
      const amt = Number(it.amount || (Number(it.unitPrice || it.price || 0) * qty) || 0);
      itemLines.push(`${idx + 1}. ${desc} [Qty: ${qty}] - ₹${amt.toLocaleString("en-IN")}`);
    });
  } else {
    let s = invoice.service || "Service";
    if (invoice.productName) {
      s += ` (${invoice.productName}${invoice.productSize ? ` - ${invoice.productSize}` : ""})`;
    }
    const qty = Number(invoice.quantity || 1);
    itemLines.push(`1. ${s} [Qty: ${qty}] - ₹${total.toLocaleString("en-IN")}`);
  }

  const messageBody = `
========================================
TAX INVOICE / RECEIPT
========================================
Salon / Branch: ${shopName}
${shopSubtitle ? `${shopSubtitle}\n` : ""}Address: ${shopAddress || "Mumbai"}
Contact: ${shopMobile || "+91 98765 43210"}

INVOICE DETAILS:
----------------------------------------
Invoice No:    ${invNumber}
Date:          ${invDate}
Billed To:     ${custName}
Phone:         ${custMobile ? `+91 ${custMobile}` : "N/A"}
Payment Mode:  ${paymentMode}
Status:        ${invoice.isVoided ? "VOIDED" : "PAID"}

ITEMS / SERVICES:
----------------------------------------
${itemLines.join("\n")}

FINANCIAL BREAKDOWN:
----------------------------------------
Subtotal:      ₹${subtotal.toLocaleString("en-IN")}
Discount:     - ₹${discount.toLocaleString("en-IN")}
TOTAL PAID:    ₹${total.toLocaleString("en-IN")}

Thank you for choosing ${shopName}!
Portal link: ${appOrigin}
Sent via NICE LOOKING Automated Billing System.
========================================
`.trim();

  const targetEmail = recipientEmail || PRIMARY_NOTIFICATION_EMAIL;

  return await sendEmail({
    subject: `Receipt for Invoice #${invNumber} - ${shopName}`,
    message: messageBody,
    recipientEmail: targetEmail,
    senderName: `${shopName} Billing`,
    salonName: shopName,
    extraData: {
      invoice_number: invNumber,
      customer_name: custName,
      customer_mobile: custMobile,
      invoice_total: `₹${total.toLocaleString("en-IN")}`,
      payment_mode: paymentMode,
      issued_by: actorInfo?.name || "Staff",
      salon_address: shopAddress,
      portal_url: appOrigin
    }
  });
}

/**
 * Sends a daily business summary report to the salon owner or administrator.
 */
export async function sendDailyReportEmail({
  date = new Date().toLocaleDateString("en-IN"),
  metrics = {},
  salonName = "NICE LOOKING",
  recipientEmail = null,
  actorInfo = null
}) {
  const targetEmail = recipientEmail || PRIMARY_NOTIFICATION_EMAIL;
  const appOrigin = getAppBaseUrl();

  const messageBody = `
========================================
DAILY SALES & REVENUE REPORT
========================================
Salon:         ${salonName}
Report Date:   ${date}
Generated By:  ${actorInfo?.name || "System"}

PERFORMANCE SUMMARY:
----------------------------------------
Total Sales:         ₹${Number(metrics.todaySales || 0).toLocaleString("en-IN")}
Invoices Generated:  ${metrics.todayCount || 0}
Cash Collection:     ₹${Number(metrics.todayCash || 0).toLocaleString("en-IN")}
Online/UPI/Card:     ₹${Number(metrics.todayOnline || 0).toLocaleString("en-IN")}
Total Active Wigs:   ${metrics.totalStock || 0} Units

Portal Dashboard: ${appOrigin}
Sent automatically via NICE LOOKING Multi-Salon Portal.
========================================
`.trim();

  return await sendEmail({
    subject: `Daily Business Report [${date}] - ${salonName}`,
    message: messageBody,
    recipientEmail: targetEmail,
    senderName: `${salonName} Reporting`,
    salonName: salonName,
    extraData: {
      report_date: date,
      total_sales: `₹${Number(metrics.todaySales || 0).toLocaleString("en-IN")}`,
      invoice_count: String(metrics.todayCount || 0),
      cash_collection: `₹${Number(metrics.todayCash || 0).toLocaleString("en-IN")}`,
      online_collection: `₹${Number(metrics.todayOnline || 0).toLocaleString("en-IN")}`,
      portal_url: appOrigin
    }
  });
}

/**
 * Sends a live connectivity test email to verify Web3Forms & FormSubmit delivery.
 */
export async function sendTestEmail({
  recipientEmail = null,
  salonName = "NICE LOOKING",
  actorName = "Admin"
}) {
  const targetEmail = recipientEmail || PRIMARY_NOTIFICATION_EMAIL;
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const messageBody = `
✅ Web3Forms & FormSubmit Email Connectivity Test Successful!

This is a confirmation message verifying that email delivery is active and working properly in the NICE LOOKING Multi-Salon Portal.

DETAILS:
- Delivery Provider: Web3Forms (Primary) / FormSubmit (Fallback)
- Access Key: ${WEB3FORMS_ACCESS_KEY.slice(0, 8)}...${WEB3FORMS_ACCESS_KEY.slice(-6)}
- Salon / Branch: ${salonName}
- Triggered By: ${actorName}
- Timestamp: ${now} (IST)
- Primary Destination: ${PRIMARY_NOTIFICATION_EMAIL}
- Fallback Destination: ${FALLBACK_NOTIFICATION_EMAIL}

Your portal is fully configured to send digital invoice receipts, booking alerts, and daily sales summaries.
`.trim();

  return await sendEmail({
    subject: `✅ Email Connectivity Test Passed - ${salonName}`,
    message: messageBody,
    recipientEmail: targetEmail,
    senderName: "NICE LOOKING System",
    salonName: salonName,
    extraData: {
      test_type: "CONNECTIVITY_VERIFICATION",
      timestamp: now,
      verified_by: actorName
    }
  });
}
