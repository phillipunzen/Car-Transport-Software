import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "@prisma/client", "bcryptjs", "tesseract.js", "tesseract.js-core", "unpdf"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/**/*"],
    // Lokale Texterkennung: WASM-Kern und deutsche Sprachdaten mitliefern
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/zlibjs/**/*",
      "./node_modules/@tesseract.js-data/deu/4.0.0_best_int/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
