#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = "branding/website/cafe-concepts";
const sourceDirectory = "branding/originals/website_imagery/originals";

const sources = {
  "sheet-01": {
    file: `${sourceDirectory}/generated_contact_sheet_01.png`,
    width: 1536,
    height: 1024,
    sha256: "94d770bfd1e09caf4d0ff10d3a002ab16b5dbe4b2ba3ec9cddbbd76c8aa5ec24",
  },
  "sheet-02": {
    file: `${sourceDirectory}/generated_contact_sheet_02.png`,
    width: 1672,
    height: 941,
    sha256: "74f4fd2f054459ef2af569660b99a298a5d08a9d5919204271d3e3a86acfb1c3",
  },
};

// Rectangles exclude the contact-sheet gutters and neighbouring scenes.
const sets = [
  {
    id: "hero-wide",
    scene: "01_coastal_cafe_hero",
    source: "sheet-01",
    rect: { left: 1, top: 1, width: 859, height: 377 },
    ratio: [16, 7],
    position: "centre",
    widths: [320, 640, 848],
    sizes: "(max-width: 700px) 100vw, (max-width: 1100px) 52vw, 620px",
    alt: "AI-generated illustration of a café worker holding a coffee.",
    label: "Hero: seaside café",
  },
  {
    id: "hero-portrait",
    scene: "01_coastal_cafe_hero",
    source: "sheet-01",
    rect: { left: 1, top: 1, width: 859, height: 377 },
    ratio: [4, 5],
    position: "east",
    widths: [160, 240, 296],
    sizes: "296px",
    alt: "AI-generated illustration of a café worker holding a coffee.",
    label: "Hero: phone crop",
  },
  {
    id: "team-wide",
    scene: "02_team_roster_laptop",
    source: "sheet-01",
    rect: { left: 868, top: 1, width: 667, height: 377 },
    ratio: [3, 2],
    position: "centre",
    widths: [300, 450, 564],
    sizes: "(max-width: 700px) 90vw, 380px",
    alt: "AI-generated illustration of three café staff looking at a laptop together.",
    label: "Team and rostering: laptop",
  },
  {
    id: "team-square",
    scene: "09_tablet_team_collaboration",
    source: "sheet-02",
    rect: { left: 494, top: 1, width: 400, height: 475 },
    ratio: [1, 1],
    position: "north",
    widths: [192, 288, 384],
    sizes: "(max-width: 700px) 90vw, 380px",
    alt: "AI-generated illustration of café staff looking at a tablet together.",
    label: "Team collaboration: tablet",
  },
  {
    id: "operations-portrait",
    scene: "11_warm_coffee_bar",
    source: "sheet-02",
    rect: { left: 1296, top: 1, width: 375, height: 475 },
    ratio: [4, 5],
    position: "centre",
    widths: [184, 276, 368],
    sizes: "(max-width: 700px) 90vw, 368px",
    alt: "AI-generated illustration of a warmly lit café coffee bar with a barista.",
    label: "Café operations: coffee bar",
  },
  {
    id: "terrace-wide",
    scene: "08_seaside_cafe_seating",
    source: "sheet-02",
    rect: { left: 1, top: 1, width: 485, height: 475 },
    ratio: [4, 3],
    position: "centre",
    widths: [240, 360, 480],
    sizes: "(max-width: 700px) 90vw, 380px",
    alt: "AI-generated illustration of an open-air café terrace overlooking a coast.",
    label: "Supporting atmosphere: terrace",
  },
  {
    id: "service-portrait",
    scene: "14_barista_takeaway",
    source: "sheet-02",
    rect: { left: 902, top: 482, width: 386, height: 458 },
    ratio: [4, 5],
    position: "centre",
    widths: [180, 264, 360],
    sizes: "(max-width: 700px) 90vw, 360px",
    alt: "AI-generated illustration of a barista passing a takeaway coffee to a guest.",
    label: "Supporting service: takeaway coffee",
  },
];

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const filename = (set, width, extension) => `butterbox-${set.id}-${width}w.${extension}`;
const heightFor = (set, width) => Math.round(width * set.ratio[1] / set.ratio[0]);

function srcset(set, extension) {
  return set.widths.map((width) => `${filename(set, width, extension)} ${width}w`).join(", ");
}

function sourceTag(set, extension, media = "") {
  const width = set.widths.at(-1);
  return `  <source${media} type="image/${extension}" srcset="${srcset(set, extension)}" sizes="${set.sizes}" width="${width}" height="${heightFor(set, width)}">`;
}

function picture(set, { mobile, eager = false } = {}) {
  const width = set.widths.at(-1);
  const mobileWidth = mobile?.widths.at(-1);
  const sourcesForMobile = mobile
    ? [
        ...["avif", "webp"].map((format) => sourceTag(mobile, format, ' media="(max-width: 700px)"')),
        `  <source media="(max-width: 700px)" type="image/jpeg" srcset="${filename(mobile, mobileWidth, "jpg")}" width="${mobileWidth}" height="${heightFor(mobile, mobileWidth)}">`,
      ]
    : [];
  return [
    "<picture>",
    ...sourcesForMobile,
    sourceTag(set, "avif"),
    sourceTag(set, "webp"),
    `  <img src="${filename(set, width, "jpg")}" width="${width}" height="${heightFor(set, width)}" alt="${set.alt}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`,
    "</picture>",
  ].join("\n");
}

