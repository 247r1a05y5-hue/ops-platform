# SECURITY_CHECKLIST.md — Enterprise Security Hardening Checklist

## Session & Authentication
- [ ] Session cookie is configured with `HttpOnly`, `SameSite=Lax`, and `Secure` flags.
- [ ] JWT tokens are signed using a minimum HS256 algorithm with a secret length of at least 32 bytes.
- [ ] Token expiration time is constrained (default 8 hours).
- [ ] Suspended accounts check is cached for a maximum of 15 seconds to enforce real-time blockades.

## API & Communication Security
- [ ] CSRF Double-Submit token check present on state-changing API endpoints.
- [ ] Rate limits configured on critical endpoints (e.g. login, verify, reset-password).
- [ ] Test endpoints secured with server-side role check authorizations.
- [ ] HTTP Headers inject proper frame controls (`X-Frame-Options: SAMEORIGIN`) and content type protection.
- [ ] Input data is parsed and sanitized before DB serialization.
- [ ] Sensitive passwords stored using high-entropy bcrypt hashing.
