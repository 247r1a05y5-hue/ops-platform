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

  // Ensure Next.js doesn't try to serve the custom server path
  // (server.mjs is the entry point, not next start)
  experimental: {
    // Enable server actions if you use them
    // serverActions: { allowedOrigins: ['yourdomain.com'] },
  },
};

export default nextConfig;
