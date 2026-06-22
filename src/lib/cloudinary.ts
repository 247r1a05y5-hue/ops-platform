import { v2 as cloudinary } from 'cloudinary';

// ─── Configure once ──────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]);

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadResult {
  publicId:  string;
  secureUrl: string;
  format:    string;
  bytes:     number;
  resourceType: string;
}

export async function uploadToCloudinary(
  base64Data: string,
  fileName:   string,
  folder:     string = 'ops_platform/documents'
): Promise<UploadResult> {
  // Validate data URI format
  const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) throw new Error('Invalid file data format.');

  const mimeType = mimeMatch[1];
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`File type "${mimeType}" is not allowed.`);
  }

  // Validate size before upload
  const rawBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const sizeBytes = Math.ceil((rawBase64.length * 3) / 4);
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`);
  }

  // Use 'raw' resource type for non-images so PDFs/docs are preserved as-is
  const isImage = mimeType.startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';

  const result = await cloudinary.uploader.upload(base64Data, {
    folder,
    public_id:     sanitizeFileName(fileName),
    resource_type: resourceType,
    overwrite:     false,
    use_filename:  true,
    unique_filename: true,
  });

  return {
    publicId:     result.public_id,
    secureUrl:    result.secure_url,
    format:       result.format,
    bytes:        result.bytes,
    resourceType: result.resource_type,
  };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteFromCloudinary(
  publicId:     string,
  resourceType: string = 'image'
): Promise<boolean> {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType as 'image' | 'video' | 'raw',
  });
  return result.result === 'ok';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')       // strip extension (Cloudinary adds it)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}
