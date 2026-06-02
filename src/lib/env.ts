/**
 * env.ts — Environment variable validation
 * In production: throws on missing critical vars (hard fail at startup).
 * In development: warns but continues.
 */

const isProd = process.env.NODE_ENV === 'production';

export const GOOGLE_CLIENT_ID       = process.env.GOOGLE_CLIENT_ID;
export const GOOGLE_CLIENT_SECRET   = process.env.GOOGLE_CLIENT_SECRET;
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
export const CRON_SECRET            = process.env.CRON_SECRET;
export const MONGODB_URI            = process.env.MONGODB_URI;

type EnvVar = { key: string; label: string; placeholder?: string };

const CRITICAL: EnvVar[] = [
  { key: 'MONGODB_URI',              label: 'MongoDB URI' },
  { key: 'JWT_SECRET',               label: 'JWT Secret' },
  { key: 'CRON_SECRET',              label: 'Cron Secret (protects cron endpoints)' },
  { key: 'SMTP_HOST',                label: 'SMTP Host (email delivery)' },
  { key: 'SMTP_USER',                label: 'SMTP Username' },
  { key: 'SMTP_PASS',                label: 'SMTP Password' },
  { key: 'ADMIN_EMAIL',              label: 'Admin notification email' },
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

  return {
    valid:          criticalErrors.length === 0,
    errors:         criticalErrors,
    warnings:       optionalWarns,
    redisEnabled:   !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    whatsappEnabled:!!(process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN),
    paymentEnabled: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    cloudinaryEnabled: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
  };
}

// ── Boot-time validation ──────────────────────────────────────────────────────
const check = validateEnv();

if (!check.valid) {
  const errMsg =
    `[OPS Platform] ❌ FATAL — Missing critical environment variables:\n` +
    check.errors.map(e => `  • ${e}`).join('\n') +
    `\n\nFix these in Vercel Project Settings → Environment Variables.`;

  if (isProd) {
    // Hard fail in production to prevent silent failures
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
