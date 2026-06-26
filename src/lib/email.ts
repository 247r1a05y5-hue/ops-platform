import { connectDB, EmailLog } from './db';

type TemplateVars = Record<string, string>;

type EmailTemplate = {
  subject: string;
  html: (vars: TemplateVars) => string;
};

// Global transporter cache removed for REST API usage

// Temporary startup diagnostics to verify environment injection on Railway
(function logStartupDiagnostics() {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.SENDER_EMAIL || 'missing';
  const admin = process.env.ADMIN_EMAIL || 'missing';

  console.log(`[email] ENV
BREVO_API_KEY: ${apiKey ? 'present' : 'missing'}
SENDER_EMAIL: ${sender}
ADMIN_EMAIL: ${admin}`);
})();

/** Regex for a broadly valid email address */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Placeholder/test addresses that should never be sent to in production */
const BLOCKED_DOMAINS = ['example.com', 'test.com', 'placeholder.com', 'mailinator.com'];
const BLOCKED_PREFIXES = ['test@', 'placeholder@', 'noreply@', 'no-reply@'];

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  return EMAIL_RE.test(lower);
}

/** Sanitize Brevo API errors — strip credentials */
function sanitizeBrevoError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/key[=:\s]+\S+/gi, 'key=***').substring(0, 300);
}

export async function checkBrevoHealth() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { status: 'disabled', details: 'BREVO_API_KEY is not set' };
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
      },
    });
    if (res.ok) {
      const data = await res.json();
      return { status: 'configured', details: `Brevo Connected (${data.email})` };
    } else {
      const text = await res.text();
      return { status: 'unhealthy', details: `HTTP ${res.status}: ${text}` };
    }
  } catch (err: any) {
    return { status: 'unhealthy', details: err.message };
  }
}

