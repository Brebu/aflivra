import type { Metadata, Viewport } from "next";
import "./globals.css";
import {TooltipProvider} from "@/components/ui/tooltip";
import {HOME_METADATA} from "./seo";

export const viewport: Viewport = {
  themeColor: "#0071e3",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  ...HOME_METADATA,
  manifest: "/manifest.webmanifest?v=2",
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
      <body className="antialiased"><TooltipProvider delayDuration={350}>{children}</TooltipProvider></body>
    </html>
  );
}
