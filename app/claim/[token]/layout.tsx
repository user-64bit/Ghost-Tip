import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

/**
 * Route-segment metadata for /claim/[token].
 *
 * The page itself is a Client Component (it reads useParams, runs OAuth +
 * wallet hooks), and Client Components can't export `metadata`. This
 * server-side layout wraps the page strictly so Next picks up the
 * route-scoped title / description / og overrides.
 *
 * The OG / Twitter images live in sibling files
 * (`opengraph-image.tsx` / `twitter-image.tsx`) and are auto-wired by
 * Next's file conventions — no need to list them here.
 */

export const metadata: Metadata = {
  title: "Claim your tip",
  description:
    "Someone tipped you on GhostTip. Verify with X to prove it's for you, then connect a wallet to receive.",
  openGraph: {
    title: "Someone tipped you · GhostTip",
    description:
      "Verify with X and connect a wallet to claim. Private, auto-refund if unclaimed.",
    type: "website",
    images: [
      {
        url: "/og-image-claim.png",
        width: 1200,
        height: 630,
        alt: "Someone tipped you on GhostTip — Claim your tip.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Someone tipped you · GhostTip",
    description:
      "Verify with X and connect a wallet to claim. Private, auto-refund if unclaimed.",
    images: [
      {
        url: "/og-image-claim.png",
        width: 1200,
        height: 630,
        alt: "Someone tipped you on GhostTip — Claim your tip.",
      },
    ],
  },
  // Each claim token is unique; tell social scrapers + search not to
  // index individual claim pages (they expire, they're sensitive).
  robots: { index: false, follow: false },
};

export default function ClaimLayout({ children }: PropsWithChildren) {
  return children;
}
