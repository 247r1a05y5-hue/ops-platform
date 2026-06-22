// src/lib/mail.ts
import nodemailer from 'nodemailer';

// Configure transporter lazily. Real SMTP in production, Ethereal in dev.
let _transporter: nodemailer.Transporter | null = null;
let _initPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (_transporter) return _transporter;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const portStr = process.env.SMTP_PORT || process.env.EMAIL_PORT;
    const port = portStr ? Number(portStr) : undefined;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (host && port && user && pass) {
      _transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      // Create Ethereal test account on the fly for development
      const testAccount = await nodemailer.createTestAccount();
      _transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }
    return _transporter;
  })();

  return _initPromise;
}

export async function sendAdminMail(subject: string, body: string, recipients?: string[]) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ops.com';
  const toAddresses = Array.isArray(recipients) && recipients.length > 0
    ? [...new Set([...recipients, adminEmail].filter(Boolean))]
    : [adminEmail];

  const transporter = await getTransporter();
  const fromAddress = process.env.SENDER_EMAIL || 'no-reply@ops.com';
  console.log('sendAdminMail: transport from', fromAddress, 'admin recipient', adminEmail, 'all recipients', toAddresses);
  const info = await transporter.sendMail({
    from: `"OPS System" <${fromAddress}>`,
    to: toAddresses,
    subject,
    text: body,
  });
  if (process.env.NODE_ENV !== 'production') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Admin email preview URL:', previewUrl);
  }
}