// Polished HTML Boilerplate
const EmailBoilerplate = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>${title}</title>
<style>
  body { background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .card { background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
  .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 30px 20px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
  .header p { color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  .body { padding: 30px; color: #3f3f46; line-height: 1.6; font-size: 16px; }
  .footer { padding: 20px; text-align: center; color: #a1a1aa; font-size: 13px; border-top: 1px solid #f4f4f5; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: #e0e7ff; color: #4338ca; text-transform: uppercase; margin-bottom: 15px; }
  .btn { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; text-align: center; }
  .summary-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0; }
  .summary-item { margin: 8px 0; font-size: 14px; }
  .summary-label { font-weight: 600; color: #64748b; width: 100px; display: inline-block; }
</style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>OPS Platform</h1>
        <p>Enterprise Operations</p>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} Antigravity OPS Platform. All rights reserved.<br>
        This is an automated message, please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`;

export const TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    subject: 'Welcome to Antigravity OPS Platform',
    html: (vars: TemplateVars) => EmailBoilerplate('Welcome', `
      <span class="badge">${vars.role}</span>
      <h2 style="color: #111827; margin-top: 0;">Welcome, ${vars.name}!</h2>
      <p>Your account has been successfully provisioned. We are excited to have you onboard.</p>
      <div class="summary-card">
        <div class="summary-item"><span class="summary-label">Role:</span> ${vars.role}</div>
        <div class="summary-item"><span class="summary-label">Status:</span> Active</div>
        <div class="summary-item"><span class="summary-label">Joined:</span> ${new Date().toLocaleDateString()}</div>
      </div>
      <p>You can now access your dashboard and start collaborating with the team.</p>
      <center>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login" class="btn">Access Dashboard</a>
      </center>
    `)
  },
  admin_user_signup: {
    subject: 'New User Registration Alert',
    html: (vars: TemplateVars) => EmailBoilerplate('New User Alert', `
      <span class="badge" style="background-color: #fee2e2; color: #b91c1c;">Admin Alert</span>
      <h2 style="color: #111827; margin-top: 0;">New Workspace Member</h2>
      <p>A new user has successfully joined the OPS platform.</p>
      <div class="summary-card">
        <div class="summary-item"><span class="summary-label">Name:</span> ${vars.name}</div>
        <div class="summary-item"><span class="summary-label">Email:</span> ${vars.email}</div>
        <div class="summary-item"><span class="summary-label">Role:</span> ${vars.role}</div>
        <div class="summary-item"><span class="summary-label">Time:</span> ${new Date().toLocaleString()}</div>
      </div>
    `)
  },
  activity_alert: {
    subject: 'Activity Notification - OPS Platform',
    html: (vars: TemplateVars) => EmailBoilerplate('Activity Alert', `
      <h2 style="color: #111827; margin-top: 0;">Activity Detected: ${vars.action}</h2>
      <p>A significant event has occurred in your workspace.</p>
      <div class="summary-card">
        <div class="summary-item"><span class="summary-label">Action:</span> ${vars.action}</div>
        <div class="summary-item"><span class="summary-label">User:</span> ${vars.name}</div>
        <div class="summary-item"><span class="summary-label">Role:</span> ${vars.role}</div>
        <div class="summary-item"><span class="summary-label">Time:</span> ${new Date().toLocaleString()}</div>
      </div>
      <p><strong>Details:</strong><br/>${vars.description}</p>
    `)
  },
  password_reset: {
    subject: 'Password Reset Request',
    html: (vars: TemplateVars) => EmailBoilerplate('Password Reset', `
      <h2 style="color: #111827; margin-top: 0;">Reset Your Password</h2>
      <p>Hi ${vars.name},</p>
      <p>We received a request to reset the password for your OPS Platform account.</p>
      <center>
        <a href="${vars.resetLink || '#'}" class="btn">Reset Password</a>
      </center>
      <p style="margin-top: 20px; font-size: 14px; color: #64748b;">If you did not request this, please ignore this email or contact the administrator.</p>
    `)
  },
  task_update: {
    subject: 'Task/Workflow Update',
    html: (vars: TemplateVars) => EmailBoilerplate('Task Update', `
      <h2 style="color: #111827; margin-top: 0;">Task Status Changed</h2>
      <p>There has been an update to a task or workflow assigned to you.</p>
      <div class="summary-card">
        <div class="summary-item"><span class="summary-label">Action:</span> ${vars.action}</div>
        <div class="summary-item"><span class="summary-label">Updated By:</span> ${vars.name} (${vars.role})</div>
      </div>
      <p><strong>Details:</strong><br/>${vars.description}</p>
      <center>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" class="btn">View Task</a>
      </center>
    `)
  },
  team_invite: {
    subject: 'You have been invited to join Antigravity OPS Platform',
    html: (vars: TemplateVars) => EmailBoilerplate('Invitation', `
      <span class="badge">${vars.role}</span>
      <h2 style="color: #111827; margin-top: 0;">You have been invited!</h2>
      <p>Hi there,</p>
      <p>${vars.invitedBy} has invited you to join the Antigravity OPS Platform team as a <strong>${vars.role}</strong>.</p>
      <p>Click the button below to accept the invitation and set up your account:</p>
      <center>
        <a href="${vars.inviteLink || '#'}" class="btn">Join the Team</a>
      </center>
      <p style="margin-top: 20px; font-size: 14px; color: #64748b;">This invitation link will expire in 24 hours.</p>
    `)
  }
};

export async function sendEmail({ event, to, vars }: { event: keyof typeof TEMPLATES; to: string; vars: TemplateVars }) {
  const template = TEMPLATES[event];
  if (!template) throw new Error(`Template not found for event: ${event}`);

  // Resolve admin@ops.com recipient to dynamic ADMIN_EMAIL / SENDER_EMAIL fallback
  let targetTo = (to || '').trim();
  if (targetTo.toLowerCase() === 'admin@ops.com') {
    const resolvedAdmin = (process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'admin@ops.com').trim();
    if (resolvedAdmin && resolvedAdmin.toLowerCase() !== 'admin@ops.com') {
      targetTo = resolvedAdmin;
    }
  }

  // Validate recipient address
  if (!isValidEmail(targetTo)) {
    throw new Error(`Invalid or blocked recipient address: ${targetTo}`);
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured in the environment.');
  }

  const startTime = Date.now();

  try {
    console.log(`[email] [timing] connectDB() start`);
    const t0 = Date.now();
    await connectDB();
    console.log(`[email] [timing] connectDB() completed in ${Date.now() - t0}ms`);

    // Brevo requires the actual sender email to be verified
    const fromAddress = process.env.SENDER_EMAIL || 'admin@ops.com';

    console.log(`[email] [timing] HTML template generation start`);
    const t1 = Date.now();
    const htmlContent = template.html(vars);
    console.log(`[email] [timing] HTML template generation completed in ${Date.now() - t1}ms`);

    console.log('[email] Calling Brevo REST API endpoint...');
    console.log(`[email] [timing] Brevo API POST start`);
    const t2 = Date.now();

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: 'Antigravity OPS Admin',
          email: fromAddress
        },
        to: [
          {
            email: targetTo
          }
        ],
        subject: template.subject,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Brevo API Error (${response.status}): ${errText}`);
    }

    const resData = await response.json();
    const messageId = resData.messageId || `brevo-${Date.now()}`;
    const info = { messageId };

    console.log(`[email] [timing] Brevo API POST completed (success) in ${Date.now() - t2}ms. messageId=${messageId}`);

    console.log(`[email] [timing] EmailLog.create() start`);
    const t3 = Date.now();
    try {
      await EmailLog.create({
        event,
        template: event,
        subject: template.subject,
        role: vars.role || 'Unknown',
        to: targetTo,
        status: 'success',
        messageId: messageId,
        vars,
      });
      console.log(`[email] [timing] EmailLog.create() completed in ${Date.now() - t3}ms`);
    } catch (logErr) {
      console.error(`[email] [timing] EmailLog.create() failed in ${Date.now() - t3}ms:`, logErr);
    }

    console.log(`[email] [timing] sendEmail() completed successfully in ${Date.now() - startTime}ms`);
    return info;
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    const message = sanitizeBrevoError(error);

    console.error(`❌ Email failed to ${targetTo} [${event}] after ${totalTime}ms: ${message}`);

    console.log(`[email] [timing] EmailLog.create() failure log start`);
    const tFail = Date.now();
    try {
      await EmailLog.create({
        event,
        template: event,
        subject: template.subject,
        role: vars.role || 'Unknown',
        to: targetTo,
        status: 'failed',
        error: message,
        vars,
      });
      console.log(`[email] [timing] EmailLog.create() failure log completed in ${Date.now() - tFail}ms`);
    } catch (logErr) {
      console.error(`[email] [timing] EmailLog.create() failure log failed in ${Date.now() - tFail}ms:`, logErr);
    }

    throw error;
  }
}

