import type { NextConfig } from "next"

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8031"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy backend REST API; Next's own routes live under /api/auth/*.
      { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
    ]
  },
}

export default nextConfig
