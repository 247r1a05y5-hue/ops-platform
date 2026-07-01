// Jest environment setup file
(process.env as any).NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test_ops';
process.env.JWT_SECRET = 'supersecretjwttokenmustbeatleast32characterslong';
process.env.CRON_SECRET = 'supersecretcron';
process.env.BREVO_API_KEY = 'xkeysib-brevo-test-key-at-least-32-chars';
process.env.SENDER_EMAIL = 'sender@example.com';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.ZAPIER_WEBHOOK_URL = 'http://zapier.com/webhook';
process.env.ZAPIER_API_KEY = 'zapier-api-key';
process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud';
process.env.CLOUDINARY_API_KEY = 'test_key';
process.env.CLOUDINARY_API_SECRET = 'test_secret';
process.env.WHATSAPP_PHONE_ID = 'whatsapp_id';
process.env.WHATSAPP_TOKEN = 'whatsapp_token';

// Globally mock jose library to avoid ESM transpilation errors in Jest
jest.mock('jose', () => {
  return {
    SignJWT: class {
      payload: any;
      constructor(payload: any) {
        this.payload = payload;
      }
      setProtectedHeader() { return this; }
      setIssuedAt() { return this; }
      setExpirationTime() { return this; }
      async sign() {
        return 'mockedjwt.' + Buffer.from(JSON.stringify(this.payload)).toString('base64') + '.signature';
      }
    },
    jwtVerify: async (token: string) => {
      if (!token.startsWith('mockedjwt.')) {
        throw new Error('Invalid signature');
      }
      const parts = token.split('.');
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return { payload };
      } catch {
        throw new Error('Invalid token');
      }
    }
  };
});

// Suppress console.log / console.warn during test execution to clean up logs
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
