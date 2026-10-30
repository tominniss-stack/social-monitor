/**
 * Security headers (D-21 / SEC-12).
 *
 * CSP note: `script-src 'unsafe-inline'` is required today by the inline theme
 * bootstrap script in `src/app/layout.tsx` and by Next.js App Router hydration
 * payloads, which are inline without a nonce. Tightening this to a per-request
 * nonce (middleware-generated, passed via `next/headers`) is a planned future
 * hardening step; everything else is locked to self-origin.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://images.unsplash.com data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
