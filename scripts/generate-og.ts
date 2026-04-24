/**
 * Generate public/og-image.png + public/og-image-claim.png.
 *
 * Run with: `bun scripts/generate-og.ts`
 *
 * Why a one-shot script instead of Next's dynamic `opengraph-image.tsx`:
 * some link unfurlers (Twitter/X in particular) don't reliably render
 * Satori-built images served from an edge function — the crawler drops
 * them silently with no error. Committing a plain PNG from `/public/`
 * is boring but universally honoured.
 *
 * The images are generated from inline SVG (no fonts to fetch, no
 * network dependencies) via `sharp`, which embeds the SVG at 1200×630
 * exactly. Re-run the script whenever the brand changes.
 */

import sharp from "sharp";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const W = 1200;
const H = 630;

mkdirSync(path.resolve("public"), { recursive: true });

const rootSvg = buildRootSvg();
const claimSvg = buildClaimSvg();

await renderToPng(rootSvg, "public/og-image.png");
await renderToPng(claimSvg, "public/og-image-claim.png");

async function renderToPng(svg: string, outPath: string) {
  const buf = await sharp(Buffer.from(svg), { density: 144 })
    .resize(W, H)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(path.resolve(outPath), buf);
  console.log(`wrote ${outPath} (${buf.byteLength} bytes)`);
  if (!existsSync(outPath)) process.exit(1);
}

function buildRootSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${sharedDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="320" cy="140" rx="520" ry="340" fill="url(#violetGlow)" opacity="0.55"/>
  <ellipse cx="1020" cy="580" rx="380" ry="280" fill="url(#tealGlow)" opacity="0.4"/>

  <!-- Brand lockup top-left -->
  <g transform="translate(72,60)">
    ${ghostGlyph(60)}
    <text x="82" y="42" fill="#F0F0F8" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="700" letter-spacing="-0.5">GhostTip</text>
  </g>

  <!-- Status pill -->
  <g transform="translate(${W / 2 - 280}, 200)">
    <rect width="560" height="48" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <circle cx="28" cy="24" r="6" fill="#4ECDC4"/>
    <text x="50" y="32" fill="#A8A8C8" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="18" letter-spacing="4" font-weight="500">PRIVATE TIPS · SOLANA · LOYAL RAIL</text>
  </g>

  <!-- Headline -->
  <text x="${W / 2}" y="380" fill="#F0F0F8" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="112" font-weight="800" text-anchor="middle" letter-spacing="-4">Tip anyone.</text>
  <text x="${W / 2}" y="492" fill="url(#gtg)" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="112" font-weight="800" text-anchor="middle" letter-spacing="-4">Stay ghost.</text>

  <!-- Footer -->
  <text x="${W / 2}" y="578" fill="#6B6B8A" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle">GHOST-TIP.VERCEL.APP</text>
</svg>`.trim();
}

function buildClaimSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${sharedDefs()}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${W / 2}" cy="60" rx="560" ry="360" fill="url(#violetGlow)" opacity="0.55"/>
  <ellipse cx="1060" cy="${H}" rx="420" ry="300" fill="url(#tealGlow)" opacity="0.35"/>

  <g transform="translate(72,60)">
    ${ghostGlyph(60)}
    <text x="82" y="42" fill="#F0F0F8" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="700" letter-spacing="-0.5">GhostTip</text>
  </g>

  <!-- Ghost medallion -->
  <g transform="translate(${W / 2 - 110},160)">
    <circle cx="110" cy="110" r="110" fill="rgba(124,106,247,0.14)" stroke="rgba(124,106,247,0.45)" stroke-width="2"/>
    <g transform="translate(50,50)">
      ${ghostGlyph(120)}
    </g>
  </g>

  <text x="${W / 2}" y="450" fill="#8F8FB5" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="26" letter-spacing="6" text-anchor="middle" font-weight="500">SOMEONE TIPPED YOU</text>
  <text x="${W / 2}" y="540" fill="url(#gtg)" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="96" font-weight="800" text-anchor="middle" letter-spacing="-3">Claim your tip.</text>
  <text x="${W / 2}" y="594" fill="#6B6B8A" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle">PRIVATE · SOLANA · LOYAL RAIL</text>
</svg>`.trim();
}

function sharedDefs(): string {
  return `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#120B2E"/>
    <stop offset="1" stop-color="#0A0A0F"/>
  </linearGradient>
  <linearGradient id="gtg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#B6A9FF"/>
    <stop offset="0.55" stop-color="#7C6AF7"/>
    <stop offset="1" stop-color="#4ECDC4"/>
  </linearGradient>
  <radialGradient id="violetGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#7C6AF7" stop-opacity="0.8"/>
    <stop offset="1" stop-color="#7C6AF7" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="tealGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#4ECDC4" stop-opacity="0.8"/>
    <stop offset="1" stop-color="#4ECDC4" stop-opacity="0"/>
  </radialGradient>
</defs>`.trim();
}

/**
 * Inline ghost glyph matching app/components/ui/GhostTipLogo.tsx. `size`
 * is the output width/height — the source viewBox is 32×32.
 */
function ghostGlyph(size: number): string {
  const s = (size / 32).toFixed(4);
  return `
<g transform="scale(${s})">
  <path d="M16 3c-5.3 0-9.5 4-9.5 9.4v12.1c0 1.8 2.1 2.8 3.5 1.7l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c.5.4 1.2.4 1.7 0l1.9-1.4c.5-.4 1.2-.4 1.7 0l1.9 1.4c1.4 1.1 3.5.1 3.5-1.7V12.4C25.5 7 21.3 3 16 3Z" fill="url(#gtg)"/>
  <circle cx="12.3" cy="13.4" r="1.35" fill="#0A0A0F"/>
  <circle cx="19.7" cy="13.4" r="1.35" fill="#0A0A0F"/>
</g>`.trim();
}
