import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { uploadToCloudinary, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from '@/lib/cloudinary';

/**
 * POST /api/chat/upload
 * Accepts: multipart/form-data with field `file`
 * Returns: { success, attachment: { url, publicId, name, size, mimeType, resourceType } }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type))
      return NextResponse.json({ error: `File type "${file.type}" is not allowed` }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES)
      return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });

    // Convert to base64 data URI for Cloudinary uploader
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    const result = await uploadToCloudinary(dataUri, file.name, 'ops_platform/chat_attachments');

    return NextResponse.json({
      success: true,
      attachment: {
        url:          result.secureUrl,
        publicId:     result.publicId,
        name:         file.name,
        size:         file.size,
        mimeType:     file.type,
        resourceType: result.resourceType,
      },
    });
  } catch (err: any) {
    console.error('[Chat Upload]', err);
    return NextResponse.json({ error: err.message ?? 'Upload failed' }, { status: 500 });
  }
}
