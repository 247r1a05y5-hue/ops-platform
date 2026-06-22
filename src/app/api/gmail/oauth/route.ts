import { NextRequest, NextResponse } from 'next/server';
import { connectDB, GmailToken } from '@/lib/db';
import { requireAuth } from '@/lib/require-auth';

// ─── Google OAuth helpers ─────────────────────────────────────────────────────
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local
// Redirect URI must be registered in Google Cloud Console:
//   {NEXT_PUBLIC_APP_URL}/api/gmail/oauth?action=callback

function getOAuthClient() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'YOUR_GOOGLE_CLIENT_ID_PLACEHOLDER' || clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET_PLACEHOLDER') {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables.');
  }
  return { clientId, clientSecret };
}

function getRedirectUri(req: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
  return `${appUrl}/api/gmail/oauth?action=callback`;
}

function buildAuthUrl(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    // calendar.events scope is sufficient for creating Google Meet events and is
    // classified as "sensitive" (not "restricted") — enabling OAuth app publication
    // without a full Google security review. The full `calendar` scope is restricted
    // and would block publishing for non-verified apps.
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
    access_type:   'offline',
    prompt:        'consent', // always re-prompt so we always get refresh_token + latest scopes
  });
  if (state) {
    params.set('state', state);
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(
  code: string, clientId: string, clientSecret: string, redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expiry_date: number; email: string }> {
  // Exchange auth code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  const tokens = await tokenRes.json();

  // Fetch Gmail address of the authed user
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = userRes.ok ? await userRes.json() : {};

  return {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   Date.now() + (tokens.expires_in ?? 3600) * 1000,
    email:         userInfo.email ?? '',
  };
}

async function refreshAccessToken(
  refreshToken: string, clientId: string, clientSecret: string
): Promise<{ access_token: string; expiry_date: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId,
      client_secret: clientSecret, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed: ' + await res.text());
  const t = await res.json();
  return { access_token: t.access_token, expiry_date: Date.now() + (t.expires_in ?? 3600) * 1000 };
}

// ─── GET /api/gmail/oauth?action=connect|callback|status|disconnect ──────────

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(req, ['Admin', 'Manager', 'User', 'Employee', 'Staff', 'MR']);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    // ── connect: redirect user to Google consent screen ───────────────────
    if (action === 'connect') {
      const returnToParam = searchParams.get('returnTo') || '/mr?tab=email';
      const { clientId } = getOAuthClient();
      const redirectUri  = getRedirectUri(req);
      const authUrl      = buildAuthUrl(clientId, redirectUri, returnToParam);
      return NextResponse.redirect(authUrl);
    }

    // ── callback: exchange code, store tokens ─────────────────────────────
    if (action === 'callback') {
      const code        = searchParams.get('code');
      const oauthError  = searchParams.get('error');
      const state       = searchParams.get('state');
      const appUrl      = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
      const returnTo    = state || '/mr?tab=email';

      if (oauthError || !code) {
        const errorMsg = oauthError === 'access_denied'
          ? 'Access was denied. Please grant the required Gmail permissions and try again.'
          : 'Google OAuth was denied or cancelled. Please try again.';
        const errorUrl = new URL('/gmail/error', appUrl);
        errorUrl.searchParams.set('message', errorMsg);
        errorUrl.searchParams.set('returnTo', returnTo);
        return NextResponse.redirect(errorUrl.toString());
      }

      const { clientId, clientSecret } = getOAuthClient();
      const redirectUri  = getRedirectUri(req);

      let tokens;
      try {
        tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);
      } catch (exchangeErr) {
        const msg = exchangeErr instanceof Error ? exchangeErr.message : 'Token exchange failed';
        console.error('[Gmail OAuth] Token exchange error:', msg);
        const errorUrl = new URL('/gmail/error', appUrl);
        errorUrl.searchParams.set('message', 'Failed to connect Gmail. Please try again.');
        errorUrl.searchParams.set('returnTo', returnTo);
        return NextResponse.redirect(errorUrl.toString());
      }

      if (tokens.email && session.email && tokens.email.toLowerCase() !== session.email.toLowerCase()) {
        console.warn(`[Gmail OAuth] WARNING: Connected Google email ('${tokens.email}') does not match app account email ('${session.email}'). Connection allowed.`);
      }

      await connectDB();
      await GmailToken.findOneAndUpdate(
        { userId: session.sub },
        {
          userId:       session.sub,
          accessToken:  tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate:   tokens.expiry_date,
          email:        tokens.email,
          updatedAt:    new Date(),
        },
        { upsert: true, new: true }
      );

      const successUrl = new URL('/gmail/success', appUrl);
      if (tokens.email) successUrl.searchParams.set('email', tokens.email);
      successUrl.searchParams.set('returnTo', returnTo);
      return NextResponse.redirect(successUrl.toString());
    }

    // ── status: returns whether this user has a connected Gmail account ───
    if (action === 'status') {
      await connectDB();
      const record = await GmailToken.findOne({ userId: session.sub });
      return NextResponse.json({
        success:          true,
        connected:        !!record,
        email:            record?.email ?? null,
        hasRefreshToken:  !!(record?.refreshToken),
        tokenExpiresAt:   record?.expiryDate ?? null,
        isExpired:        record?.expiryDate ? Date.now() > record.expiryDate : null,
      });
    }

    // ── disconnect: remove stored tokens ─────────────────────────────────
    if (action === 'disconnect') {
      await connectDB();
      await GmailToken.deleteOne({ userId: session.sub });
      return NextResponse.json({ success: true, message: 'Gmail disconnected.' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Gmail OAuth]', message);

    if (action === 'connect' || action === 'callback') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
      const returnTo = '/mr?tab=email';
      const errorUrl = new URL('/gmail/error', appUrl);
      errorUrl.searchParams.set('message', message.includes('must be set')
        ? 'Gmail integration is not configured on the server. Please check environment variables.'
        : message
      );
      errorUrl.searchParams.set('returnTo', returnTo);
      return NextResponse.redirect(errorUrl.toString());
    }

    const status = message.includes('must be set') ? 501 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// ─── Exported helper: get a valid access token for a user (used by email/send) ─

export async function getGmailAccessToken(userId: string): Promise<string | null> {
  try {
    await connectDB();
    const record = await GmailToken.findOne({ userId });
    if (!record) return null;

    // Refresh if within 5 min of expiry
    if (record.expiryDate && Date.now() > record.expiryDate - 5 * 60 * 1000) {
      if (!record.refreshToken) return null;
      const { clientId, clientSecret } = getOAuthClient();
      const refreshed = await refreshAccessToken(record.refreshToken, clientId, clientSecret);
      record.accessToken = refreshed.access_token;
      record.expiryDate  = refreshed.expiry_date;
      record.updatedAt   = new Date();
      await record.save();
    }
    return record.accessToken;
  } catch {
    return null;
  }
}
