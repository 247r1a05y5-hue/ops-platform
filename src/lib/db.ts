// NOTE: env validation is deferred to request time only (not import/build time).
// Do NOT add 'import @/lib/env' here — it throws when env vars are absent during build.
import dns from 'dns';
import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;

// Fix Atlas SRV DNS resolution properly for Node.js process on local machines
if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_STATIC_URL) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (err) {
    console.warn('[MongoDB] dns.setServers failed:', err);
  }
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var _mongoose: MongooseCache | undefined;
}

if (!global._mongoose) {
  global._mongoose = { conn: null, promise: null };
}
const cached: MongooseCache = global._mongoose;

// Serverless environments (Vercel, AWS Lambda) create a new process per invocation.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const MONGOOSE_OPTS: mongoose.ConnectOptions = {
  bufferCommands: false,
  maxPoolSize: IS_SERVERLESS ? 2 : 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority',
};

async function connectWithRetry(uri: string, maxAttempts = 3): Promise<typeof mongoose> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await mongoose.connect(uri, MONGOOSE_OPTS);
    } catch (err: any) {
      lastErr = err;
      const msg: string = err?.message ?? '';
      const isTransient =
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('querySrv') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('serverSelection');

      if (isTransient && attempt < maxAttempts) {
        console.warn(
          `[MongoDB] Connection attempt ${attempt}/${maxAttempts} failed (${msg.split('\n')[0]}). Retrying in 1 s...`
        );
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        break;
      }
    }
  }
  console.error('[MongoDB] All connection attempts failed:', lastErr);
  throw lastErr;
}

export async function connectDB() {
  if (cached.conn) {
    ensureWorkspaceAssignment().catch(err => console.error('[Background Workspace Assignment] Error:', err));
    return cached.conn;
  }

  if (cached.promise) {
    const conn = await cached.promise;
    ensureWorkspaceAssignment().catch(err => console.error('[Background Workspace Assignment] Error:', err));
    return conn;
  }

  // Read URI at request time, not module scope
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set. Add it to Railway Variables.');
  }

  cached.promise = connectWithRetry(MONGODB_URI);

  try {
    cached.conn = await cached.promise;
    ensureWorkspaceAssignment().catch(err => console.error('[Background Workspace Assignment] Error:', err));
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// --- MODELS ---

// 1. Users
const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'], default: 'User' },
  firstLogin: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  passwordResetToken:  String,
  passwordResetExpiry: Date,
  suspended: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  status: { type: String, enum: ['Online', 'Away', 'Offline'], default: 'Offline' },
});

// 2. Activity Logs
const ActivityLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  name: String,
  userEmail: String,
  userRole: String,
  actionType: { type: String, required: true },
  module: String,
  description: String,
  metadata: Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});
ActivityLogSchema.index({ userId: 1 });
ActivityLogSchema.index({ timestamp: -1 });

// Post-save hook to trigger dual email notifications centrally for all significant actions.
ActivityLogSchema.post('save', async function (doc: any) {
  try {
    const significantActions = [
      'login', 'logout', 'registration', 'first_login', 'file_download', 'upload',
      'report_generation', 'task_update', 'task_creation', 'workflow_action',
      'ticket_update', 'export_csv', 'new_project', 'email_sent',
      'password_reset', 'profile_update',
      // CRM actions logged directly or via workflow engine
      'crm_stage_enter', 'crm_outreach', 'crm_qualified', 'crm_proposal',
      'crm_negotiation', 'crm_conversion', 'crm_call_logged', 'crm_negotiation_note',
      'crm_proposal_sent', 'crm_payment_received',
      // Invoice and Payment
      'invoice_payment',
      'proposal_approved', 'proposal_rejected',
      // Time tracking & shift events
      'shift_start', 'shift_stop', 'time_log',
      // Approval events
      'approval_requested', 'approval_approved', 'approval_rejected',
      // Reminder events
      'reminder_cron',
    ];

    if (significantActions.includes(doc.actionType)) {
      // Dynamic import to avoid circular dependency at startup
      const { sendDualNotification, isValidEmail } = await import('./email');
      
      let email = doc.userEmail || '';
      let name = doc.name || '';
      let role = doc.userRole || '';

      if (!email && doc.userId) {
        try {
          const userDoc = await mongoose.model('User').findById(doc.userId).select('email name role').lean() as any;
          if (userDoc) {
            email = userDoc.email || '';
            if (!name) name = userDoc.name || '';
            if (!role) role = userDoc.role || '';
          }
        } catch (dbErr) {
          console.error('[ActivityLog post-save user lookup failed]:', dbErr);
        }
      }

      if (email && isValidEmail(email)) {
        await sendDualNotification({
          userEmail: email,
          userName: name || 'User',
          userRole: role || 'User',
          action: doc.actionType.replace(/_/g, ' ').toUpperCase(),
          description: doc.description || '',
        });
      }
    }
  } catch (err) {
    console.error('[ActivityLog post-save notify failed]:', err);
  }
});

