import type { NextConfig } from "next";

// Basic HTTP security headers sent with every response.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" }, // browsers must not guess file types
  { key: "X-Frame-Options", value: "DENY" }, // no embedding in iframes (clickjacking)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // do not advertise the framework version
  // Native ONNX runtime used by Transformers.js must be loaded by Node.js, not bundled.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
