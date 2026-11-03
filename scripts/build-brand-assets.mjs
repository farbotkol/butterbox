#!/usr/bin/env node
// Builds every Butterbox logo, icon and artwork derivative from the traced
// vector geometry of the owner-selected Coastal Wave reference.
//
//   python3 branding/tools/trace_reference.py   # only when the reference changes
//   node scripts/build-brand-assets.mjs
//
// Outputs are deterministic. Raster files are rendered from vectors; the
// reference PNG is never embedded in an SVG.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const geometry = JSON.parse(readFileSync(join(root, "branding/logos/source/traced-geometry.json"), "utf8"));
const P = geometry.paths;

export const COLORS = {
  gold: "#F0B150",
  teal: "#619A92",
  cream: "#F9F1E5",
  charcoal: "#18282B",
  white: "#FFFFFF",
};

function pathBounds(d) {
  const tokens = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  let i = 0, cmd = "", cx = 0, cy = 0;
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z") continue;
    if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = tokens.slice(i, i + 6).map(Number);
      i += 6;
      for (let s = 0; s <= 24; s++) {
        const t = s / 24, u = 1 - t;
        add(u ** 3 * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          u ** 3 * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3);
      }
      cx = x3; cy = y3;
    } else {
      cx = Number(tokens[i]); cy = Number(tokens[i + 1]);
      i += 2;
      add(cx, cy);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const icon = pathBounds(P.silhouette);
const word = pathBounds(P.wordmark);
const r = (n) => Math.round(n * 100) / 100;

// Inner artwork, positioned in reference coordinates.
function iconArt(mode, mono) {
  if (mode === "mono") {
    return `<g fill="${mono}"><path d="${P.gold}"/><path d="${P.teal}"/></g>`;
  }
  return [
    `<path fill="${COLORS.teal}" d="${P.silhouette}"/>`,
    `<path fill="${COLORS.cream}" d="${P.creamAndGold}"/>`,
    `<path fill="${COLORS.gold}" d="${P.gold}"/>`,
  ].join("");
}
const wordArt = (fill) => `<path fill="${fill}" d="${P.wordmark}"/>`;

// Horizontal lockup proportions (in icon-height units).
export const HORIZONTAL = { wordHeightRatio: 0.4, gapRatio: 0.24 };
const hScale = (icon.h * HORIZONTAL.wordHeightRatio) / word.h;
const hGap = icon.h * HORIZONTAL.gapRatio;

function svgDoc({ width, height, body, title, background = null }) {
  const bg = background ? `<rect width="${r(width)}" height="${r(height)}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(width)} ${r(height)}" role="img" aria-label="${title}">\n<title>${title}</title>\n${bg}${body}\n</svg>\n`;
}

const PAD = 4;
function iconLayout(mode, mono) {
  return {
    width: icon.w + PAD * 2,
    height: icon.h + PAD * 2,
    body: `<g transform="translate(${r(PAD - icon.x)} ${r(PAD - icon.y)})">${iconArt(mode, mono)}</g>`,
  };
}
function stackedLayout(mode, wordFill, mono) {
  // Keeps the exact relative placement of icon and wordmark in the reference.
  const x0 = Math.min(icon.x, word.x) - PAD, y0 = icon.y - PAD;
  const x1 = Math.max(icon.x + icon.w, word.x + word.w) + PAD, y1 = word.y + word.h + PAD;
  return {
    width: x1 - x0,
    height: y1 - y0,
    body: `<g transform="translate(${r(-x0)} ${r(-y0)})">${iconArt(mode, mono)}${wordArt(wordFill)}</g>`,
  };
}
function horizontalLayout(mode, wordFill, mono) {
  const wordW = word.w * hScale, wordH = word.h * hScale;
  const wordX = PAD + icon.w + hGap, wordY = PAD + (icon.h - wordH) / 2;
  const iconTransform = `translate(${r(PAD - icon.x)} ${r(PAD - icon.y)})`;
  const wordTransform = `translate(${r(wordX)} ${r(wordY)}) scale(${hScale.toFixed(5)}) translate(${r(-word.x)} ${r(-word.y)})`;
  return {
    width: wordX + wordW + PAD,
    height: icon.h + PAD * 2,
    iconTransform,
    wordTransform,
    body:
      `<g transform="${iconTransform}">${iconArt(mode, mono)}</g>` +
      `<g transform="${wordTransform}">${wordArt(wordFill)}</g>`,
  };
}

// Square icon placed on a canvas; scale = icon width as a fraction of canvas.
function squareIcon(size, fraction, background, radius = 0) {
  const s = (size * fraction) / Math.max(icon.w, icon.h);
  const ox = (size - icon.w * s) / 2, oy = (size - icon.h * s) / 2;
  const bg = background
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>`
    : "";
  return svgDoc({
    width: size,
    height: size,
    title: "Butterbox",
    body: `${bg}<g transform="translate(${r(ox)} ${r(oy)}) scale(${s.toFixed(5)}) translate(${r(-icon.x)} ${r(-icon.y)})">${iconArt("color")}</g>`,
  });
}

const variants = {
  "butterbox-logo-stacked-light": [stackedLayout("color", COLORS.charcoal), "Butterbox"],
  "butterbox-logo-stacked-dark": [stackedLayout("color", COLORS.cream), "Butterbox"],
  "butterbox-logo-stacked-mono-dark": [stackedLayout("mono", COLORS.charcoal, COLORS.charcoal), "Butterbox"],
  "butterbox-logo-stacked-mono-white": [stackedLayout("mono", COLORS.white, COLORS.white), "Butterbox"],
  "butterbox-logo-horizontal-light": [horizontalLayout("color", COLORS.charcoal), "Butterbox"],
  "butterbox-logo-horizontal-dark": [horizontalLayout("color", COLORS.cream), "Butterbox"],
  "butterbox-logo-horizontal-mono-dark": [horizontalLayout("mono", COLORS.charcoal, COLORS.charcoal), "Butterbox"],
  "butterbox-logo-horizontal-mono-white": [horizontalLayout("mono", COLORS.white, COLORS.white), "Butterbox"],
  "butterbox-icon": [iconLayout("color"), "Butterbox"],
  "butterbox-icon-mono-dark": [iconLayout("mono", COLORS.charcoal), "Butterbox"],
  "butterbox-icon-mono-white": [iconLayout("mono", COLORS.white), "Butterbox"],
};

const out = (p) => {
  const full = join(root, p);
  mkdirSync(dirname(full), { recursive: true });
  return full;
};
const write = (p, data) => writeFileSync(out(p), data);

async function png(svg, width, height, file) {
  // Render large, then downsample for even anti-aliasing at small sizes.
  const density = Math.min(2400, Math.max(72, Math.ceil((72 * width * 4) / svgWidth(svg))));
  await sharp(Buffer.from(svg), { density })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(out(file));
}
const svgWidth = (svg) => Number(svg.match(/viewBox="0 0 ([\d.]+)/)[1]);

function ico(pngBuffers) {
  const header = Buffer.alloc(6 + 16 * pngBuffers.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngBuffers.length, 4);
  let offset = header.length;
  pngBuffers.forEach(({ size, data }, n) => {
    const e = 6 + n * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngBuffers.map((b) => b.data)]);
}

// Coastal artwork used on authentication screens and the dashboard hero.
// Wave crests echo the logo's cream break; colours are the logo palette.
// Emitted both as an SVG file and as data for the inline React component.
export const ARTWORK = {
  viewBox: "0 0 1200 560",
  background: "#FBF6EE",
  circles: [
    { cx: 930, cy: 170, r: 128, fill: COLORS.gold, opacity: 0.18 },
    { cx: 930, cy: 170, r: 86, fill: COLORS.gold },
  ],
  paths: [
    { fill: "#D7E6E2", d: "M0 330c120-26 220-34 330-22 120 13 200 38 330 30 140-9 250-48 360-56 70-5 130 2 180 10v268H0Z" },
    { fill: "#A9CCC5", d: "M0 380c140-40 250-46 360-30 105 15 175 46 300 42 135-4 245-60 370-66 66-3 122 6 170 18v216H0Z" },
    { fill: COLORS.teal, d: "M0 430c110-38 210-52 320-40 90 10 150 40 250 40 120 0 210-84 340-92 120-7 210 30 290 62v160H0Z" },
    { fill: COLORS.cream, d: "M570 430c120 0 210-84 340-92 64-4 120 6 168 22-58-10-118-8-170 10-70 24-104 70-150 88-34 13-60 6-58-14 1-16 18-24 36-30-46 10-94 16-166 16Z" },
    { fill: "#4E847D", d: "M0 486c130-30 260-36 400-22 130 13 230 28 380 16 150-12 280-38 420-40v120H0Z" },
    { fill: "none", stroke: COLORS.cream, opacity: 0.85, d: "M60 452c60-14 118-18 170-12M300 470c70-8 130-6 190 4M760 500c60-8 120-10 180-4" },
  ],
};

function artworkInner({ background = true } = {}) {
  const bg = background ? `<rect width="1200" height="560" fill="${ARTWORK.background}"/>` : "";
  const circles = ARTWORK.circles
    .map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${c.fill}"${c.opacity ? ` opacity="${c.opacity}"` : ""}/>`)
    .join("");
  const paths = ARTWORK.paths
    .map((p) => `<path fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}" stroke-linecap="round" stroke-width="5"` : ""}${p.opacity ? ` opacity="${p.opacity}"` : ""} d="${p.d}"/>`)
    .join("");
  return bg + circles + paths;
}

export function coastalArtworkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ARTWORK.viewBox}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">\n${artworkInner()}\n</svg>\n`;
}