// 3. Email Logs
const EmailLogSchema = new Schema({
  event: { type: String, required: true },
  template: String,
  subject: String,
  role: String,
  to: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], required: true },
  messageId: String,
  error: String,
  vars: Schema.Types.Mixed,
  sentAt: { type: Date, default: Date.now }
});

// 4. Notifications
const NotificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  title: String,
  message: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// 5. Leads
const LeadSchema = new Schema({
  name: { type: String, required: true },
  company: { type: String, default: 'Acme Corp' },
  value: { type: String, default: '$0' },
  stage: { type: String, enum: ['Discovery', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closing'], default: 'Discovery' },
  status: { type: String, enum: ['Hot', 'Warm', 'Cold'], default: 'Warm' },
  lastContact: { type: String, default: 'Just now' },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedToName: { type: String, default: 'Unassigned' },
  notes: [{ content: String, author: String, createdAt: { type: Date, default: Date.now } }],
  emails: [{ subject: String, body: String, sender: String, sentAt: { type: Date, default: Date.now }, scheduledAt: Date, status: { type: String, enum: ['sent', 'scheduled', 'opened', 'clicked', 'replied'], default: 'sent' }, opens: { type: Number, default: 0 }, clicks: { type: Number, default: 0 } }],
  documents: [{ name: { type: String, required: true }, size: String, url: { type: String, required: true }, publicId: String, resourceType: { type: String, default: 'image' }, uploadedAt: { type: Date, default: Date.now } }],
  history: [{ event: String, user: String, time: { type: Date, default: Date.now } }],
  activeSequence: { type: String, default: '' },
  sequenceStep: { type: Number, default: 0 },
  sequenceEnrolledAt: Date,
  createdAt: { type: Date, default: Date.now },
  leadSource: { type: String, default: '' },
  welcomeEmailSent: { type: Boolean, default: false },
  lastContactedAt: Date,
  followUpReminders: [{ dueAt: Date, note: String, completed: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } }],
  leadScore: { type: Number, default: 0 },
  qualificationNotes: { type: String, default: '' },
  proposalStatus: { type: String, enum: ['not_sent', 'sent', 'viewed', 'accepted', 'rejected'], default: 'not_sent' },
  proposalSentAt: Date,
  paymentLink: { type: String, default: '' },
  razorpayOrderId: { type: String, default: '' },
  negotiationNotes: [{ content: String, author: String, revision: { type: Number, default: 1 }, createdAt: { type: Date, default: Date.now } }],
  negotiationRevision: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['not_initiated', 'pending', 'paid', 'failed'], default: 'not_initiated' },
  onboardingReady: { type: Boolean, default: false },
  closedAt: Date,
  stageEnteredAt: { type: Schema.Types.Mixed, default: {} },
  conversionSource: { type: String, default: '' },
});

