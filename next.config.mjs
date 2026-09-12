/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

// The sandbox preview is served from an arbitrary public host
// (https://{port}-{sandboxId}.e2b.app). Next's dev server rejects cross-origin
// requests to /_next/* from hosts it doesn't know about, which breaks the live
// preview, so every plausible preview host pattern must be allowed.
const allowedDevOrigins = [
  'localhost',
  '127.0.0.1',
  '*.e2b.app',
  '*.e2b.dev',
  '*.arena.ai',
  '*.arena.sh',
  ...(process.env.NEXT_ALLOWED_ORIGINS ? process.env.NEXT_ALLOWED_ORIGINS.split(',') : []),
];

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  // Shared domain code (core/, lib/) is written in plain TS and consumed by
  // both the Next app and the API server, so it must be transpiled here too.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    authInterrupts: false,
  },
  async rewrites() {
    // Browser code never talks to the API origin directly: this rewrite keeps
    // every API call same-origin (server-side proxy to the API process).
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
  eslint: {
    dirs: ['app', 'components', 'lib', 'core', 'server', 'db'],
  },
};

export default nextConfig;
