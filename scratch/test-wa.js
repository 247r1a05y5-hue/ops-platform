import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const phoneId = process.env.WHATSAPP_PHONE_ID;
const token = process.env.WHATSAPP_TOKEN;
const to = process.env.ADMIN_WHATSAPP_NUMBER || '919284788141';

console.log('Using Phone ID:', phoneId);
console.log('Token length:', token ? token.length : 0);
console.log('Sending to:', to);

const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
const payload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: { body: "🚀 WhatsApp Integration is LIVE! Your Meta Cloud API token is configured and working perfectly. Let's build something awesome!" },
};

async function run() {
  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    });
    console.log('✅ Success! Message sent successfully:', res.data);
  } catch (err) {
    console.error('❌ Error sending message:', err.response?.data || err.message);
  }
}

run();
