import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Syne } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
  "https://ghost-tip.vercel.app";
const TITLE = "GhostTip — Tip anyone. Stay ghost.";
const DESCRIPTION =
  "Privacy-first social tipping on Solana. Send SOL by X handle, routed through Loyal Network's private rail — the recipient verifies with X to claim, or the sender is auto-refunded.";

export const metadata: Metadata = {
  // `metadataBase` lets every page emit absolute OG / Twitter image URLs
  // without each one repeating the origin. Pulled from env so the value
  // follows NEXT_PUBLIC_APP_URL across preview / prod deployments.
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    // Subpages set just `title: "Send"` and get "Send · GhostTip".
    template: "%s · GhostTip",
  },
  description: DESCRIPTION,
  applicationName: "GhostTip",
  keywords: [
    "solana",
    "loyal network",
    "x oauth",
    "twitter oauth",
    "privacy",
    "tipping",
    "crypto",
    "escrow",
  ],
  authors: [{ name: "GhostTip" }],
  openGraph: {
    type: "website",
    siteName: "GhostTip",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
    // `app/opengraph-image.tsx` is auto-wired by Next.js conventions —
    // no need to list the image explicitly here.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@GhostTip",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  // Tells search engines + social scrapers the canonical URL even on
  // preview deployments, so unfurls don't link to a branch URL that
  // will disappear next deploy.
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${syne.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
