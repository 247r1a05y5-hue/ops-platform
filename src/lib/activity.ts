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

  // 3. Trigger Dual Notifications if it's a significant action
  const significantActions = [
    'login', 'logout', 'registration', 'first_login', 'file_download', 'upload',
    'report_generation', 'task_update', 'task_creation', 'workflow_action',
    'ticket_update', 'export_csv', 'new_project', 'email_sent',
    'password_reset', 'profile_update',
    // Time tracking & shift events
    'shift_start', 'shift_stop', 'time_log',
    // Approval events
    'approval_requested', 'approval_approved', 'approval_rejected',
    // Reminder events
    'reminder_cron',
  ];

  if (significantActions.includes(actionType)) {
    // sendDualNotification internally calls sendEmail which logs to EmailLog
    await sendDualNotification({
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      action: actionType.replace(/_/g, ' ').toUpperCase(),
      description
    }).catch(console.error);
  }

  return log;
}
