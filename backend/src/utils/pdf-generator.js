// backend/src/utils/pdf-generator.js
// Generates branded invoice/quote PDFs using PDFKit.
// No headless chrome needed — pure Node, lightweight, deterministic.

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');

// Brand colours
const BRAND = {
    dark:    '#0a0a0a',
    accent:  '#10d98f',   // FLT circuit-board green
    text:    '#1a1a1a',
    muted:   '#6b7280',
    border:  '#e5e7eb',
    light:   '#f9fafb',
};

const fmtGBP = (n) => `£${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

function drawHeader(doc, profile, docType, docNumber) {
    // Black header band — fits FLT's logo aesthetic
    doc.rect(0, 0, doc.page.width, 130).fill(BRAND.dark);

    // Logo (top-left in the black band)
    if (fs.existsSync(LOGO_PATH)) {
        try {
            doc.image(LOGO_PATH, 40, 25, { width: 90 });
        } catch (e) {
            // Image load failed — keep going without it
        }
    }

    // Doc type + number (top-right, white on black)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28)
       .text(docType.toUpperCase(), 350, 35, { width: 200, align: 'right' });
    doc.font('Helvetica').fontSize(11).fillColor(BRAND.accent)
       .text(`#${docNumber}`, 350, 70, { width: 200, align: 'right' });
    if (profile.tagline) {
        doc.fillColor('#ffffff').fontSize(9)
           .text(profile.tagline, 350, 90, { width: 200, align: 'right' });
    }
}

function drawBusinessAndClient(doc, profile, client, dateLabel, dateValue, dueLabel, dueValue) {
    let y = 160;

    // FROM (business)
    doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
       .text('FROM', 40, y);
    y += 14;
    doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(11)
       .text(profile.name || 'Fast Lane Technology', 40, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.text);
    if (profile.address) {
        const lines = profile.address.split('\n');
        for (const line of lines) {
            doc.text(line, 40, y);
            y += 12;
        }
    }
    if (profile.email)         { doc.text(profile.email, 40, y); y += 12; }
    if (profile.phone)         { doc.text(profile.phone, 40, y); y += 12; }
    if (profile.website)       { doc.text(profile.website, 40, y); y += 12; }
    if (profile.vat_number)    { doc.text(`VAT no. ${profile.vat_number}`, 40, y); y += 12; }
    if (profile.company_number){ doc.text(`Co. no. ${profile.company_number}`, 40, y); y += 12; }

    // BILL TO (client)
    let cy = 160;
    doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
       .text('BILL TO', 300, cy);
    cy += 14;
    if (client) {
        doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(11)
           .text(client.company || client.name, 300, cy);
        cy += 14;
        doc.font('Helvetica').fontSize(9);
        if (client.company && client.name && client.company !== client.name) {
            doc.text(`Attn: ${client.name}`, 300, cy); cy += 12;
        }
        if (client.address) {
            for (const line of client.address.split('\n')) {
                doc.text(line, 300, cy); cy += 12;
            }
        }
        if (client.email) { doc.text(client.email, 300, cy); cy += 12; }
        if (client.phone) { doc.text(client.phone, 300, cy); cy += 12; }
    } else {
        doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9)
           .text('No client assigned', 300, cy);
    }

    // Dates (small block, right side under client block)
    let dy = Math.max(y, cy) + 18;
    doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
       .text(dateLabel.toUpperCase(), 300, dy);
    doc.fillColor(BRAND.text).font('Helvetica').fontSize(10)
       .text(fmtDate(dateValue), 300, dy + 11);
    if (dueLabel && dueValue) {
        doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
           .text(dueLabel.toUpperCase(), 430, dy);
        doc.fillColor(BRAND.text).font('Helvetica').fontSize(10)
           .text(fmtDate(dueValue), 430, dy + 11);
    }

    return dy + 40;
}

