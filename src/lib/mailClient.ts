// src/lib/mailClient.ts
// Client‑side helper that forwards email requests to a server API route.
// This avoids bundling nodemailer (and its 'child_process' dependency) into the client.
// NOTE: Admin email routing is handled server-side via ADMIN_EMAIL env var — never hardcoded here.

export async function sendAdminMailClient(subject: string, body: string, recipients?: string[]) {
  try {
    const res = await fetch('/api/admin/mail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Pass only explicit recipients; the server will add ADMIN_EMAIL automatically
      body: JSON.stringify({ subject, body, recipients: recipients ?? [] }),
    });
    if (!res.ok) {
      console.error('Failed to send admin email', await res.text());
    }
  } catch (err) {
    console.error('Error sending admin email', err);
  }
}
