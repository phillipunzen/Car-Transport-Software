import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "@prisma/client", "bcryptjs"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