function drawLineItems(doc, lineItems, fallbackAmount, startY) {
    let y = startY;
    const cols = { desc: 40, qty: 350, rate: 410, total: 480 };
    const rowHeight = 24;

    // Header row
    doc.rect(40, y, doc.page.width - 80, 26).fill(BRAND.dark);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', cols.desc + 6,  y + 9);
    doc.text('QTY',          cols.qty,       y + 9, { width: 50, align: 'right' });
    doc.text('RATE',          cols.rate,     y + 9, { width: 60, align: 'right' });
    doc.text('TOTAL',         cols.total,    y + 9, { width: 75, align: 'right' });
    y += 32;

    const items = (lineItems && lineItems.length) ? lineItems : null;

    if (items) {
        doc.fillColor(BRAND.text).font('Helvetica').fontSize(10);
        let i = 0;
        for (const li of items) {
            // Alternate row shading
            if (i % 2 === 1) {
                doc.rect(40, y - 4, doc.page.width - 80, rowHeight).fill(BRAND.light);
                doc.fillColor(BRAND.text);
            }
            const desc = String(li.description || '').slice(0, 80);
            doc.text(desc,                       cols.desc + 6,  y, { width: 290 });
            doc.text(String(li.quantity || ''), cols.qty,       y, { width: 50, align: 'right' });
            doc.text(fmtGBP(li.rate),           cols.rate,      y, { width: 60, align: 'right' });
            doc.font('Helvetica-Bold').text(fmtGBP(li.amount), cols.total, y, { width: 75, align: 'right' });
            doc.font('Helvetica');
            y += rowHeight;
            i++;
        }
    } else {
        // No line items — single row with the lump-sum amount
        doc.fillColor(BRAND.text).font('Helvetica').fontSize(10);
        doc.text('Services rendered', cols.desc + 6, y, { width: 290 });
        doc.text('1', cols.qty, y, { width: 50, align: 'right' });
        doc.text(fmtGBP(fallbackAmount), cols.rate, y, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').text(fmtGBP(fallbackAmount), cols.total, y, { width: 75, align: 'right' });
        y += rowHeight;
    }

    // Bottom border on table
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor(BRAND.border).stroke();
    return y + 10;
}

function drawTotals(doc, amount, vatAmount, startY) {
    let y = startY;
    const labelX = 380;
    const valueX = 480;

    const net   = Number(amount || 0);
    const vat   = Number(vatAmount || 0);
    const total = net + vat;

    doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted);
    doc.text('Subtotal',    labelX, y);
    doc.fillColor(BRAND.text).text(fmtGBP(net), valueX, y, { width: 75, align: 'right' });
    y += 18;

    if (vat > 0) {
        doc.fillColor(BRAND.muted).text('VAT',       labelX, y);
        doc.fillColor(BRAND.text).text(fmtGBP(vat),  valueX, y, { width: 75, align: 'right' });
        y += 18;
    }

    // Total row — highlighted
    doc.rect(labelX - 10, y, 175, 28).fill(BRAND.dark);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL',           labelX, y + 9);
    doc.fillColor(BRAND.accent).fontSize(13).text(fmtGBP(total), valueX, y + 8, { width: 75, align: 'right' });

    return y + 50;
}

function drawFooter(doc, profile, notes) {
    const pageH = doc.page.height;
    let y = Math.min(doc.y + 30, pageH - 200);

    if (notes) {
        doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
           .text('NOTES', 40, y);
        doc.fillColor(BRAND.text).font('Helvetica').fontSize(9)
           .text(notes, 40, y + 12, { width: doc.page.width - 80 });
        y = doc.y + 16;
    }

    // Payment details box
    const hasBank = profile.bank_account_number || profile.bank_iban;
    if (hasBank || profile.payment_terms) {
        doc.rect(40, y, doc.page.width - 80, 90).fillAndStroke(BRAND.light, BRAND.border);
        let by = y + 12;
        doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(8)
           .text('PAYMENT DETAILS', 50, by);
        by += 14;
        doc.fillColor(BRAND.text).font('Helvetica').fontSize(9);

        if (hasBank) {
            const bits = [];
            if (profile.bank_name)           bits.push(profile.bank_name);
            if (profile.bank_account_name)   bits.push(`Acct name: ${profile.bank_account_name}`);
            if (profile.bank_sort_code)      bits.push(`Sort: ${profile.bank_sort_code}`);
            if (profile.bank_account_number) bits.push(`Account: ${profile.bank_account_number}`);
            if (profile.bank_iban)           bits.push(`IBAN: ${profile.bank_iban}`);
            doc.text(bits.join('  ·  '), 50, by, { width: doc.page.width - 100 });
            by = doc.y + 6;
        }
        if (profile.payment_terms) {
            doc.fillColor(BRAND.muted).fontSize(8)
               .text(profile.payment_terms, 50, by, { width: doc.page.width - 100 });
        }
    }

    // Bottom-of-page brand line
    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
       .text(profile.name || 'Fast Lane Technology', 40, pageH - 40, { width: doc.page.width - 80, align: 'center' });
}

function generateInvoicePDF(invoice, client, profile) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        drawHeader(doc, profile, 'Invoice', invoice.invoice_number);
        const afterMeta = drawBusinessAndClient(
            doc, profile, client,
            'Issue date',  invoice.issue_date,
            'Due date',    invoice.due_date
        );
        const afterTable = drawLineItems(doc, invoice.line_items, invoice.amount, afterMeta);
        drawTotals(doc, invoice.amount, invoice.vat_amount, afterTable);
        drawFooter(doc, profile, invoice.notes);

        doc.end();
    });
}

function generateQuotePDF(quote, client, profile) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        drawHeader(doc, profile, 'Quote', quote.quote_number);
        const afterMeta = drawBusinessAndClient(
            doc, profile, client,
            'Issue date',  quote.issue_date,
            'Valid until', quote.valid_until
        );
        const afterTable = drawLineItems(doc, quote.line_items, quote.amount, afterMeta);
        drawTotals(doc, quote.amount, quote.vat_amount, afterTable);
        drawFooter(doc, profile, quote.notes);

        doc.end();
    });
}

module.exports = { generateInvoicePDF, generateQuotePDF };
