import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { deleteFromCloudinary } from '@/lib/cloudinary';

export async function DELETE(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const leadId   = searchParams.get('leadId');
    const publicId = searchParams.get('publicId');

    if (!leadId || !publicId) {
      return NextResponse.json(
        { success: false, error: 'leadId and publicId are required.' },
        { status: 400 }
      );
    }

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
    }

    // Find the document to get its resourceType before deletion
    const doc = lead.documents.find((d: any) => d.publicId === publicId);
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found on this lead.' }, { status: 404 });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(publicId, doc.resourceType ?? 'image');

    // Remove from MongoDB
    lead.documents = lead.documents.filter((d: any) => d.publicId !== publicId);
    lead.history.push({
      event: `Deleted document: ${doc.name}`,
      user:  session.name,
      time:  new Date(),
    });
    await lead.save();

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'delete_document',
        module: 'Documents',
        entityId: leadId,
        entityType: 'Document',
        oldValue: doc,
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Delete document audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, message: 'Document deleted.' });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
