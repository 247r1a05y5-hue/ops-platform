// src/lib/mail.ts

export async function sendAdminMail(subject: string, body: string, recipients?: string[]) {
  let adminEmail = (process.env.ADMIN_EMAIL || '').trim();
  if (!adminEmail || adminEmail.toLowerCase() === 'admin@ops.com') {
    adminEmail = (process.env.SENDER_EMAIL || 'admin@ops.com').trim();
  }
  const toAddresses = Array.isArray(recipients) && recipients.length > 0
    ? [...new Set([...recipients, adminEmail].filter(Boolean))]
    : [adminEmail];

  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.SENDER_EMAIL || 'no-reply@ops.com';

  console.log('sendAdminMail: sending from', fromAddress, 'to', toAddresses);

  if (apiKey) {
    // Send via official Brevo Transactional Email REST API
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          sender: {
            name: 'OPS System',
            email: fromAddress,
          },
          to: toAddresses.map(email => ({ email })),
          subject: subject,
          textContent: body,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brevo API Error (${response.status}): ${errText}`);
      }

      const resData = await response.json();
      console.log('Admin email sent successfully via Brevo. messageId:', resData.messageId);
    } catch (err: any) {
      console.error('Failed to send admin email via Brevo:', err.message);
      throw err;
    }
  } else {
    throw new Error('BREVO_API_KEY is not configured in the environment.');
  }
}
