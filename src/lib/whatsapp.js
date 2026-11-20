import { getAppBaseUrl } from "./supabase.js";

export function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function openWhatsApp(message, phone = "") {
  const number = normalizeWhatsAppNumber(phone);
  const encoded = encodeURIComponent(message);
  const url = number
    ? `https://wa.me/${number}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function invoiceMessage(invoice, customSettings = null) {
  const shopName =
    invoice?.shopSettings?.name ||
    invoice?.shopSettings?.shop_name ||
    customSettings?.name ||
    customSettings?.shop_name ||
    "MY SALON";
  const shopSubtitle =
    invoice?.shopSettings?.subtitle ||
    invoice?.shopSettings?.shop_subtitle ||
    customSettings?.subtitle ||
    customSettings?.shop_subtitle ||
    "Hair Wig & Hair Services";
  const shopMobile =
    invoice?.shopSettings?.shop_mobile ||
    invoice?.shopSettings?.whatsapp_number ||
    invoice?.shopSettings?.phone ||
    customSettings?.shop_mobile ||
    customSettings?.whatsapp_number ||
    customSettings?.phone ||
    "";
  const shopAddress =
    invoice?.shopSettings?.shop_address ||
    invoice?.shopSettings?.address ||
    customSettings?.shop_address ||
    customSettings?.address ||
    "";

  const appOrigin = getAppBaseUrl();
  const custName = invoice?.customerName || invoice?.name || "Customer";
  const lines = [
    `Hello ${custName},`,
    "",
    `Thank you for choosing ${shopName}.`,
    "",
    `🧾 Invoice: ${invoice?.invoiceNumber || invoice?.invoice_number || ""}`,
    invoice?.createdAt ? `📅 Date: ${invoice.createdAt}` : "",
    "",
    "✂️ Services & Products:"
  ].filter(Boolean);

  if (Array.isArray(invoice?.items) && invoice.items.length > 0) {
    invoice.items.forEach(it => {
      let desc = it.service || "Service";
      if (it.service === "Hair Wig" && it.productName) {
        desc = `Hair Wig (${it.productName}${it.productSize ? ` - ${it.productSize}` : ""})`;
      } else if (it.note) {
        desc = `${it.service} (${it.note})`;
      }
      const qty = Number(it.quantity || 1);
      const amt = Number(it.amount || (Number(it.unitPrice || it.price || 0) * qty) || 0);
      lines.push(`• ${desc}${qty > 1 ? ` × ${qty}` : ""}: ₹${amt.toLocaleString("en-IN")}`);
    });
  } else if (invoice) {
    let s = invoice.service || "Service";
    if (invoice.productName) {
      s += ` (${invoice.productName}${invoice.productSize ? ` - ${invoice.productSize}` : ""})`;
    }
    const q = Number(invoice.quantity || 1);
    const amt = Number(invoice.subtotal || invoice.amount || invoice.total || 0);
    lines.push(`• ${s}${q > 1 ? ` × ${q}` : ""}: ₹${amt.toLocaleString("en-IN")}`);
  }

  lines.push("");
  const sub = Number(invoice?.subtotal || 0);
  const tot = Number(invoice?.total !== undefined ? invoice.total : (invoice?.amount || 0));
  const disc = Number(invoice?.discount || 0);
  const adv = Number(invoice?.advanceAmount !== undefined ? invoice.advanceAmount : tot);
  const bal = Number(invoice?.balanceAmount !== undefined ? invoice.balanceAmount : Math.max(0, tot - adv));

  if (sub > tot && sub > 0) {
    lines.push(`Subtotal: ₹${sub.toLocaleString("en-IN")}`);
  }
  if (disc > 0) {
    lines.push(`Discount: - ₹${disc.toLocaleString("en-IN")}`);
  }
  lines.push(`💰 Today's Bill Total: ₹${tot.toLocaleString("en-IN")}`);

  if (Number(invoice?.previousDuesCleared || 0) > 0) {
    lines.push(`🧾 Previous Dues Cleared: ₹${Number(invoice.previousDuesCleared).toLocaleString("en-IN")}`);
    lines.push(`💵 Total Paid Today: ₹${Number(invoice.totalPaidToday || (adv + Number(invoice.previousDuesCleared))).toLocaleString("en-IN")}`);
  } else {
    lines.push(`💵 Advance Received: ₹${adv.toLocaleString("en-IN")}`);
  }

  if (bal > 0) {
    lines.push(`⚠️ Pending Balance on Today's Bill: ₹${bal.toLocaleString("en-IN")}`);
    lines.push(`📌 Status: BALANCE PENDING`);
  } else {
    lines.push(`✅ Balance: ₹0 (Fully Paid)`);
    lines.push(`📌 Status: FULLY PAID`);
  }

  lines.push(`💳 Payment Mode: ${invoice?.paymentMode || "Cash"}`);
  if (shopAddress) {
    lines.push(`📍 Address: ${shopAddress}`);
  }
  if (shopMobile) {
    lines.push(`📞 Contact: ${shopMobile}`);
  }
  if (appOrigin) {
    lines.push(`🌐 Portal: ${appOrigin}`);
  }
  lines.push("");
  lines.push("📄 Official Invoice PDF is generated & attached for your records.");
  lines.push("");
  lines.push("Thank you,");
  lines.push(`${shopName}${shopSubtitle ? ` – ${shopSubtitle}` : ""}`);

  return lines.join("\n");
}