// 5b. Stage Workflow Log — immutable audit trail for every stage transition
const StageWorkflowLogSchema = new Schema({
  leadId:          { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  leadName:        { type: String, default: '' },
  leadEmail:       { type: String, default: '' },
  fromStage:       { type: String, default: 'none' },
  toStage:         { type: String, required: true },
  triggeredBy:     { type: String, default: 'System' },
  userId:          { type: Schema.Types.ObjectId, ref: 'User' },
  workflowActions: [String],
  metadata:        { type: Schema.Types.Mixed, default: {} },
  timestamp:       { type: Date, default: Date.now },
});
StageWorkflowLogSchema.index({ leadId: 1 });
StageWorkflowLogSchema.index({ toStage: 1 });
StageWorkflowLogSchema.index({ timestamp: -1 });

LeadSchema.index({ email: 1 });
LeadSchema.index({ activeSequence: 1 });
LeadSchema.index({ assignedTo: 1 });
LeadSchema.index({ stage: 1 });
LeadSchema.index({ createdAt: -1 });

// 6. Invoices
const InvoiceSchema = new Schema({
  invoiceId: { type: String, required: true, unique: true },
  client: { type: String, required: true },
  clientEmail: { type: String, default: '' },
  clientPhone: { type: String, default: '' },
  amount: { type: String, required: true },
  date: { type: String, required: true },
  due: { type: String, required: true },
  status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  category: { type: String, default: 'Consulting' },
  paymentLink: { type: String, default: '' },
  remindersCount: { type: Number, default: 0 },
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  razorpaySignature: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ razorpayOrderId: 1 });
InvoiceSchema.index({ clientEmail: 1 });
InvoiceSchema.index({ createdAt: -1 });

// 7. Email Templates
const EmailTemplateSchema = new Schema({
  name: { type: String, required: true, unique: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// 8. Sequences
const SequenceSchema = new Schema({
  name: { type: String, required: true, unique: true },
  steps: [{ stepNumber: Number, delayDays: Number, templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate' }, subject: String, body: String }],
  createdAt: { type: Date, default: Date.now }
});

// 9. Gmail OAuth Tokens (per user)
const GmailTokenSchema = new Schema({
  userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  accessToken:  { type: String, required: true },
  refreshToken: String,
  expiryDate:   Number,
  email:        String,
  updatedAt:    { type: Date, default: Date.now },
});

// 10. Tasks
const TaskSchema = new Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  stage:       { type: String, enum: ['Backlog', 'To Do', 'In Progress', 'Review', 'Under Review', 'Done', 'Blocked'], default: 'Backlog' },
  priority:    { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  assignee:    { type: String, default: '' },
  dueDate:     Date,
  projectId:   { type: Schema.Types.ObjectId, ref: 'Project' },
  tags:        [String],
  code:        { type: String, default: '' },
  createdBy:   { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now },
  progress:    { type: Number, default: 0 },
  subtasks:    { type: [{ title: String, done: Boolean }], default: [] },
  logs:        { type: [{ time: String, note: String, author: String }], default: [] },
  attachments: { type: [String], default: [] },
});
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ assignee: 1 });
TaskSchema.index({ stage: 1 });
TaskSchema.index({ createdAt: -1 });

// 11. Projects
const ProjectSchema = new Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  deadline:    { type: String, default: '' },
  owner:       { type: String, default: '' },
  createdBy:   { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now },
});
ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ createdAt: -1 });

// 12. Catalog Items
const CatalogItemSchema = new Schema({
  name:        { type: String, required: true },
  category:    { type: String, default: 'General' },
  type:        { type: String, enum: ['Product', 'Service', 'Document', 'Template'], default: 'Product' },
  price:       { type: String, default: '' },
  status:      { type: String, enum: ['Active', 'Draft', 'Archived'], default: 'Active' },
  description: { type: String, default: '' },
  tags:        [String],
  rating:      Number,
  createdAt:   { type: Date, default: Date.now },
});
CatalogItemSchema.index({ type: 1 });
CatalogItemSchema.index({ status: 1 });
CatalogItemSchema.index({ createdAt: -1 });