async function main() {
  rmSync(join(root, "branding/logos/svg"), { recursive: true, force: true });
  rmSync(join(root, "branding/logos/png"), { recursive: true, force: true });

  const svgs = {};
  for (const [name, [layout, title]] of Object.entries(variants)) {
    const svg = svgDoc({ ...layout, title });
    svgs[name] = svg;
    write(`branding/logos/svg/${name}.svg`, svg);
  }

  // Transparent PNG derivatives.
  const pngWidths = { stacked: 1200, horizontal: 1600, icon: 1024 };
  for (const [name, svg] of Object.entries(svgs)) {
    const kind = name.includes("stacked") ? "stacked" : name.includes("horizontal") ? "horizontal" : "icon";
    const w = pngWidths[kind];
    const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    await png(svg, w, Math.round((w * vh) / vw), `branding/logos/png/${name}-${w}w.png`);
  }
  await png(svgs["butterbox-logo-horizontal-light"], 480, null, "branding/logos/png/butterbox-logo-horizontal-light-480w.png");
  await png(svgs["butterbox-logo-horizontal-dark"], 480, null, "branding/logos/png/butterbox-logo-horizontal-dark-480w.png");

  // Favicons and application icons.
  const faviconSvg = squareIcon(512, 0.96, null);
  const appSvg = squareIcon(1024, 0.72, COLORS.white);
  const maskableSvg = squareIcon(1024, 0.56, COLORS.white);
  const socialSvg = squareIcon(1024, 0.6, COLORS.white);
  write("branding/icons/butterbox-favicon.svg", faviconSvg);
  write("branding/icons/butterbox-app-icon.svg", appSvg);
  write("branding/icons/butterbox-app-icon-maskable.svg", maskableSvg);
  write("branding/icons/butterbox-social-profile.svg", socialSvg);

  const icoParts = [];
  for (const size of [16, 32, 48]) {
    const file = `branding/icons/butterbox-favicon-${size}.png`;
    await png(faviconSvg, size, size, file);
    icoParts.push({ size, data: readFileSync(out(file)) });
  }
  const favicon = ico(icoParts);
  write("branding/icons/favicon.ico", favicon);
  await png(appSvg, 180, 180, "branding/icons/butterbox-apple-touch-icon-180.png");
  await png(appSvg, 192, 192, "branding/icons/butterbox-app-icon-192.png");
  await png(appSvg, 512, 512, "branding/icons/butterbox-app-icon-512.png");
  await png(maskableSvg, 512, 512, "branding/icons/butterbox-app-icon-maskable-512.png");
  await png(socialSvg, 1024, 1024, "branding/icons/butterbox-social-profile-1024.png");
  await png(socialSvg, 400, 400, "branding/icons/butterbox-social-profile-400.png");

  // Readability evidence: icon-only at 16/32/64/128 px, plus an enlarged
  // nearest-neighbour contact sheet so individual pixels can be reviewed.
  const sheet = [];
  for (const size of [16, 32, 64, 128]) {
    const file = `branding/logos/verification/icon-${size}px.png`;
    await png(faviconSvg, size, size, file);
    sheet.push({ size, file });
  }
  const cell = 256;
  const composites = [];
  for (const [n, { size, file }] of sheet.entries()) {
    for (const [row, bg] of [[0, "#FFFFFF"], [1, COLORS.charcoal]].entries()) {
      const tile = await sharp(out(file)).resize(cell, cell, { kernel: "nearest" }).toBuffer();
      composites.push({ input: { create: { width: cell, height: cell, channels: 4, background: bg[1] } }, left: n * (cell + 16), top: row * (cell + 16) });
      composites.push({ input: tile, left: n * (cell + 16), top: row * (cell + 16) });
    }
    void size;
  }
  await sharp({ create: { width: 4 * cell + 48, height: 2 * cell + 16, channels: 4, background: "#E6E6E6" } })
    .composite(composites).png().toFile(out("branding/logos/verification/icon-readability-sheet.png"));
  for (const w of [96, 128, 160, 240]) {
    await png(svgs["butterbox-logo-horizontal-light"], w, null, `branding/logos/verification/horizontal-${w}px.png`);
  }

  // Coastal artwork derivatives (BB-BRAND-004/005).
  const art = coastalArtworkSvg();
  write("branding/auth/butterbox-coastal-artwork.svg", art);
  for (const [w, h, name] of [[1600, 747, "desktop"], [800, 373, "mobile"]]) {
    const base = sharp(Buffer.from(art), { density: 144 }).resize(w, h, { fit: "cover", position: "bottom" });
    await base.clone().webp({ quality: 82 }).toFile(out(`branding/website/butterbox-coastal-artwork-${name}-${w}w.webp`));
    await base.clone().avif({ quality: 55 }).toFile(out(`branding/website/butterbox-coastal-artwork-${name}-${w}w.avif`));
  }
  // Open Graph preview: logo above the coastal artwork; no product screenshot implied.
  const ogLogo = horizontalLayout("color", COLORS.charcoal);
  const ogScale = 560 / ogLogo.width;
  const og = svgDoc({
    width: 1200, height: 630, title: "Butterbox",
    body: `<rect width="1200" height="630" fill="${ARTWORK.background}"/>` +
      `<g transform="translate(0 70)">${artworkInner({ background: false })}</g>` +
      `<g transform="translate(80 80) scale(${ogScale.toFixed(5)})">${ogLogo.body}</g>`,
  });
  write("branding/website/butterbox-og-image.svg", og);
  await png(og, 1200, 630, "branding/website/butterbox-og-image-1200x630.png");

  // Production copies consumed by the application.
  write("src/app/favicon.ico", favicon);
  write("src/app/icon.svg", faviconSvg);
  await png(appSvg, 180, 180, "src/app/apple-icon.png");
  await png(og, 1200, 630, "src/app/opengraph-image.png");
  for (const name of ["butterbox-logo-horizontal-light", "butterbox-logo-horizontal-dark", "butterbox-logo-stacked-light", "butterbox-icon"]) {
    write(`public/brand/${name}.svg`, svgs[name]);
  }
  await png(appSvg, 192, 192, "public/brand/icons/butterbox-app-icon-192.png");
  await png(appSvg, 512, 512, "public/brand/icons/butterbox-app-icon-512.png");
  await png(maskableSvg, 512, 512, "public/brand/icons/butterbox-app-icon-maskable-512.png");
  await png(svgs["butterbox-logo-horizontal-light"], 480, null, "public/brand/email/butterbox-logo-horizontal-light-480w.png");

  // Shared geometry for the React logo component.
  const lockup = horizontalLayout("color", COLORS.charcoal);
  const iconBox = iconLayout("color");
  write("src/components/brand/logo-geometry.ts", `// Generated by scripts/build-brand-assets.mjs from the traced Coastal Wave
// reference. Do not edit by hand; edit the generator and rebuild.
export const BRAND_COLORS = ${JSON.stringify(COLORS, null, 2)} as const;

export const ICON_PATHS = {
  silhouette: ${JSON.stringify(P.silhouette)},
  creamAndGold: ${JSON.stringify(P.creamAndGold)},
  gold: ${JSON.stringify(P.gold)},
} as const;

export const WORDMARK_PATH = ${JSON.stringify(P.wordmark)};

export const ICON_VIEWBOX = "${r(icon.x - PAD)} ${r(icon.y - PAD)} ${r(iconBox.width)} ${r(iconBox.height)}";
export const LOCKUP_VIEWBOX = "0 0 ${r(lockup.width)} ${r(lockup.height)}";
export const LOCKUP_ICON_TRANSFORM = "${lockup.iconTransform}";
export const LOCKUP_WORDMARK_TRANSFORM = "${lockup.wordTransform}";
`);
  write("src/components/brand/coastal-artwork.ts", `// Generated by scripts/build-brand-assets.mjs. Do not edit by hand.
export const COASTAL_ARTWORK = ${JSON.stringify(ARTWORK, null, 2)} as const;
`);
  console.log(JSON.stringify({ icon, word, hScale, variants: Object.keys(variants).length }, null, 1));
}

await main();
