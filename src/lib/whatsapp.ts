import axios from "axios";
import { logStep, addExtTime, getLogStore, incrementMetric } from "./logger";

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

  logStep('EXTERNAL', `WhatsApp Outbound Message Started\nTo: ${to}\nBody: ${message}`);
  const startTime = Date.now();

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: message },
  };

  try {
    const store = getLogStore();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (store?.requestId) {
      headers["X-Request-ID"] = store.requestId;
    }

    const response = await axios.post(url, payload, {
      headers,
      timeout: 10000,
    });

    const duration = Date.now() - startTime;
    addExtTime(duration);
    console.log(`[WhatsApp] Message sent successfully.`);
    logStep('EXTERNAL', `SUCCESS\nWhatsApp Outbound Message Completed\nDuration: ${duration} ms`);

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
    incrementMetric('whatsappFailures');
    const duration = Date.now() - startTime;
    addExtTime(duration);
    
    const apiError = error.response?.data?.error;
    const httpStatus: number | null = error.response?.status ?? null;

    if (apiError) {
      const code: number = apiError.code ?? 0;
      const msg: string = apiError.message ?? "Unknown Meta API error";

      logStep('EXTERNAL', `[EXTERNAL SERVICE FAILED]\nService: WhatsApp API\nError: ${msg} (Meta Code: ${code})\nDuration: ${duration} ms`);

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

    const netMsg: string = error.message ?? "Network error";
    logStep('EXTERNAL', `[EXTERNAL SERVICE FAILED]\nService: WhatsApp API\nError: ${netMsg}\nDuration: ${duration} ms`);
    console.error(`[WhatsApp] Network error: ${netMsg}`);
    return { success: false, code: null, error: netMsg };
  }
}
