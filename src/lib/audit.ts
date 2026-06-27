import { connectDB, AuditLog } from './db';

type AuditParams = {
  action: string;
  module: 'Authentication' | 'CRM' | 'Tasks' | 'Invoices' | 'Workflows' | 'Users' | 'Roles' | 'Payments' | 'Documents' | 'Integrations';
  entityId: string;
  entityType: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  session: {
    sub: string; // userId
    name: string;
    role: string;
    workspaceId?: string;
  };
  req?: Request;
};

// Simple User Agent parser helper
function parseUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();
  let browser = 'Unknown';
  let device = 'Desktop';

  // Extract browser
  if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('chrome')) {
    browser = 'Chrome';
  } else if (ua.includes('safari')) {
    browser = 'Safari';
  } else if (ua.includes('edge') || ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('msie') || ua.includes('trident')) {
    browser = 'Internet Explorer';
  }

  // Extract device
  if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone')) {
    device = 'Mobile';
  } else if (ua.includes('ipad') || ua.includes('tablet')) {
    device = 'Tablet';
  }

  return { browser, device };
}

export async function logAudit({
  action,
  module,
  entityId,
  entityType,
  oldValue = null,
  newValue = null,
  session,
  req,
}: AuditParams) {
  try {
    await connectDB();

    const ipAddress = req?.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = req?.headers.get('user-agent') || 'Unknown';
    const { browser, device } = parseUserAgent(userAgent);

    const log = await AuditLog.create({
      action,
      module,
      entityId,
      entityType,
      oldValue,
      newValue,
      performedBy: session.name || session.sub,
      performedByRole: session.role,
      workspace: session.workspaceId || 'ops-main',
      ipAddress,
      userAgent,
      browser,
      device,
      timestamp: new Date(),
    });

    console.log(`[AuditLog] Recorded "${action}" on ${entityType} (${entityId}) in module "${module}" by ${session.name}`);
    return log;
  } catch (err: any) {
    console.error('[AuditLog] Failed to log audit event:', err.message || err);
  }
}
