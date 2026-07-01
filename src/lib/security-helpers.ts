/**
 * security-helpers.ts — Security utilities for input sanitization and validation.
 */

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
]);

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'
]);

/**
 * Recursively sanitizes input objects by stripping keys that start with "$"
 * to prevent NoSQL Injection attacks.
 */
export function sanitizeNoSql(input: any): any {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    return input.map(sanitizeNoSql);
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(input)) {
      if (key.startsWith('$')) {
        // Strip out MongoDB operators from user-supplied keys
        continue;
      }
      sanitized[key] = sanitizeNoSql(val);
    }
    return sanitized;
  }

  return input;
}

/**
 * Checks if a given filename contains any path traversal characters
 * or dangerous characters.
 */
export function isValidFilename(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') return false;
  
  // Block directory traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    return false;
  }

  // Allow standard alphanumeric characters, dashes, underscores, and dots
  const safePattern = /^[a-zA-Z0-9_\-\.]+$/;
  return safePattern.test(fileName);
}

/**
 * Validates that the uploaded file's MIME type and extension are safe and whitelisted.
 */
export function isAllowedFile(mimeType: string, extension: string): boolean {
  const cleanMime = (mimeType || '').toLowerCase().trim();
  const cleanExt = (extension || '').toLowerCase().replace(/^\./, '').trim();

  return ALLOWED_MIME_TYPES.has(cleanMime) && ALLOWED_EXTENSIONS.has(cleanExt);
}

/**
 * Stub placeholder for virus scanning integration.
 * Replace with real clamav/attachment scanner API if available.
 */
export async function scanFileForViruses(_base64Data: string): Promise<boolean> {
  // Placeholder virus check — always returns true (clean) for now
  return true;
}
