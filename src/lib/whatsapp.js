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
    invoice?.shopSettings?.shop_name ||
    customSettings?.shop_name ||
    "NICE LOOKING";
  const shopSubtitle =
    invoice?.shopSettings?.shop_subtitle ||
    customSettings?.shop_subtitle ||
    "Hair Wig & Hair Services";
  const shopMobile =
    invoice?.shopSettings?.shop_mobile ||
    invoice?.shopSettings?.whatsapp_number ||
    customSettings?.shop_mobile ||
    customSettings?.whatsapp_number ||
    "";
  const shopAddress =
    invoice?.shopSettings?.shop_address ||
    customSettings?.shop_address ||
    "";

  const appOrigin = getAppBaseUrl();
  const custName = invoice?.customerName || invoice?.name || "Customer";
  const lines = [
    `Hello ${custName},`,
    "",
    `Thank you for choosing ${shopName}.`,
    "",
    `🧾 Invoice: ${invoice?.invoiceNumber || ""}`,
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
  const tot = Number(invoice?.total || invoice?.amount || 0);
  const disc = Number(invoice?.discount || 0);

  if (sub > tot && sub > 0) {
    lines.push(`Subtotal: ₹${sub.toLocaleString("en-IN")}`);
  }
  if (disc > 0) {
    lines.push(`Discount: - ₹${disc.toLocaleString("en-IN")}`);
  }
  lines.push(`Total Amount: ₹${tot.toLocaleString("en-IN")}`);
  lines.push(`Payment Mode: ${invoice?.paymentMode || "Cash"}`);
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
  lines.push("Thank you,");
  lines.push(`${shopName}${shopSubtitle ? ` – ${shopSubtitle}` : ""}`);

  return lines.join("\n");
}

export function offerMessage(offer, customSettings = null) {
  const shopName = customSettings?.shop_name || "NICE LOOKING";
  const appOrigin = getAppBaseUrl();
  return [
    `🎉 Special Offer from ${shopName}`,
    "",
    offer?.title || "Special Promotion",
    offer?.description || "",
    offer?.discount ? `Discount: ${offer.discount}% OFF` : "",
    offer?.validUntil ? `Valid till: ${offer.validUntil}` : "",
    appOrigin ? `🌐 Explore: ${appOrigin}` : "",
    "",
    `Contact ${shopName} today.`
  ].filter(Boolean).join("\n");
}