/**
 * Sends notification to BOTH the acting user AND the admin.
 * - userEmail: always comes from the JWT session / DB — never hardcoded
 * - adminEmail: driven by ADMIN_EMAIL env var, falls back to admin@ops.com
 */
export async function sendDualNotification({
  userEmail,
  userName,
  userRole,
  action,
  description,
}: {
  userEmail: string;
  userName: string;
  userRole: string;
  action: string;
  description: string;
}) {
  // Admin email driven by env — never hardcoded in code. Fallback to SENDER_EMAIL if default placeholder is used.
  let adminEmail = (process.env.ADMIN_EMAIL || 'admin@ops.com').toLowerCase().trim();
  if (adminEmail === 'admin@ops.com' && process.env.SENDER_EMAIL) {
    adminEmail = process.env.SENDER_EMAIL.toLowerCase().trim();
  }

  const recipients: Array<{ to: string; label: string }> = [];

  // 1. Always send to the logged-in user (their real email from JWT/DB)
  if (isValidEmail(userEmail)) {
    recipients.push({ to: userEmail, label: 'employee' });
  } else {
    console.warn(`[sendDualNotification] Skipping employee notify — invalid email: "${userEmail}"`);
  }

  // 2. Always send to admin (only add once, skip if same as user)
  if (isValidEmail(adminEmail) && adminEmail !== userEmail.toLowerCase().trim()) {
    recipients.push({ to: adminEmail, label: 'admin' });
  }

  for (const { to, label } of recipients) {
    try {
      await sendEmail({
        event: 'activity_alert',
        to,
        vars: { name: userName, role: userRole, action, description },
      });
      console.log(`[sendDualNotification] ✅ Sent to ${label} <${to}> — ${action}`);
    } catch (err) {
      console.error(`[sendDualNotification] ❌ Failed to notify ${label} <${to}>:`, err instanceof Error ? err.message : err);
    }
  }
}