// 13. User Settings
const UserSettingsSchema = new Schema({
  userId:        { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  notifSettings: { type: Schema.Types.Mixed, default: {} },
  sessionTimeout:{ type: String, default: '30' }, // in minutes
  updatedAt:     { type: Date, default: Date.now },
});

// 14. Proposals
const ProposalSchema = new Schema({
  leadId:    { type: Schema.Types.ObjectId, ref: 'Lead',    required: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  version: { type: Number, default: 1 },
  status:  { type: String, enum: ['draft', 'sent', 'viewed', 'approved', 'rejected'], default: 'draft' },
  branding: {
    primaryColor: { type: String, default: '#4f46e5' },
    companyName:  { type: String, default: 'Antigravity OPS' },
    tagline:      { type: String, default: 'Enterprise Operations Platform' },
  },
  title:        { type: String, default: 'Enterprise Proposal' },
  subtitle:     { type: String, default: '' },
  introduction: { type: String, default: '' },
  services: [{ name: { type: String, required: true }, description: { type: String, default: '' }, price: { type: Number, required: true, min: 0 }, quantity: { type: Number, default: 1, min: 1 }, unit: { type: String, default: 'unit' } }],
  milestones: [{ name: { type: String, required: true }, description: { type: String, default: '' }, dueDate: Date, deliverables: [String] }],
  subtotal:  { type: Number, default: 0 },
  discount:  { type: Number, default: 0 },
  tax:       { type: Number, default: 0 },
  total:     { type: Number, default: 0 },
  currency:  { type: String, default: 'INR' },
  notes:      { type: String, default: '' },
  terms:      { type: String, default: '' },
  validUntil: Date,
  signatureName:  { type: String, default: '' },
  signatureTitle: { type: String, default: '' },
  footerText:     { type: String, default: '' },
  pdfUrl:      { type: String, default: '' },
  pdfPublicId: { type: String, default: '' },
  generatedAt: Date,
  sentAt:          Date,
  viewedAt:        Date,
  viewCount:       { type: Number, default: 0 },
  approvedAt:      Date,
  rejectedAt:      Date,
  rejectionReason: { type: String, default: '' },
  secureToken: { type: String, unique: true, sparse: true },
  createdBy: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
ProposalSchema.index({ leadId: 1 });
ProposalSchema.index({ status: 1 });
ProposalSchema.index({ createdAt: -1 });

// 15. WhatsApp Messages
const WhatsAppMessageSchema = new Schema({
  direction:     { type: String, enum: ['outbound', 'inbound'], required: true },
  waMessageId:   { type: String, default: '' },
  phone:         { type: String, required: true },
  body:          { type: String, default: '' },
  status:        { type: String, enum: ['sent', 'delivered', 'read', 'failed', 'received'], default: 'sent' },
  errorCode:     { type: Number, default: null },
  errorMessage:  { type: String, default: '' },
  refInvoiceId:  { type: String, default: '' },
  refLeadId:     { type: String, default: '' },
  sentAt:        { type: Date, default: Date.now },
  statusAt:      { type: Date, default: null },
});
WhatsAppMessageSchema.index({ waMessageId: 1 });
WhatsAppMessageSchema.index({ phone: 1 });
WhatsAppMessageSchema.index({ sentAt: -1 });

export const GmailToken          = (models.GmailToken          || model('GmailToken',          GmailTokenSchema)) as any;
export const User                = (models.User                || model('User',                UserSchema)) as any;
export const ActivityLog         = (models.ActivityLog         || model('ActivityLog',         ActivityLogSchema)) as any;
export const EmailLog            = (models.EmailLog            || model('EmailLog',            EmailLogSchema)) as any;
export const Notification        = (models.Notification        || model('Notification',        NotificationSchema)) as any;

// Additional indexes for cron queries & analytics
if (!LeadSchema.path('updatedAt')) {
  try { LeadSchema.add({ updatedAt: { type: Date, default: Date.now } }); } catch (_) {}
}
try {
  LeadSchema.index({ stage: 1, updatedAt: 1 });
  LeadSchema.index({ onboardingReady: 1, paymentStatus: 1, onboardingDoneAt: 1 });
  TaskSchema.index({ dueDate: 1, stage: 1 });
  ActivityLog.schema.index({ userId: 1, actionType: 1, timestamp: -1 });
} catch (_) { /* indexes already declared */ }

export const Lead                = (models.Lead                || model('Lead',                LeadSchema)) as any;
export const StageWorkflowLog    = (models.StageWorkflowLog    || model('StageWorkflowLog',    StageWorkflowLogSchema)) as any;
export const Invoice             = (models.Invoice             || model('Invoice',             InvoiceSchema)) as any;
export const EmailTemplate       = (models.EmailTemplate       || model('EmailTemplate',       EmailTemplateSchema)) as any;
export const Sequence            = (models.Sequence            || model('Sequence',            SequenceSchema)) as any;
export const Task                = (models.Task                || model('Task',                TaskSchema)) as any;
export const Project             = (models.Project             || model('Project',             ProjectSchema)) as any;
export const CatalogItem         = (models.CatalogItem         || model('CatalogItem',         CatalogItemSchema)) as any;
export const UserSettings        = (models.UserSettings        || model('UserSettings',        UserSettingsSchema)) as any;
export const Proposal            = (models.Proposal            || model('Proposal',            ProposalSchema)) as any;
export const WhatsAppMessage     = (models.WhatsAppMessage     || model('WhatsAppMessage',     WhatsAppMessageSchema)) as any;

// ── Reminder ──────────────────────────────────────────────────────────────────
const ReminderSchema = new Schema({
  leadId:       { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
  assignedTo:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title:        { type: String, required: true },
  description:  { type: String, default: '' },
  dueAt:        { type: Date, required: true },
  completed:    { type: Boolean, default: false },
  completedAt:  { type: Date, default: null },
  notified:     { type: Boolean, default: false },
  history: [{ event: String, at: { type: Date, default: Date.now } }],
  createdAt:    { type: Date, default: Date.now },
});
ReminderSchema.index({ assignedTo: 1 });
ReminderSchema.index({ dueAt: 1 });
ReminderSchema.index({ completed: 1, dueAt: 1 });

// ── ApprovalRequest ───────────────────────────────────────────────────────────
const ApprovalRequestSchema = new Schema({
  leadId:          { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  requestedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByName: { type: String, default: '' },
  reason:          { type: String, default: '' },
  dealValue:       { type: String, default: '' },
  status:          { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  reviewedBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName:  { type: String, default: '' },
  reviewNote:      { type: String, default: '' },
  reviewedAt:      { type: Date, default: null },
  createdAt:       { type: Date, default: Date.now },
});
ApprovalRequestSchema.index({ status: 1 });
ApprovalRequestSchema.index({ leadId: 1 });
ApprovalRequestSchema.index({ createdAt: -1 });

try {
  LeadSchema.add({
    onboardingDoneAt: { type: Date, default: null },
    approvalStatus:   { type: String, enum: ['none','pending','approved','rejected'], default: 'none' },
  });
} catch (_) { /* already added on hot-reload */ }

export const Reminder        = (models.Reminder        || model('Reminder',        ReminderSchema)) as any;
export const ApprovalRequest = (models.ApprovalRequest || model('ApprovalRequest', ApprovalRequestSchema)) as any;

// ── CHAT MODELS ──────────────────────────────────────────────────────────────

// 16. Workspace — tenant isolation root
const WorkspaceSchema = new Schema({
  name:      { type: String, required: true },
  slug:      { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

// 17. Conversation — DM or group thread scoped to a workspace
const ConversationSchema = new Schema({
  workspaceId:  { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  type:         { type: String, enum: ['direct', 'group'], default: 'direct' },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  name:         { type: String, default: '' },
  lastMessage:  { type: String, default: '' },
  lastMessageAt:{ type: Date, default: null },
  lastMessageBy:{ type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt:    { type: Date, default: Date.now },
});
ConversationSchema.index({ workspaceId: 1 });
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ workspaceId: 1, participants: 1 });

// 18. Message — individual chat message
const MessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  workspaceId:    { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  senderId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName:     { type: String, required: true },
  body:           { type: String, default: '' },
  createdAt:      { type: Date, default: Date.now },
  editedAt:       { type: Date, default: null },
  deleted:        { type: Boolean, default: false },
});
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ workspaceId: 1 });
MessageSchema.index({ senderId: 1 });

// 19. MessageReadStatus — tracks per-user last-read cursor per conversation
const MessageReadStatusSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt:     { type: Date, default: null },
  lastReadMsgId:  { type: Schema.Types.ObjectId, ref: 'Message', default: null },
});
MessageReadStatusSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
MessageReadStatusSchema.index({ userId: 1 });

// Add workspaceId to User schema
try {
  UserSchema.add({ workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null } });
} catch (_) { /* already added on hot-reload */ }

try {
  UserSchema.add({ status: { type: String, enum: ['Online', 'Away', 'Offline'], default: 'Offline' } });
} catch (_) { /* already added on hot-reload */ }

export const Workspace          = (models.Workspace          || model('Workspace',          WorkspaceSchema)) as any;
export const Conversation       = (models.Conversation       || model('Conversation',       ConversationSchema)) as any;
export const Message            = (models.Message            || model('Message',            MessageSchema)) as any;
export const MessageReadStatus  = (models.MessageReadStatus  || model('MessageReadStatus',  MessageReadStatusSchema)) as any;

// ── Phase 3: Extend Message schema ────────────────────────────────────────────
try {
  MessageSchema.add({
    parentMessageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    attachments: [{
      url:          { type: String, default: '' },
      publicId:     { type: String, default: '' },
      name:         { type: String, default: '' },
      size:         { type: Number, default: 0 },
      mimeType:     { type: String, default: '' },
      resourceType: { type: String, default: 'image' },
    }],
    reactions: [{
      emoji: { type: String, required: true },
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    }],
    flagged:    { type: Boolean, default: false },
    flaggedBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    flagReason: { type: String, default: '' },
  });
} catch (_) { /* already added on hot-reload */ }

try { MessageSchema.index({ parentMessageId: 1 }); } catch (_) {}
try { MessageSchema.index({ body: 'text', senderName: 'text' }); } catch (_) {}

// ── Phase 3: Extend Conversation schema ───────────────────────────────────────
try {
  ConversationSchema.add({
    linkedLeadId:      { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    linkedTaskId:      { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    linkedType:        { type: String, enum: ['lead', 'task', ''], default: '' },
    videoRoomUrl:      { type: String, default: '' },
    aiSummaryCache:    { type: String, default: '' },
    aiSummaryCachedAt: { type: Date, default: null },
  });
} catch (_) { /* already added on hot-reload */ }

// ── Phase 3: ChatAuditLog ─────────────────────────────────────────────────────
const ChatAuditLogSchema = new Schema({
  workspaceId:    { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  exportedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  exportedByName: { type: String, default: '' },
  format:         { type: String, enum: ['json', 'csv'], default: 'json' },
  messageCount:   { type: Number, default: 0 },
  exportedAt:     { type: Date, default: Date.now },
});
ChatAuditLogSchema.index({ workspaceId: 1 });
ChatAuditLogSchema.index({ exportedAt: -1 });

export const ChatAuditLog = (models.ChatAuditLog || model('ChatAuditLog', ChatAuditLogSchema)) as any;

// ── Meeting Schema ───────────────────────────────────────────────────────────
const MeetingSchema = new Schema({
  meetingId: { type: String, required: true, unique: true },
  creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  creatorName: { type: String, required: true },
  roomId: { type: String, required: true },
  meetingLink: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'ended'], default: 'active' }
});

export const Meeting = (models.Meeting || model('Meeting', MeetingSchema)) as any;

// ── SystemConfig Schema ──────────────────────────────────────────────────────
const SystemConfigSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export const SystemConfig = (models.SystemConfig || model('SystemConfig', SystemConfigSchema)) as any;

// ── Invitation Schema ────────────────────────────────────────────────────────
const InvitationSchema = new Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, required: true, enum: ['Admin', 'Manager', 'Staff', 'User', 'Employee', 'MR'] },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null }, // optional — set after workspace is assigned
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['pending', 'accepted', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});
InvitationSchema.index({ status: 1, expiresAt: 1 });

export const Invitation = (models.Invitation || model('Invitation', InvitationSchema)) as any;

// ── Additional compound indexes for billing & analytics ───────────────────────
try {
  // Invoice: fast MRR queries by status + date
  const InvModel = (models.Invoice || model('Invoice', InvoiceSchema)) as any;
  InvModel.schema.index({ status: 1, createdAt: -1 });
} catch (_) { /* already defined */ }

// ── WebhookEvent — production delivery queue ───────────────────────────────
const WebhookEventSchema = new Schema({
  eventId:              { type: String, required: true, unique: true },  // UUID
  event:                { type: String, required: true },                 // e.g. 'new_lead'
  payload:              { type: Schema.Types.Mixed, required: true },     // full JSON body
  targetUrl:            { type: String, required: true },                 // outbound URL
  status:               { type: String, enum: ['pending', 'processing', 'success', 'failed', 'dead'], default: 'pending' },
  attempts:             { type: Number, default: 0 },
  maxAttempts:          { type: Number, default: 5 },
  nextRetryAt:          { type: Date, default: Date.now },                // ready immediately
  processingStartedAt:  { type: Date, default: null },                    // set when claimed; used for stuck-job recovery
  lastError:            { type: String, default: '' },
  lastResponseCode:     { type: Number, default: null },
  lastResponseBody:     { type: String, default: '' },
  duration:             { type: Number, default: null },                  // ms
  enqueuedAt:           { type: Date, default: Date.now },                // for queue wait-time calculation
  createdAt:            { type: Date, default: Date.now },
  updatedAt:            { type: Date, default: Date.now },
});
// Primary worker claim query
try { WebhookEventSchema.index({ status: 1, nextRetryAt: 1 }); } catch (_) {}
// Stuck-job recovery scan
try { WebhookEventSchema.index({ status: 1, processingStartedAt: 1 }); } catch (_) {}
// eventId lookup (unique already set above)
try { WebhookEventSchema.index({ event: 1 }); } catch (_) {}
try { WebhookEventSchema.index({ createdAt: -1 }); } catch (_) {}

export const WebhookEvent = (models.WebhookEvent || model('WebhookEvent', WebhookEventSchema)) as any;

// ── WebhookWorkerStatus — heartbeat tracking ────────────────────────────────
const WebhookWorkerStatusSchema = new Schema({
  workerId:       { type: String, required: true, unique: true },   // e.g. 'cron-worker'
  startedAt:      { type: Date, default: Date.now },
  lastHeartbeat:  { type: Date, default: Date.now },
  processedCount: { type: Number, default: 0 },
  successCount:   { type: Number, default: 0 },
  failedCount:    { type: Number, default: 0 },
  uptime:         { type: Number, default: 0 },                     // seconds since startedAt
  status:         { type: String, enum: ['healthy', 'idle', 'error'], default: 'idle' },
  updatedAt:      { type: Date, default: Date.now },
});
WebhookWorkerStatusSchema.index({ workerId: 1 }, { unique: true });
WebhookWorkerStatusSchema.index({ lastHeartbeat: -1 });

export const WebhookWorkerStatus = (models.WebhookWorkerStatus || model('WebhookWorkerStatus', WebhookWorkerStatusSchema)) as any;

// ── WebhookSignature — replay attack protection (TTL 24h) ─────────────────
const WebhookSignatureSchema = new Schema({
  signature: { type: String, required: true, unique: true },  // full X-OPS-Signature value
  timestamp:  { type: String, required: true },                // X-OPS-Timestamp echoed back
  eventId:    { type: String, required: true },                // eventId from payload
  createdAt:  { type: Date, default: Date.now, expires: 86400 }, // TTL: auto-delete after 24 h
});
try { WebhookSignatureSchema.index({ signature: 1 }, { unique: true }); } catch (_) {}
try { WebhookSignatureSchema.index({ eventId: 1 }); } catch (_) {}
try { WebhookSignatureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); } catch (_) {}

export const WebhookSignature = (models.WebhookSignature || model('WebhookSignature', WebhookSignatureSchema)) as any;

// ── WebhookDeliveryLog — per-attempt delivery history ────────────────────
const WebhookDeliveryLogSchema = new Schema({
  eventId:      { type: String, required: true },              // UUID matching WebhookEvent.eventId
  event:        { type: String, required: true },              // event type, e.g. 'new_lead'
  targetUrl:    { type: String, required: true },
  responseCode: { type: Number, default: null },
  duration:     { type: Number, default: null },               // ms
  attempt:      { type: Number, required: true },
  status:       { type: String, enum: ['success', 'failed', 'timeout'], required: true },
  responseBody: { type: String, default: '' },
  error:        { type: String, default: '' },
  workerId:     { type: String, default: 'cron-worker' },
  createdAt:    { type: Date, default: Date.now },
});
try { WebhookDeliveryLogSchema.index({ eventId: 1 }); } catch (_) {}
try { WebhookDeliveryLogSchema.index({ status: 1 }); } catch (_) {}
try { WebhookDeliveryLogSchema.index({ createdAt: -1 }); } catch (_) {}
try { WebhookDeliveryLogSchema.index({ event: 1, createdAt: -1 }); } catch (_) {}

export const WebhookDeliveryLog = (models.WebhookDeliveryLog || model('WebhookDeliveryLog', WebhookDeliveryLogSchema)) as any;

// ── Enterprise Audit Log Schema ───────────────────────────────────────────────
const AuditLogSchema = new Schema({
  action: { type: String, required: true },
  module: { type: String, required: true },
  entityId: { type: String, required: true },
  entityType: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed, default: null },
  newValue: { type: Schema.Types.Mixed, default: null },
  performedBy: { type: String, required: true },
  performedByRole: { type: String, required: true },
  workspace: { type: String, default: 'ops-main' },
  ipAddress: { type: String, default: '127.0.0.1' },
  userAgent: { type: String, default: 'Unknown' },
  browser: { type: String, default: 'Unknown' },
  device: { type: String, default: 'Unknown' },
  timestamp: { type: Date, default: Date.now }
});

