import { jsPDF } from "jspdf";
import { invoiceMessage, openWhatsApp } from "./whatsapp.js";

export function generateInvoicePDF(invoice, shopSettings = null) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const shopName =
    invoice?.shopSettings?.name ||
    invoice?.shopSettings?.shop_name ||
    shopSettings?.name ||
    shopSettings?.shop_name ||
    "MY SALON";

  const shopSubtitle =
    invoice?.shopSettings?.subtitle ||
    invoice?.shopSettings?.shop_subtitle ||
    shopSettings?.subtitle ||
    shopSettings?.shop_subtitle ||
    "Hair Wig & Hair Services";

  const shopMobile =
    invoice?.shopSettings?.shop_mobile ||
    invoice?.shopSettings?.whatsapp_number ||
    invoice?.shopSettings?.phone ||
    shopSettings?.shop_mobile ||
    shopSettings?.whatsapp_number ||
    shopSettings?.phone ||
    "";

  const shopAddress =
    invoice?.shopSettings?.shop_address ||
    invoice?.shopSettings?.address ||
    shopSettings?.shop_address ||
    shopSettings?.address ||
    "";

  const invoiceNumber = invoice?.invoiceNumber || invoice?.invoice_number || "INV-001";
  const invoiceDate = invoice?.createdAt || invoice?.invoice_date || new Date().toISOString().slice(0, 10);
  const custName = invoice?.customerName || invoice?.name || "Valued Customer";
  const custMobile = invoice?.customerMobile || invoice?.mobile || "";
  const custAddress = invoice?.customerAddress || invoice?.address || "";
  const paymentMode = invoice?.paymentMode || invoice?.payment_mode || "Cash";

  // Financials
  const subtotal = Number(invoice?.subtotal || invoice?.amount || invoice?.total || 0);
  const discount = Number(invoice?.discount || 0);
  const total = Number(invoice?.total !== undefined ? invoice.total : (invoice?.amount || Math.max(0, subtotal - discount)));
  const advance = Number(invoice?.advanceAmount !== undefined ? invoice.advanceAmount : total);
  const balance = Number(invoice?.balanceAmount !== undefined ? invoice.balanceAmount : Math.max(0, total - advance));

  const items = Array.isArray(invoice?.items) && invoice.items.length > 0 ? invoice.items : [
    {
      service: invoice?.service || "Hair Wig",
      productName: invoice?.productName || "",
      productSize: invoice?.productSize || "",
      quantity: invoice?.quantity || 1,
      unitPrice: subtotal,
      amount: total,
      note: ""
    }
  ];

  // Helper for money format in PDF
  const fmt = (num) => "Rs. " + Number(num || 0).toLocaleString("en-IN");

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2); // 182mm

  // 1. Top Decorative Bar
  doc.setFillColor(15, 23, 42); // Navy slate (#0f172a)
  doc.rect(0, 0, pageWidth, 28, "F");

  // Accent Line
  doc.setFillColor(217, 119, 6); // Amber Gold
  doc.rect(0, 28, pageWidth, 2, "F");

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(shopName.toUpperCase(), margin, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(shopSubtitle, margin, 20);

  // Invoice Label on Right of Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", pageWidth - margin, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(245, 158, 11); // Amber
  doc.text(invoiceNumber, pageWidth - margin, 20, { align: "right" });

  // 2. Info Cards (Shop info + Customer info)
  let y = 37;

  // Shop contact summary
  if (shopMobile || shopAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const shopLines = [];
    if (shopMobile) shopLines.push("Contact: " + shopMobile);
    if (shopAddress) shopLines.push("Address: " + shopAddress);
    doc.text(shopLines.join("  |  "), margin, y);
    y += 6;
  }

  // Invoice & Customer Details Box
  const boxY = y;
  const boxHeight = 28;
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(margin, boxY, contentWidth, boxHeight, 2, 2, "FD");

  // Left side: Bill To
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text("BILLED TO:", margin + 4, boxY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // Dark slate
  doc.text(custName, margin + 4, boxY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Mobile: " + (custMobile || "—"), margin + 4, boxY + 18);
  if (custAddress) {
    doc.text("Address: " + custAddress.slice(0, 50), margin + 4, boxY + 23);
  }

  // Right side: Invoice Meta
  const rightX = pageWidth - margin - 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("INVOICE DETAILS:", rightX, boxY + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Invoice Date: " + invoiceDate, rightX, boxY + 12, { align: "right" });
  doc.text("Payment Mode: " + paymentMode, rightX, boxY + 18, { align: "right" });

  // Status indicator in box
  if (balance > 0) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38); // Red
    doc.text("Status: PENDING BALANCE", rightX, boxY + 23, { align: "right" });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74); // Green
    doc.text("Status: FULLY PAID", rightX, boxY + 23, { align: "right" });
  }

  // 3. Line Items Table
  y = boxY + boxHeight + 8;

  const colX = {
    idx: margin,
    item: margin + 10,
    price: margin + 102,
    qty: margin + 128,
    amt: margin + 146
  };

  // Header Row
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(margin, y, contentWidth, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("#", colX.idx + 3, y + 5.5);
  doc.text("Service & Product Description", colX.item + 2, y + 5.5);
  doc.text("Rate", colX.price + 2, y + 5.5);
  doc.text("Qty", colX.qty + 2, y + 5.5);
  doc.text("Amount", pageWidth - margin - 4, y + 5.5, { align: "right" });

  y += 8;

  // Rows
  items.forEach((it, i) => {
    const isEven = i % 2 === 0;
    const rowHeight = 10;

    if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }
    doc.rect(margin, y, contentWidth, rowHeight, "F");

    // Border line bottom
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    // Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    doc.text(String(i + 1), colX.idx + 3, y + 6);

    let mainTitle = it.service || "Service";
    if (it.service === "Hair Wig" && it.productName) {
      mainTitle = `Hair Wig (${it.productName}${it.productSize ? ` - ${it.productSize}` : ""})`;
    } else if (it.note) {
      mainTitle = `${it.service} (${it.note})`;
    }

    doc.setFont("helvetica", "bold");
    doc.text(mainTitle.slice(0, 48), colX.item + 2, y + 6);

    const unitPrice = Number(it.unitPrice || (Number(it.amount || 0) / Math.max(1, Number(it.quantity || 1))) || 0);
    const qty = Math.max(1, Number(it.quantity || 1));
    const lineAmt = Number(it.amount || (unitPrice * qty) || 0);

    doc.setFont("helvetica", "normal");
    doc.text(fmt(unitPrice), colX.price + 2, y + 6);
    doc.text(String(qty), colX.qty + 4, y + 6);

    doc.setFont("helvetica", "bold");
    doc.text(fmt(lineAmt), pageWidth - margin - 4, y + 6, { align: "right" });

    y += rowHeight;
  });

  // 4. Financial Settlement Breakdown
  y += 4;
  const summaryWidth = 90;
  const summaryX = pageWidth - margin - summaryWidth;

  const prevCleared = Number(invoice?.previousDuesCleared || 0);

  // Background for financial summary
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const summaryBoxH = (discount > 0 ? 38 : 32) + (prevCleared > 0 ? 12 : 0);
  doc.roundedRect(summaryX, y, summaryWidth, summaryBoxH, 2, 2, "FD");

  let sy = y + 6;

  // Subtotal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Subtotal:", summaryX + 4, sy);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(fmt(subtotal), pageWidth - margin - 4, sy, { align: "right" });
  sy += 6;

  // Discount (if any)
  if (discount > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(22, 163, 74);
    doc.text("Discount:", summaryX + 4, sy);
    doc.text("- " + fmt(discount), pageWidth - margin - 4, sy, { align: "right" });
    sy += 6;
  }

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(summaryX + 4, sy - 1, pageWidth - margin - 4, sy - 1);

  // Final Total Amount
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Today's Total Amount:", summaryX + 4, sy + 3);
  doc.text(fmt(total), pageWidth - margin - 4, sy + 3, { align: "right" });
  sy += 8;

  // Advance Received on today's bill
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text("Advance Received:", summaryX + 4, sy);
  doc.text(fmt(advance), pageWidth - margin - 4, sy, { align: "right" });
  sy += 6;

  if (prevCleared > 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 83, 9);
    doc.text("Prev Dues Cleared:", summaryX + 4, sy);
    doc.text("+ " + fmt(prevCleared), pageWidth - margin - 4, sy, { align: "right" });
    sy += 6;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text("Total Paid Today:", summaryX + 4, sy);
    doc.text(fmt(advance + prevCleared), pageWidth - margin - 4, sy, { align: "right" });
    sy += 6;
  }

  // Pending Balance
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  if (balance > 0) {
    doc.setTextColor(220, 38, 38); // Red
    doc.text("Pending Balance:", summaryX + 4, sy);
    doc.text(fmt(balance), pageWidth - margin - 4, sy, { align: "right" });
  } else {
    doc.setTextColor(22, 163, 74); // Green
    doc.text("Balance Due:", summaryX + 4, sy);
    doc.text(fmt(0) + " (PAID)", pageWidth - margin - 4, sy, { align: "right" });
  }

  // Left of summary: Status Banner & Payment Mode Info
  const leftBoxW = contentWidth - summaryWidth - 6;
  if (balance > 0) {
    doc.setFillColor(254, 242, 242); // Red light
    doc.setDrawColor(248, 113, 113); // Red border
    doc.roundedRect(margin, y, leftBoxW, 26, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text("PENDING BALANCE RECORD", margin + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(153, 27, 27);
    doc.text(`Customer has a pending balance of ${fmt(balance)}.`, margin + 4, y + 12);
    doc.text(`Advance paid today: ${fmt(advance)} via ${paymentMode}.`, margin + 4, y + 17);
    doc.text(`Kindly clear pending balance on next appointment.`, margin + 4, y + 22);
  } else {
    doc.setFillColor(240, 253, 244); // Green light
    doc.setDrawColor(134, 239, 172); // Green border
    doc.roundedRect(margin, y, leftBoxW, 26, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(21, 128, 61);
    doc.text("FULL PAYMENT CONFIRMATION", margin + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(22, 101, 52);
    doc.text(`Total ${fmt(total)} received in full via ${paymentMode}.`, margin + 4, y + 12);
    doc.text(`Balance Due: Rs. 0 (Zero Pending). Thank you!`, margin + 4, y + 18);
  }

  // 5. Notes / Description (if provided)
  const cleanNote = (invoice?.description || "")
    .replace(/---ITEMS_JSON---[\s\S]*/g, "")
    .replace(/---PAYMENT_META---[\s\S]*/g, "")
    .trim();

  let footerY = Math.max(y + summaryBoxH + 8, 240);
  if (cleanNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Note: " + cleanNote.slice(0, 120), margin, footerY);
    footerY += 6;
  }

  // 6. Professional Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Thank you for visiting ${shopName}!`, pageWidth / 2, footerY + 6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text("This is a computer-generated invoice and requires no physical signature.", pageWidth / 2, footerY + 11, { align: "center" });

  const filename = `Invoice_${invoiceNumber}.pdf`;
  const blob = doc.output("blob");
  let file = null;
  try {
    if (typeof File !== "undefined") {
      file = new File([blob], filename, { type: "application/pdf" });
    }
  } catch {}

  return { doc, filename, blob, file };
}

export function downloadInvoicePDF(invoice, shopSettings = null) {
  const { doc, filename } = generateInvoicePDF(invoice, shopSettings);
  doc.save(filename);
  return filename;
}

export async function shareInvoicePDFOnWhatsApp(invoice, shopSettings = null, customMessage = null) {
  const { doc, filename, file } = generateInvoicePDF(invoice, shopSettings);
  const phone = invoice?.customerMobile || invoice?.mobile || "";
  const message = customMessage || invoiceMessage(invoice, shopSettings);

  // 1. If Web Share API with files is supported (mobile Chrome / Safari / Android / iOS)
  if (typeof navigator !== "undefined" && navigator.canShare && file) {
    try {
      const shareData = {
        files: [file],
        title: `${shopSettings?.name || "Invoice"} - ${invoice?.invoiceNumber || ""}`,
        text: message
      };
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return { success: true, method: "native_share", filename };
      }
    } catch (err) {
      if (err.name === "AbortError") {
        return { success: false, cancelled: true };
      }
      console.warn("Native file share note, falling back to download + wa.me:", err);
    }
  }

  // 2. Direct download + WhatsApp fallback
  try {
    doc.save(filename);
  } catch (saveErr) {
    console.warn("Direct PDF save error:", saveErr);
  }

  openWhatsApp(message, phone);
  return { success: true, method: "download_and_chat", filename };
}