function previewHtml() {
  const byId = Object.fromEntries(sets.map((set) => [set.id, set]));
  const cards = ["team-wide", "team-square", "operations-portrait", "terrace-wide", "service-portrait"]
    .map((id) => {
      const set = byId[id];
      return `<figure>
${picture(set)}
  <figcaption><strong>${set.label}</strong><br>Largest prepared crop: ${set.widths.at(-1)} × ${heightFor(set, set.widths.at(-1))} px.</figcaption>
</figure>`;
    }).join("\n");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Butterbox coastal café imagery — internal review</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #FBF6EE; color: #26343A; font: 1rem/1.5 system-ui, sans-serif; }
  .wrap { max-width: 1200px; margin: auto; padding: 1.5rem; }
  header { border-bottom: 1px solid #D7E6E2; }
  header strong { font-size: 1.35rem; }
  h1 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.08; }
  h2 { font-size: 1.6rem; }
  .notice { padding: 1rem; border-left: 4px solid #2F7F86; background: #fff; }
  .hero { display: grid; grid-template-columns: 0.9fr 1.1fr; align-items: center; gap: 2rem; }
  figure { margin: 0; }
  figure img { display: block; width: 100%; max-width: 100%; height: auto; border-radius: .5rem; }
  figcaption { margin-top: .5rem; color: #26343A; font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 2rem; align-items: start; }
  .grid img { width: auto; max-width: 100%; }
  @media (max-width: 700px) { .hero { grid-template-columns: 1fr; } .hero img { max-width: 296px; } }
</style>
</head>
<body>
<header><div class="wrap"><strong>Butterbox</strong> · Coastal Wave image review</div></header>
<main class="wrap">
  <p class="notice"><strong>Internal concept review only.</strong> These are AI-generated illustrations, not real photographs, real venues or product screenshots. The crops are low-resolution drafts; rights and final owner approval are pending.</p>
  <section class="hero" aria-labelledby="hero-heading">
    <div><h1 id="hero-heading">Less admin. More good days.</h1>
    <p>Coastal hospitality, calm teamwork and a little more room for the moments that matter.</p>
    <p>The headline sits on a solid cream background; it does not rely on contrast over the image.</p></div>
    <figure>
${picture(byId["hero-wide"], { mobile: byId["hero-portrait"], eager: true })}
      <figcaption><strong>Hero concept.</strong> Largest wide crop: 848 × 371 px; phone crop: 296 × 370 px. Both are smaller than the requested production master.</figcaption>
    </figure>
  </section>
  <section aria-labelledby="selection-heading">
    <h2 id="selection-heading">Supporting image selection</h2>
    <p>These images illustrate atmosphere and coordination; no screen depicts the actual Butterbox product.</p>
    <div class="grid">
${cards}
    </div>
  </section>
</main>
</body>
</html>
`;
}

async function main() {
  const sourceData = {};
  for (const [id, source] of Object.entries(sources)) {
    const data = await readFile(join(root, source.file));
    const metadata = await sharp(data).metadata();
    if (digest(data) !== source.sha256 || metadata.width !== source.width || metadata.height !== source.height) {
      throw new Error(`Source ${source.file} differs from the verified original; review its provenance before rebuilding.`);
    }
    sourceData[id] = data;
  }

  await mkdir(join(root, outputDirectory), { recursive: true });
  const files = [];
  for (const set of sets) {
    for (const width of set.widths) {
      const height = heightFor(set, width);
      if (width > set.rect.width || height > set.rect.height) {
        throw new Error(`${set.id} ${width} × ${height} would enlarge its source crop.`);
      }
      const resized = sharp(sourceData[set.source]).extract(set.rect).resize(width, height, {
        fit: "cover",
        position: set.position,
        withoutEnlargement: true,
      });
      const formats = [
        ["avif", "avif", { quality: 60, effort: 6 }],
        ["webp", "webp", { quality: 82 }],
      ];
      if (width === set.widths.at(-1)) formats.push(["jpg", "jpeg", { quality: 82, mozjpeg: true }]);
      for (const [extension, format, options] of formats) {
        const buffer = await resized.clone()[format](options).toBuffer();
        const metadata = await sharp(buffer).metadata();
        if (metadata.width !== width || metadata.height !== height) {
          throw new Error(`Unexpected output dimensions for ${set.id} ${width}w ${format}.`);
        }
        const file = `${outputDirectory}/${filename(set, width, extension)}`;
        await writeFile(join(root, file), buffer);
        files.push({ set: set.id, file, format, width, height, bytes: buffer.length, sha256: digest(buffer) });
      }
    }
  }
  const manifest = {
    story: "BB-BRAND-004",
    status: "Internal AI-generated illustration review only; not approved for publication",
    provenance: "Owner-supplied contact sheets, reported generated with OpenAI ChatGPT image generation on 2026-11-03. Exact model version, full generation prompt and applicable account terms are unverified.",
    sources,
    sets,
    files,
  };
  await writeFile(join(root, outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(root, outputDirectory, "preview.html"), previewHtml());
  console.log(JSON.stringify({ outputs: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }));
}

await main();
