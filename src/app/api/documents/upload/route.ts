import { NextRequest, NextResponse } from 'next/server';
import { connectDB, Lead } from '@/lib/db';
import { requireAuth, csrfCheck } from '@/lib/require-auth';
import { uploadToCloudinary, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from '@/lib/cloudinary';
import { logActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  const csrfError = csrfCheck(req);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const body = await req.json();
    const { leadId, fileName, fileData, fileSize } = body;

    // ── Input validation ──────────────────────────────────────────────────
    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ success: false, error: 'fileName is required.' }, { status: 400 });
    }
    if (!fileData || typeof fileData !== 'string') {
      return NextResponse.json({ success: false, error: 'fileData is required.' }, { status: 400 });
    }

    // Validate MIME type before hitting Cloudinary
    const mimeMatch = fileData.match(/^data:([^;]+);base64,/);
    if (!mimeMatch) {
      return NextResponse.json({ success: false, error: 'Invalid file data format.' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(mimeMatch[1])) {
      return NextResponse.json(
        { success: false, error: `File type "${mimeMatch[1]}" is not permitted.` },
        { status: 415 }
      );
    }

    // Validate size (base64 → approximate raw bytes)
    const rawB64 = fileData.replace(/^data:[^;]+;base64,/, '');
    const approxBytes = Math.ceil((rawB64.length * 3) / 4);
    if (approxBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    // ── Upload to Cloudinary ──────────────────────────────────────────────
    const uploaded = await uploadToCloudinary(fileData, fileName);

    const documentRecord = {
      name:         fileName,
      size:         fileSize || `${(uploaded.bytes / 1024 / 1024).toFixed(2)} MB`,
      url:          uploaded.secureUrl,
      publicId:     uploaded.publicId,
      resourceType: uploaded.resourceType,
      uploadedAt:   new Date(),
    };

    // ── Persist to MongoDB ────────────────────────────────────────────────
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (!lead) {
        return NextResponse.json({ success: false, error: 'Lead not found.' }, { status: 404 });
      }
      lead.documents.push(documentRecord);
      lead.history.push({
        event: `Uploaded document: ${fileName}`,
        user:  session.name,
        time:  new Date(),
      });
      await lead.save();
    }

    await logActivity({
      userId: session.sub,
      actionType: 'upload',
      module: 'Media',
      description: `Uploaded media document "${fileName}" for Lead ID: ${leadId || 'General'}`,
      req,
    }).catch(console.error);

    // Enterprise Audit Log
    try {
      const { logAudit } = await import('@/lib/audit');
      await logAudit({
        action: 'upload_document',
        module: 'Documents',
        entityId: leadId || 'general',
        entityType: 'Document',
        newValue: documentRecord,
        session,
        req,
      });
    } catch (err: any) {
      console.error('[AuditLog] Upload document audit log failed:', err.message);
    }

    return NextResponse.json({ success: true, document: documentRecord });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