export function settlementReceiptMessage(invoice, settlement, customSettings = null) {
  const shopName =
    invoice?.shopSettings?.name ||
    invoice?.shopSettings?.shop_name ||
    customSettings?.name ||
    customSettings?.shop_name ||
    "MY SALON";
  const shopSubtitle =
    invoice?.shopSettings?.subtitle ||
    invoice?.shopSettings?.shop_subtitle ||
    customSettings?.subtitle ||
    customSettings?.shop_subtitle ||
    "Hair Wig & Hair Services";
  const shopMobile =
    invoice?.shopSettings?.shop_mobile ||
    invoice?.shopSettings?.whatsapp_number ||
    invoice?.shopSettings?.phone ||
    customSettings?.shop_mobile ||
    customSettings?.whatsapp_number ||
    customSettings?.phone ||
    "";
  const shopAddress =
    invoice?.shopSettings?.shop_address ||
    invoice?.shopSettings?.address ||
    customSettings?.shop_address ||
    customSettings?.address ||
    "";

  const appOrigin = getAppBaseUrl();
  const custName = invoice?.customerName || invoice?.name || "Customer";
  const invNo = invoice?.invoiceNumber || invoice?.invoice_number || "";
  const tot = Number(invoice?.total !== undefined ? invoice.total : (invoice?.amount || 0));
  const settledNow = Number(settlement?.amount || 0);
  const remainingBal = Number(invoice?.balanceAmount !== undefined ? invoice.balanceAmount : 0);
  const totalPaid = Math.max(0, tot - remainingBal);

  const lines = [
    `Hello ${custName},`,
    "",
    `Thank you for your payment at ${shopName}.`,
    "",
    `💳 PAYMENT RECEIPT - BALANCE SETTLEMENT`,
    `🧾 Invoice: ${invNo}`,
    `📅 Date: ${settlement?.date ? String(settlement.date).slice(0, 10) : new Date().toISOString().slice(0, 10)}`,
    "",
    `💰 Total Bill Amount: ₹${tot.toLocaleString("en-IN")}`,
    `💵 Amount Received Now: ₹${settledNow.toLocaleString("en-IN")}`,
    `💳 Payment Mode: ${settlement?.paymentMode || "Cash"}`,
    `📊 Total Paid So Far: ₹${totalPaid.toLocaleString("en-IN")}`
  ];

  if (remainingBal > 0) {
    lines.push(`⚠️ Remaining Pending Balance: ₹${remainingBal.toLocaleString("en-IN")}`);
    lines.push(`📌 Status: PARTIAL PAYMENT (Pending: ₹${remainingBal.toLocaleString("en-IN")})`);
  } else {
    lines.push(`✅ Remaining Balance: ₹0 (Zero)`);
    lines.push(`📌 Status: FULLY PAID (All dues cleared!)`);
  }

  if (shopAddress) {
    lines.push(`📍 Address: ${shopAddress}`);
  }
  if (shopMobile) {
    lines.push(`📞 Contact: ${shopMobile}`);
  }
  if (appOrigin) {
    lines.push(`🌐 Portal: ${appOrigin}`);
  }
  lines.push("");
  lines.push("📄 Your updated Invoice PDF is generated & attached for your records.");
  lines.push("");
  lines.push("Thank you,");
  lines.push(`${shopName}${shopSubtitle ? ` – ${shopSubtitle}` : ""}`);

  return lines.join("\n");
}

export function offerMessage(offer, customSettings = null) {
  const shopName =
    customSettings?.name ||
    customSettings?.shop_name ||
    "MY SALON";
  const appOrigin = getAppBaseUrl();
  const offerObj = typeof offer === "string" ? { description: offer } : (offer || {});
  return [
    `🎉 Special Offer from ${shopName}`,
    "",
    offerObj?.title || (typeof offer === "string" ? "" : "Special Promotion"),
    offerObj?.description || (typeof offer === "string" ? offer : ""),
    offerObj?.discount ? `Discount: ${offerObj.discount}% OFF` : "",
    offerObj?.validUntil ? `Valid till: ${offerObj.validUntil}` : "",
    appOrigin ? `🌐 Explore: ${appOrigin}` : "",
    "",
    `Contact ${shopName} today.`
  ].filter(Boolean).join("\n");
}
