// src/lib/mailClient.ts
// Client‑side helper that forwards email requests to a server API route.
// This avoids bundling nodemailer (and its 'child_process' dependency) into the client.

export async function sendAdminMailClient(subject: string, body: string, recipients?: string[]) {
  // Ensure admin always receives notifications
  const adminEmail = 'admin@ops.com';
  const finalRecipients = recipients ? Array.from(new Set([...recipients, adminEmail])) : [adminEmail];
  try {
    const res = await fetch('/api/admin/mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject, body, recipients: finalRecipients }),
    });
    if (!res.ok) {
      console.error('Failed to send admin email', await res.text());
    }
  } catch (err) {
    console.error('Error sending admin email', err);
  }
}
