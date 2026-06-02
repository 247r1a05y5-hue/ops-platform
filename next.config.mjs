/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimisation — allow Cloudinary CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },

  // Disable Next.js telemetry in CI/CD
  // (also set NEXT_TELEMETRY_DISABLED=1 in Railway env vars)

  // Trailing slashes — keep consistent with Railway reverse proxy
  trailingSlash: false,

  // Allow Railway's public domain in production
  // (Next.js 15 requires this for server actions across origins)
  experimental: {
    serverActions: {
      allowedOrigins: process.env.NEXT_PUBLIC_APP_URL
        ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, '')]
        : [],
    },
  },
};

export default nextConfig;
