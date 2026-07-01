import { withLogging } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Invoice } from '@/lib/db';
import { jsPDF } from 'jspdf';
import { requireAuth } from '@/lib/require-auth';

async function _GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    const doc = new jsPDF();
    
    // Simple styling
    doc.setFontSize(22);
    doc.text('INVOICE', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Invoice ID: ${invoice.invoiceId}`, 20, 35);
    doc.text(`Date: ${invoice.date}`, 20, 42);
    doc.text(`Due Date: ${invoice.due}`, 20, 49);
    doc.text(`Status: ${invoice.status}`, 20, 56);
    
    doc.text('Billed To:', 20, 70);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.client, 20, 77);
    doc.setFont('helvetica', 'normal');
    if (invoice.clientPhone) doc.text(invoice.clientPhone, 20, 84);
    
    // Line item
    doc.line(20, 95, 190, 95);
    doc.setFont('helvetica', 'bold');
    doc.text('Category', 20, 102);
    doc.text('Amount', 150, 102);
    doc.line(20, 105, 190, 105);
    
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.category || 'Consulting', 20, 115);
    doc.text(`INR ${invoice.amount}`, 150, 115);
    
    doc.line(20, 125, 190, 125);
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', 120, 135);
    doc.text(`INR ${invoice.amount}`, 150, 135);
    
    const pdfBuffer = doc.output('arraybuffer');
    
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=Invoice-${invoice.invoiceId}.pdf`
      }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}


// ── Request Tracing & Structured Logging Wrap ──────────────────
export const GET = withLogging(_GET);
