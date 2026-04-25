import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import type { PublicInvoice } from '@trainova/shared';

/**
 * Renders an immutable A4 invoice PDF for either a company-facing
 * PURCHASE invoice or a trainer self-billing PAYOUT_STATEMENT. Output
 * is deterministic given the same input — no timestamps, no asset
 * embedding — so hashing the byte stream is a valid integrity check.
 *
 * Uses pdfkit's built-in Helvetica (WinAnsi) so characters outside
 * CP-1252 must be avoided; all caller-supplied text is already
 * ASCII-compatible (legal names, country codes, money).
 */
export function renderInvoicePdf(inv: PublicInvoice): Readable {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `Trainova Invoice ${inv.number}`,
      Author: 'Trainova AI',
      Subject: inv.kind === 'PURCHASE' ? 'Invoice' : 'Payout statement',
    },
  });

  const ink = '#0f172a';
  const muted = '#64748b';
  const brand = '#4f46e5';
  const line = '#e2e8f0';
  const accent = '#f8fafc';

  const money = (cents: number) =>
    `${inv.currency} ${(cents / 100).toFixed(2)}`;
  const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  const drawRule = () => {
    doc
      .moveTo(doc.page.margins.left, doc.y + 4)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
      .lineWidth(0.5)
      .strokeColor(line)
      .stroke();
    doc.moveDown(0.8);
  };

  // ===== Header =====
  doc.fillColor(brand).font('Helvetica-Bold').fontSize(22).text('Trainova AI');
  doc.moveDown(0.1);
  doc
    .fillColor(muted)
    .font('Helvetica')
    .fontSize(9)
    .text(
      inv.kind === 'PURCHASE'
        ? 'Tax invoice — issued by Trainova AI on behalf of the platform.'
        : 'Self-billing payout statement — issued on the recipient\'s behalf under a self-billing agreement.',
    );

  // Invoice meta — aligned to the right edge.
  const rightX = doc.page.width - doc.page.margins.right - 180;
  const metaTopY = 48;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(ink)
    .text(
      inv.kind === 'PURCHASE' ? 'INVOICE' : 'PAYOUT STATEMENT',
      rightX,
      metaTopY,
      { width: 180, align: 'right' },
    );
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(muted)
    .text(`No. ${inv.number}`, rightX, metaTopY + 16, {
      width: 180,
      align: 'right',
    })
    .text(`Issued ${inv.issuedAt.slice(0, 10)}`, rightX, metaTopY + 30, {
      width: 180,
      align: 'right',
    })
    .text(`Status ${inv.status}`, rightX, metaTopY + 44, {
      width: 180,
      align: 'right',
    });

  // Reset cursor below the header block.
  doc.x = doc.page.margins.left;
  doc.y = Math.max(doc.y, metaTopY + 70);
  drawRule();

  // ===== Parties =====
  const colWidth =
    (doc.page.width - doc.page.margins.left - doc.page.margins.right - 24) / 2;
  const partiesY = doc.y;

  const drawParty = (
    title: string,
    name: string,
    country: string | null,
    taxId: string | null,
    address: string | null,
    x: number,
  ) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
    doc.text(title.toUpperCase(), x, partiesY, { width: colWidth });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ink);
    doc.text(name, x, partiesY + 12, { width: colWidth });
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    let y = partiesY + 28;
    if (address) {
      doc.text(address, x, y, { width: colWidth });
      y += doc.heightOfString(address, { width: colWidth }) + 2;
    }
    if (country) {
      doc.text(country, x, y, { width: colWidth });
      y += 11;
    }
    if (taxId) {
      doc.fillColor(muted).text(`Tax ID: ${taxId}`, x, y, { width: colWidth });
    }
  };

  drawParty(
    inv.kind === 'PURCHASE' ? 'Seller' : 'Buyer (platform)',
    inv.issuerName,
    inv.issuerCountry,
    inv.issuerTaxId,
    inv.issuerAddress,
    doc.page.margins.left,
  );
  drawParty(
    inv.kind === 'PURCHASE' ? 'Buyer' : 'Seller (recipient)',
    inv.recipientName,
    inv.recipientCountry,
    inv.recipientTaxId,
    inv.recipientAddress,
    doc.page.margins.left + colWidth + 24,
  );

  doc.y = partiesY + 92;
  doc.x = doc.page.margins.left;
  drawRule();

  // ===== Line items table =====
  const tableX = doc.page.margins.left;
  const tableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colDesc = tableW * 0.5;
  const colQty = tableW * 0.12;
  const colUnit = tableW * 0.18;
  const colTotal = tableW * 0.2;

  const headerY = doc.y;
  doc
    .rect(tableX, headerY - 4, tableW, 20)
    .fillColor(accent)
    .fill();
  doc.fillColor(muted).font('Helvetica-Bold').fontSize(9);
  doc.text('Description', tableX + 6, headerY, { width: colDesc - 6 });
  doc.text('Qty', tableX + colDesc, headerY, {
    width: colQty,
    align: 'right',
  });
  doc.text('Unit', tableX + colDesc + colQty, headerY, {
    width: colUnit - 6,
    align: 'right',
  });
  doc.text('Total', tableX + colDesc + colQty + colUnit, headerY, {
    width: colTotal - 6,
    align: 'right',
  });
  doc.y = headerY + 20;
  doc.x = tableX;

  doc.font('Helvetica').fontSize(10).fillColor(ink);
  for (const item of inv.lineItems) {
    const rowY = doc.y + 4;
    doc.text(item.description, tableX + 6, rowY, { width: colDesc - 6 });
    doc.text(item.quantity.toString(), tableX + colDesc, rowY, {
      width: colQty,
      align: 'right',
    });
    doc.text(money(item.unitCents), tableX + colDesc + colQty, rowY, {
      width: colUnit - 6,
      align: 'right',
    });
    doc.text(
      money(item.totalCents),
      tableX + colDesc + colQty + colUnit,
      rowY,
      { width: colTotal - 6, align: 'right' },
    );
    const rowH = Math.max(
      14,
      doc.heightOfString(item.description, { width: colDesc - 6 }) + 4,
    );
    doc.y = rowY + rowH;
    doc.x = tableX;
  }

  doc.moveDown(0.6);
  drawRule();

  // ===== Totals =====
  const totalsX = tableX + tableW - 220;
  const totalsW = 220;
  const writeTotal = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 10)
      .fillColor(bold ? ink : muted)
      .text(label, totalsX, y, { width: 110 });
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 10)
      .fillColor(ink)
      .text(value, totalsX + 110, y, { width: totalsW - 110, align: 'right' });
    doc.y = y + (bold ? 16 : 14);
    doc.x = doc.page.margins.left;
  };

  writeTotal('Subtotal', money(inv.subtotalCents));
  if (inv.reverseCharge) {
    writeTotal(
      `${inv.taxLabel ?? 'Tax'} (reverse charge)`,
      money(0),
    );
  } else if (inv.taxRateBps > 0) {
    writeTotal(
      `${inv.taxLabel ?? 'Tax'} ${pct(inv.taxRateBps)}`,
      money(inv.taxAmountCents),
    );
  } else {
    writeTotal(`${inv.taxLabel ?? 'Tax'}`, money(0));
  }
  writeTotal('Total', money(inv.totalCents), true);

  // ===== Notes =====
  if (inv.taxNote) {
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(muted)
      .text(inv.taxNote, doc.page.margins.left, doc.y, {
        width: tableW,
      });
  }
  if (inv.notes) {
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(muted)
      .text(inv.notes, doc.page.margins.left, doc.y, { width: tableW });
  }

  // ===== Footer =====
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(muted)
    .text(
      'Generated by Trainova AI — trainova.ai',
      doc.page.margins.left,
      footerY,
      {
        width: tableW,
        align: 'center',
      },
    );

  doc.end();
  return doc as unknown as Readable;
}
