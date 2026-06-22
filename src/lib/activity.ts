import { connectDB, ActivityLog, User } from './db';
import { sendDualNotification } from './email';

type LogActivityParams = {
  userId: string;
  actionType: string;
  description: string;
  module?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
};

export async function logActivity({ userId, actionType, description, module = 'System', metadata = {}, req }: LogActivityParams) {
  await connectDB();

  // 1. Get User info
  const user = await User.findById(userId);
  if (!user) return;

  // 2. Create Activity Log
  const log = await ActivityLog.create({
    userId: user._id,
    name: user.name,
    userEmail: user.email,
    userRole: user.role,
    actionType,
    module,
    description,
    metadata,
    ip: req?.headers.get('x-forwarded-for') || '127.0.0.1',
    userAgent: req?.headers.get('user-agent') || 'Unknown'
  });

  // 3. Trigger Dual Notifications
  // Notifications are now handled centrally by the ActivityLogSchema.post('save') model hook in db.ts.
  // This ensures dual notification emails are triggered consistently whether logActivity()
  // or direct ActivityLog.create() is used across different parts of the application.

  return log;
}
