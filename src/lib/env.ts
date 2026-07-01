/**
 * env.ts — Environment variable validation
 *
 * IMPORTANT: This file MUST NOT throw during Next.js build phase.
 * Build-time env vars are not injected by Railway — they only exist at runtime.
 *
 * Rules:
 *   - During build (NEXT_PHASE=phase-production-build): warn only, never throw
 *   - During runtime in production: throw on missing critical vars (hard fail)
 *   - During development: warn and continue
 *
 * Usage: Call validateEnv() inside API route handlers, never at module scope.
 */

// next/constants re-export — available at build and runtime
const isBuildPhase =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export';

const isProd = process.env.NODE_ENV === 'production';

// ── Exports for direct use in API routes ────────────────────────────────────

export const GOOGLE_CLIENT_ID        = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET    = process.env.GOOGLE_CLIENT_SECRET;
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
export const CRON_SECRET             = process.env.CRON_SECRET;
export const MONGODB_URI             = process.env.MONGODB_URI;

// ── Validation config ────────────────────────────────────────────────────────

type EnvVar = { key: string; label: string; placeholder?: string };

const CRITICAL: EnvVar[] = [
  { key: 'MONGODB_URI',   label: 'MongoDB URI' },
  { key: 'JWT_SECRET',    label: 'JWT Secret' },
  { key: 'CRON_SECRET',   label: 'Cron Secret (protects cron endpoints)' },
  { key: 'BREVO_API_KEY', label: 'Brevo Transactional API Key' },
  { key: 'SENDER_EMAIL',  label: 'Sender Email Address' },
  { key: 'ADMIN_EMAIL',   label: 'Admin notification email' },
];

const OPTIONAL: EnvVar[] = [
  { key: 'RAZORPAY_KEY_ID',          label: 'Razorpay Key ID' },
  { key: 'RAZORPAY_KEY_SECRET',      label: 'Razorpay Key Secret' },
  { key: 'RAZORPAY_WEBHOOK_SECRET',  label: 'Razorpay Webhook Secret', placeholder: 'your_razorpay_webhook_secret_here' },
  { key: 'WHATSAPP_PHONE_ID',        label: 'Meta WhatsApp Phone ID' },
  { key: 'WHATSAPP_TOKEN',           label: 'Meta WhatsApp Token' },
  { key: 'CLOUDINARY_CLOUD_NAME',    label: 'Cloudinary Cloud Name' },
  { key: 'CLOUDINARY_API_KEY',       label: 'Cloudinary API Key' },
  { key: 'CLOUDINARY_API_SECRET',    label: 'Cloudinary API Secret' },
  { key: 'GOOGLE_CLIENT_ID',         label: 'Google OAuth Client ID' },
  { key: 'GOOGLE_CLIENT_SECRET',     label: 'Google OAuth Client Secret' },
  { key: 'UPSTASH_REDIS_REST_URL',   label: 'Upstash Redis URL (rate limiting — uses in-memory if not set)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'Upstash Redis Token' },
];

function isMissing(v: EnvVar): boolean {
  const val = process.env[v.key];
  if (!val || val.trim() === '') return true;
  if (v.placeholder && val.trim() === v.placeholder) return true;
  return false;
}

export function validateEnv() {
  const criticalErrors = CRITICAL.filter(isMissing).map(v => `CRITICAL — ${v.key}: ${v.label}`);
  const optionalWarns  = OPTIONAL.filter(isMissing).map(v => `OPTIONAL — ${v.key}: ${v.label}`);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!criticalErrors.some(e => e.includes('MONGODB_URI'))) {
    const uri = process.env.MONGODB_URI || '';
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      criticalErrors.push('INVALID — MONGODB_URI: Connection string must start with mongodb:// or mongodb+srv://');
    }
  }

  if (!criticalErrors.some(e => e.includes('JWT_SECRET'))) {
    const jwt = process.env.JWT_SECRET || '';
    if (jwt.length < 32) {
      criticalErrors.push('INVALID — JWT_SECRET: Secret must be at least 32 characters long for production security');
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  if (appUrl && !appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
    criticalErrors.push('INVALID — NEXT_PUBLIC_APP_URL: Must be a valid URL starting with http:// or https://');
  }

  if (!criticalErrors.some(e => e.includes('ADMIN_EMAIL'))) {
    if (!emailRegex.test(process.env.ADMIN_EMAIL || '')) {
      criticalErrors.push('INVALID — ADMIN_EMAIL: Must be a valid email format');
    }
  }

  if (!criticalErrors.some(e => e.includes('SENDER_EMAIL'))) {
    if (!emailRegex.test(process.env.SENDER_EMAIL || '')) {
      criticalErrors.push('INVALID — SENDER_EMAIL: Must be a valid email format');
    }
  }

  return {
    valid:             criticalErrors.length === 0,
    errors:            criticalErrors,
    warnings:          optionalWarns,
    redisEnabled:      !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    whatsappEnabled:   !!(process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN),
    paymentEnabled:    !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    cloudinaryEnabled: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  };
}

// ── Boot-time check (RUNTIME ONLY — skipped during build) ───────────────────

if (!isBuildPhase) {
  const check = validateEnv();

  if (!check.valid) {
    const errMsg =
      `[OPS Platform] ❌ FATAL — Missing critical environment variables:\n` +
      check.errors.map(e => `  • ${e}`).join('\n') +
      `\n\nFix these in Railway Service → Variables tab.`;

    if (isProd) {
      // Hard fail in production runtime to surface misconfig immediately
      throw new Error(errMsg);
    } else {
      console.error(errMsg);
    }
  }

  if (check.warnings.length > 0) {
    console.warn(
      `[OPS Platform] ⚠️  Optional env vars not configured (features disabled):\n` +
      check.warnings.map(w => `  • ${w}`).join('\n')
    );
  }

  if (!check.redisEnabled) {
    console.warn('[OPS Platform] ⚠️  UPSTASH_REDIS not configured — using in-memory rate limiter (resets on deploy).');
  }

  // Zapier configuration warnings
  const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;
  const zapierKey = process.env.ZAPIER_API_KEY;
  if (zapierUrl && (!zapierKey || zapierKey.trim() === '')) {
    console.warn('[OPS Platform] ⚠️  [Zapier] ZAPIER_WEBHOOK_URL is set but ZAPIER_API_KEY is missing. Inbound validation will fail or trigger security alerts.');
  }
  if (zapierKey && (!zapierUrl || zapierUrl.trim() === '')) {
    console.warn('[OPS Platform] ⚠️  [Zapier] ZAPIER_API_KEY is set but ZAPIER_WEBHOOK_URL is missing. Outbound webhooks will be skipped.');
  }
}
