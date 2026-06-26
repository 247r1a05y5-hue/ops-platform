# PRODUCTION_CHECKLIST.md — Go-Live Readiness checklist

## Environment Variables Configuration
- [ ] `MONGODB_URI` set to production cluster connection string.
- [ ] `JWT_SECRET` set to a secure, random string (min 32 characters).
- [ ] `BREVO_API_KEY` set to valid transactional email REST API key.
- [ ] `SENDER_EMAIL` set to verified sender email address.
- [ ] `ADMIN_EMAIL` set to fallback administrator email address.
- [ ] `NEXT_PUBLIC_APP_URL` set to the primary application domain.
- [ ] `WHATSAPP_TOKEN` & `WHATSAPP_PHONE_ID` configured for messaging.
- [ ] `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET` configured for payments.
- [ ] `CRON_SECRET` configured with secure token.

## Infrastructure & Performance
- [ ] Run typescript type verification: `npx tsc --noEmit`.
- [ ] Verify zero schema errors or duplicate index warnings on MongoDB boot.
- [ ] Verify database connection pool limits are scaled for expected load.
- [ ] Verify build output contains optimized static assets.
- [ ] Test the health check endpoint `/health` returns status `200`.

## Access & Security
- [ ] Verify all cookies are flagged `HttpOnly` and `Secure`.
- [ ] Verify double-submit cookie pattern CSRF protections are active on PUT/POST/DELETE.
- [ ] Confirm no testing/development routes are publicly accessible without auth.
