/**
 * proposalService.ts — Enterprise Proposal PDF Generation & Management
 *
 * Provides:
 *  - generateProposalPDF()    — rich jsPDF layout with branding, tables, milestones
 *  - uploadProposalToCloudinary() — typed Cloudinary upload
 *  - computeProposalTotals()  — pure pricing calculations
 *  - generateSecureToken()    — crypto-safe public link token
 */

import { jsPDF } from 'jspdf';
import crypto from 'crypto';
import { uploadToCloudinary } from './cloudinary';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposalService {
  price: number;
  quantity: number;
  name: string;
  description: string;
  unit: string;
}

export interface ProposalMilestone {
  name: string;
  description: string;
  dueDate?: Date | string;
  deliverables: string[];
}

export interface ProposalBranding {
  primaryColor: string;
  companyName: string;
  tagline: string;
}

export interface ProposalData {
  _id: string;
  version: number;
  title: string;
  subtitle: string;
  introduction: string;
  services: ProposalService[];
  milestones: ProposalMilestone[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  notes: string;
  terms: string;
  validUntil?: Date | string;
  signatureName: string;
  signatureTitle: string;
  footerText: string;
  branding: ProposalBranding;
}

export interface LeadContext {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
}

export interface ProposalTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 40-char hex token for the shareable link */
export function generateSecureToken(): string {
  return crypto.randomBytes(20).toString('hex');
}

/** Pure calculation of proposal financial totals */
export function computeProposalTotals(
  services: Pick<ProposalService, 'price' | 'quantity'>[],
  discountPct: number,
  taxPct: number
): ProposalTotals {
  const subtotal = services.reduce((sum, s) => sum + s.price * (s.quantity || 1), 0);
  const discountAmount = (subtotal * Math.max(0, Math.min(100, discountPct))) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = (afterDiscount * Math.max(0, Math.min(100, taxPct))) / 100;
  const total = afterDiscount + taxAmount;
  return { subtotal, discountAmount, taxAmount, total };
}

/** Format a currency value for the PDF */
function formatCurrency(amount: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

/** Parse a hex color (#4f46e5) into [r, g, b] for jsPDF setTextColor/setFillColor */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Generate a full enterprise proposal PDF using jsPDF.
 * Returns the base64 dataURI string for upload.
 */
export function generateProposalPDF(proposal: ProposalData, lead: LeadContext): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  const [pr, pg, pb] = hexToRgb(proposal.branding.primaryColor || '#4f46e5');

  let y = 0;

  // ── Header Band ─────────────────────────────────────────────────────────────
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, pageW, 52, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(proposal.branding.companyName || 'Company', margin, 20);

  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 240);
  doc.text(proposal.branding.tagline || '', margin, 28);

  // Proposal title (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const titleText = proposal.title || 'Enterprise Proposal';
  doc.text(titleText, pageW - margin, 20, { align: 'right' });

