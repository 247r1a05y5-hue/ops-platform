import axios from "axios";

// ── Configuration helpers ──────────────────────────────────────────────────────

/** Returns true if WhatsApp env vars are present and non-empty. */
export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN);
}

// ── Result type ───────────────────────────────────────────────────────────────

export type WhatsAppResult = {
  success: boolean;
  data?: unknown;
  code?: number | null;
  error?: string;
};

// ── Main send function ────────────────────────────────────────────────────────

/**
 * Sends a text message via Meta WhatsApp Cloud API.
 * NEVER throws — returns a result object so callers can degrade gracefully.
 *
 * @param to   Recipient phone number with country code, no leading '+'.
 * @param message  Text content of the message.
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<WhatsAppResult> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;

  if (!phoneId || !token) {
    console.warn("[WhatsApp] Skipped — WHATSAPP_PHONE_ID or WHATSAPP_TOKEN not configured.");
    return { success: false, code: null, error: "WhatsApp not configured" };
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: message },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(`[WhatsApp] Message sent successfully.`);

    // Persist outbound log in MongoDB for delivery tracking
    try {
      const waMessageId = response.data?.messages?.[0]?.id ?? '';
      if (waMessageId) {
        const { connectDB, WhatsAppMessage } = await import('./db');
        await connectDB();
        await WhatsAppMessage.create({
          direction: 'outbound',
          waMessageId,
          phone: to,
          body: message,
          status: 'sent',
          sentAt: new Date(),
        });
      }
    } catch (dbErr) {
      console.error('[WhatsApp] Failed to save outbound log in DB:', dbErr);
    }

    return { success: true, data: response.data };

  } catch (error: any) {
    const apiError = error.response?.data?.error;
    const httpStatus: number | null = error.response?.status ?? null;

    if (apiError) {
      const code: number = apiError.code ?? 0;
      const msg: string = apiError.message ?? "Unknown Meta API error";

      // Auth errors (code 190) are persistent — log once at warn level, not error
      if (code === 190) {
        console.warn(
          `[WhatsApp] Authentication error (190): ${msg}. ` +
          `Check WHATSAPP_TOKEN validity in Meta Developer Console.`
        );
      } else {
        console.error(`[WhatsApp] API error ${code}: ${msg} (HTTP ${httpStatus})`);
      }

      return {
        success: false,
        code,
        error: `Meta API error ${code}: ${msg}`,
      };
    }

    // Network / timeout errors
    const netMsg: string = error.message ?? "Network error";
    console.error(`[WhatsApp] Network error: ${netMsg}`);
    return { success: false, code: null, error: netMsg };
  }
}
