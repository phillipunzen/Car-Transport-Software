import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Überführung", template: "%s · Überführung" },
  description: "Fahrzeugüberführungen planen, dokumentieren und abrechnen.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Überführung", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d64e0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