// Database Index Optimizations
AuditLogSchema.index({ module: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ entityId: 1 });
AuditLogSchema.index({ entityType: 1 });
AuditLogSchema.index({ performedBy: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = (models.AuditLog || model('AuditLog', AuditLogSchema)) as any;


// TTL-based: re-run at most once per 5 minutes to catch newly registered users
let _lastWorkspaceAssignAt = 0;

export async function ensureWorkspaceAssignment() {
  const now = Date.now();
  if (now - _lastWorkspaceAssignAt < 300_000) return; // debounce: 5 minutes (300 s)
  _lastWorkspaceAssignAt = now;

  try {
    // 1. Find or create the ops-main workspace
    let mainWs = await Workspace.findOne({ slug: 'ops-main' });
    if (!mainWs) {
      mainWs = await Workspace.create({ name: 'Main Workspace', slug: 'ops-main' });
      console.log('[Workspace Auto-assignment] Created workspace ops-main');
    }

    // 2. Assign only unassigned users to ops-main (idempotent — matches only users lacking workspaceId)
    const result = await User.updateMany(
      { $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
      { $set: { workspaceId: mainWs._id } }
    );

    if (result.modifiedCount > 0) {
      console.log(`[Workspace Auto-assignment] Assigned ${result.modifiedCount} user(s) to workspace ops-main`);
    }
  } catch (err) {
    // Reset timer so we retry next call if there was an error
    _lastWorkspaceAssignAt = 0;
    console.error('[Workspace Auto-assignment] Failed:', err);
  }
}
