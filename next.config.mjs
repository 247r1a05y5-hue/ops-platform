/** @type {import('next').NextConfig} */
const nextConfig = {
  // No turbopack root needed — single deployment, no workspace ambiguity
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.jitsi.net https://meet.jit.si https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; media-src 'self' blob: https://res.cloudinary.com; connect-src 'self' wss://* ws://* https://*; frame-src 'self' https://meet.jit.si https://*.google.com;",
          },
        ],
      },
    ];
  },

  // Ensure Next.js doesn't try to serve the custom server path
  // (server.mjs is the entry point, not next start)
  experimental: {
    // Enable server actions if you use them
    // serverActions: { allowedOrigins: ['yourdomain.com'] },
  },
};

export default nextConfig;
