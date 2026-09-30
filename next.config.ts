import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "@prisma/client", "bcryptjs", "tesseract.js", "tesseract.js-core", "unpdf"],
  outputFileTracingIncludes: {
    // PDF-Erzeugung (Routen und Server-Aktionen wie E-Mail-Versand): Schriftdaten, ICC-Profil, eingebettete Schriften
    "/api/**/*": ["./node_modules/pdfkit/js/**/*", "./assets/fonts/**/*"],
    // Lokale Texterkennung: WASM-Kern und deutsche Sprachdaten mitliefern
    "/**/*": [
      "./node_modules/pdfkit/js/**/*",
      "./assets/fonts/**/*",
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