  // Version badge
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 255);
  doc.text(`Version ${proposal.version} · ${new Date().toLocaleDateString('en-IN')}`, pageW - margin, 28, { align: 'right' });

  y = 62;

  // ── Prepared For block ──────────────────────────────────────────────────────
  doc.setFillColor(248, 249, 252);
  doc.roundedRect(margin, y, contentW, 28, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(pr, pg, pb);
  doc.text('PREPARED FOR', margin + 6, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(lead.name, margin + 6, y + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${lead.company} · ${lead.email}${lead.phone ? ` · ${lead.phone}` : ''}`, margin + 6, y + 21);

  if (proposal.validUntil) {
    const validStr = new Date(proposal.validUntil).toLocaleDateString('en-IN');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(pr, pg, pb);
    doc.text(`VALID UNTIL: ${validStr}`, pageW - margin - 6, y + 15, { align: 'right' });
  }

  y += 36;

  // ── Introduction ────────────────────────────────────────────────────────────
  if (proposal.introduction) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(pr, pg, pb);
    doc.text('Introduction', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const introLines = doc.splitTextToSize(proposal.introduction, contentW);
    doc.text(introLines, margin, y);
    y += introLines.length * 5 + 8;
  }

  // ── Services / Scope of Work Table ─────────────────────────────────────────
  if (proposal.services.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(pr, pg, pb);
    doc.text('Scope of Work', margin, y);
    y += 6;

    // Table header
    const colW = [contentW * 0.38, contentW * 0.30, contentW * 0.12, contentW * 0.09, contentW * 0.11];
    const headers = ['Service / Deliverable', 'Description', 'Unit Price', 'Qty', 'Amount'];

    doc.setFillColor(pr, pg, pb);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let cx = margin;
    headers.forEach((h, i) => {
      doc.text(h, cx + 3, y + 5.5);
      cx += colW[i];
    });
    y += 8;

    // Table rows
    proposal.services.forEach((svc, idx) => {
      const rowH = 10;
      // Alternating row fill
      if (idx % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);

      const amount = svc.price * (svc.quantity || 1);
      let cx2 = margin;
      const rowData = [
        svc.name,
        svc.description || '—',
        formatCurrency(svc.price, proposal.currency),
        String(svc.quantity || 1),
        formatCurrency(amount, proposal.currency),
      ];
      rowData.forEach((cell, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        const clipped = doc.splitTextToSize(cell, colW[i] - 4);
        doc.text(clipped[0] || '', cx2 + 3, y + 6.5);
        cx2 += colW[i];
      });

      // bottom border
      doc.setDrawColor(220, 220, 230);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);
      y += rowH;
    });

    // Totals block
    y += 4;
    const totalsX = margin + contentW * 0.6;
    const totalsW = contentW * 0.4;

    const addTotalRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        doc.setFillColor(pr, pg, pb);
        doc.rect(totalsX, y - 4, totalsW, 9, 'F');
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setTextColor(60, 60, 60);
      }
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.text(label, totalsX + 4, y + 1);
      doc.text(value, totalsX + totalsW - 4, y + 1, { align: 'right' });
      y += 9;
    };

    addTotalRow('Subtotal', formatCurrency(proposal.subtotal, proposal.currency));
    if (proposal.discount > 0)
      addTotalRow(`Discount (${proposal.discount}%)`, `- ${formatCurrency((proposal.subtotal * proposal.discount) / 100, proposal.currency)}`);
    if (proposal.tax > 0)
      addTotalRow(`Tax / GST (${proposal.tax}%)`, formatCurrency(((proposal.subtotal - (proposal.subtotal * proposal.discount) / 100) * proposal.tax) / 100, proposal.currency));
    addTotalRow('TOTAL AMOUNT', formatCurrency(proposal.total, proposal.currency), true, true);

    y += 10;
  }

  // ── Milestones ──────────────────────────────────────────────────────────────
  if (proposal.milestones.length > 0) {
    // New page if needed
    if (y > pageH - 80) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(pr, pg, pb);
    doc.text('Project Milestones', margin, y);
    y += 8;

    proposal.milestones.forEach((ms, idx) => {
      if (y > pageH - 50) { doc.addPage(); y = 20; }

      // Milestone circle badge
      doc.setFillColor(pr, pg, pb);
      doc.circle(margin + 4, y, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(String(idx + 1), margin + 4, y + 1, { align: 'center' });

      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(ms.name, margin + 12, y + 1);

      if (ms.dueDate) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text(`Due: ${new Date(ms.dueDate).toLocaleDateString('en-IN')}`, pageW - margin, y + 1, { align: 'right' });
      }
      y += 7;

      if (ms.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        const descLines = doc.splitTextToSize(ms.description, contentW - 12);
        doc.text(descLines, margin + 12, y);
        y += descLines.length * 5;
      }

      if (ms.deliverables?.length > 0) {
        ms.deliverables.forEach(d => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(100, 100, 100);
          doc.text(`• ${d}`, margin + 14, y);
          y += 5;
        });
      }
      y += 4;
    });
    y += 4;
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  if (proposal.notes) {
    if (y > pageH - 50) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(pr, pg, pb);
    doc.text('Notes', margin, y);
    y += 6;

    doc.setFillColor(255, 251, 235);
    const noteLines = doc.splitTextToSize(proposal.notes, contentW - 8);
    doc.roundedRect(margin, y - 2, contentW, noteLines.length * 5 + 6, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(noteLines, margin + 4, y + 3);
    y += noteLines.length * 5 + 10;
  }

  // ── Terms & Conditions ──────────────────────────────────────────────────────
  if (proposal.terms) {
    if (y > pageH - 60) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(pr, pg, pb);
    doc.text('Terms & Conditions', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    const termLines = doc.splitTextToSize(proposal.terms, contentW);
    doc.text(termLines, margin, y);
    y += termLines.length * 5 + 10;
  }

  // ── Signature Block ─────────────────────────────────────────────────────────
  if (proposal.signatureName) {
    if (y > pageH - 40) { doc.addPage(); y = 20; }

    // Signature line
    doc.setDrawColor(pr, pg, pb);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 14, margin + 60, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(proposal.signatureName, margin, y + 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(proposal.signatureTitle || '', margin, y + 26);
    y += 34;
  }

  // ── Footer (every page) ─────────────────────────────────────────────────────
  const totalPages = (doc.internal as any).pages?.length - 1 || 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(220, 220, 240);
    const footerLeft = proposal.footerText || `${proposal.branding.companyName} — Confidential`;
    doc.text(footerLeft, margin, pageH - 4);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' });
  }

  return doc.output('datauristring');
}

// ─── Cloudinary Upload ────────────────────────────────────────────────────────

export interface ProposalUploadResult {
  secureUrl: string;
  publicId: string;
}

/**
 * Upload a proposal PDF (base64 dataURI) to Cloudinary.
 * Returns the secure URL and publicId for deletion/versioning.
 */
export async function uploadProposalToCloudinary(
  base64DataUri: string,
  proposalId: string,
  version: number
): Promise<ProposalUploadResult> {
  const publicIdName = `proposal_v${version}_${proposalId}_${Date.now()}`;
  const result = await uploadToCloudinary(base64DataUri, publicIdName);
  return { secureUrl: result.secureUrl, publicId: result.publicId };
}
