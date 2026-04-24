/**
 * Twitter / X large-image card. X reads `twitter:image` independently of
 * `og:image`, so we ship a sibling file. The visual mirrors the root OG
 * image — shared visual, separate files because Next's file conventions
 * require each route to declare its own `runtime` / `size` statically
 * (re-exports aren't followed by the build-time parser).
 */

import OpenGraphImage from "./opengraph-image";

export const runtime = "edge";
export const alt = "GhostTip — Tip anyone. Stay ghost.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OpenGraphImage;
