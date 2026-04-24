/** X-specific twin of the claim-page OG card. See ./opengraph-image.tsx. */

import ClaimOpenGraphImage from "./opengraph-image";

export const runtime = "edge";
export const alt = "Someone tipped you on GhostTip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default ClaimOpenGraphImage;
