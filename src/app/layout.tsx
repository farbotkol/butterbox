import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Butterbox — hospitality, running smoothly",
  description: "Simple, people-first scheduling for hospitality teams.",
  applicationName: "Butterbox",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#173d32",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
