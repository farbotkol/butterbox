import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { SessionSync } from "@/components/session-sync";
import { isShowcase } from "@/lib/showcase";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

function siteUrl() {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Butterbox Systems — less admin, more good days",
  description: "Simple, people-first scheduling for hospitality teams.",
  applicationName: "Butterbox Systems",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#18282B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        {isShowcase() && (
          <aside aria-label="Synthetic showcase notice" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-slate-950">
            <strong>SIMULATION ONLY.</strong> Fictional review data, not real attendance or payroll.
            Do not enter real personal information or import sample exports into payroll.
          </aside>
        )}
        <SessionSync />
        {children}
      </body>
    </html>
  );
}
