import { v2 as cloudinary } from 'cloudinary';
import { logStep, addExtTime, getLogStore, incrementMetric } from './logger';
import { isAllowedFile, isValidFilename, scanFileForViruses } from './security-helpers';

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

  // Path traversal check on filename
  if (!isValidFilename(fileName)) {
    throw new Error('Invalid filename: path traversal or illegal characters detected.');
  }

  // MIME and Extension checks
  const ext = fileName.split('.').pop() || '';
  if (!isAllowedFile(mimeType, ext)) {
    throw new Error(`File upload rejected: file type or extension not allowed (mime=${mimeType}, ext=${ext}).`);
  }

  // Virus scan hook check
  const isClean = await scanFileForViruses(base64Data);
  if (!isClean) {
    throw new Error('File upload rejected: potential malware detected.');
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

  logStep('EXTERNAL', `Cloudinary Upload Started\nFile: ${fileName}\nFolder: ${folder}\nResource Type: ${resourceType}`);
  const startTime = Date.now();
  const store = getLogStore();
  const requestId = store?.requestId || 'none';

  try {
    const result = await cloudinary.uploader.upload(base64Data, {
      folder,
      public_id:     sanitizeFileName(fileName),
      resource_type: resourceType,
      overwrite:     false,
      use_filename:  true,
      unique_filename: true,
      context: { request_id: requestId },
      tags: [requestId]
    });
    
    const duration = Date.now() - startTime;
    addExtTime(duration);
    logStep('EXTERNAL', `SUCCESS\nCloudinary Upload Completed\nPublic ID: ${result.public_id}\nFormat: ${result.format}\nBytes: ${result.bytes}\nDuration: ${duration} ms`);

    return {
      publicId:     result.public_id,
      secureUrl:    result.secure_url,
      format:       result.format,
      bytes:        result.bytes,
      resourceType: result.resource_type,
    };
  } catch (err: any) {
    incrementMetric('cloudinaryFailures');
    const duration = Date.now() - startTime;
    addExtTime(duration);
    logStep('EXTERNAL', `[EXTERNAL SERVICE FAILED]\nService: Cloudinary Upload\nError: ${err.message || String(err)}\nDuration: ${duration} ms`);
    throw err;
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteFromCloudinary(
  publicId:     string,
  resourceType: string = 'image'
): Promise<boolean> {
  logStep('EXTERNAL', `Cloudinary Delete Started\nPublic ID: ${publicId}\nResource Type: ${resourceType}`);
  const startTime = Date.now();

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType as 'image' | 'video' | 'raw',
    });
    const duration = Date.now() - startTime;
    addExtTime(duration);
    
    const success = result.result === 'ok';
    logStep('EXTERNAL', `${success ? 'SUCCESS' : 'FAILED'}\nCloudinary Delete Completed\nResult: ${result.result}\nDuration: ${duration} ms`);
    return success;
  } catch (err: any) {
    incrementMetric('cloudinaryFailures');
    const duration = Date.now() - startTime;
    addExtTime(duration);
    logStep('EXTERNAL', `[EXTERNAL SERVICE FAILED]\nService: Cloudinary Delete\nError: ${err.message || String(err)}\nDuration: ${duration} ms`);
    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')       // strip extension (Cloudinary adds it)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
}
