import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Butterbox — A better working week", template: "%s · Butterbox" },
  description: "A calmer way to plan your hospitality team. Manage venues, build rosters, and keep everyone in the loop.",
  applicationName: "Butterbox",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f7f8fa" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Authentication and configuration must be evaluated at request time, even in an unconfigured build.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
