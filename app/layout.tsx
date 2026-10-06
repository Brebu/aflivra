import type { Metadata, Viewport } from "next";
import "./globals.css";
import {TooltipProvider} from "@/components/ui/tooltip";

export const viewport: Viewport = {
  themeColor: "#0071e3",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Aflivra — România la îndemână",
  description: "Explorează România prin dashboarduri, hărți, galerii și comparații. Date din surse publice, cu perioada și ultima verificare vizibile.",
  manifest: "/manifest.webmanifest?v=2",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Aflivra", statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro">
      <head><link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body className="antialiased"><TooltipProvider delayDuration={350}>{children}</TooltipProvider></body>
    </html>
  );
}
