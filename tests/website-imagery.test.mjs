import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = path.join(root, "branding/website/cafe-concepts/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

test("the review library retains the identified, unmodified contact-sheet sources", async () => {
  assert.match(manifest.status, /not approved for publication/i);
  assert.match(manifest.provenance, /unverified/i);
  assert.equal(Object.keys(manifest.sources).length, 2);
  for (const source of Object.values(manifest.sources)) {
    const data = await readFile(path.join(root, source.file));
    const metadata = await sharp(data).metadata();
    assert.equal(sha256(data), source.sha256);
    assert.equal(metadata.width, source.width);
    assert.equal(metadata.height, source.height);
    assert.equal(metadata.format, "png");
  }
});

test("every responsive file is decodable, fingerprinted, correctly sized and not enlarged", async () => {
  assert.equal(manifest.sets.length, 7);
  assert.equal(manifest.files.length, 49);
  assert.equal(new Set(manifest.files.map((file) => file.file)).size, manifest.files.length);
  for (const set of manifest.sets) {
    const source = manifest.sources[set.source];
    assert.ok(source, set.id);
    assert.ok(set.rect.left >= 0 && set.rect.top >= 0, set.id);
    assert.ok(set.rect.left + set.rect.width <= source.width, set.id);
    assert.ok(set.rect.top + set.rect.height <= source.height, set.id);
    assert.match(set.alt, /^AI-generated illustration/);

    const files = manifest.files.filter((file) => file.set === set.id);
    assert.equal(files.length, set.widths.length * 2 + 1, set.id);
    for (const width of set.widths) {
      assert.deepEqual(files.filter((file) => file.width === width).map((file) => file.format).sort(),
        width === set.widths.at(-1) ? ["avif", "jpeg", "webp"] : ["avif", "webp"], set.id);
    }

    for (const file of files) {
      const data = await readFile(path.join(root, file.file));
      const metadata = await sharp(data).metadata();
      assert.equal(sha256(data), file.sha256, file.file);
      assert.equal(data.length, file.bytes, file.file);
      assert.ok(file.bytes <= 100_000, `${file.file}: ${file.bytes} bytes`);
      assert.equal(metadata.width, file.width, file.file);
      assert.equal(metadata.height, file.height, file.file);
      assert.equal(file.height, Math.round(file.width * set.ratio[1] / set.ratio[0]), file.file);
      assert.ok(Math.max(file.width / set.rect.width, file.height / set.rect.height) <= 1, file.file);
      assert.equal(metadata.format, file.format === "avif" ? "heif" : file.format, file.file);
      if (file.format === "avif") assert.equal(metadata.compression, "av1", file.file);
      assert.ok(!metadata.exif && !metadata.iptc && !metadata.xmp && !metadata.icc, file.file);
    }
  }
});

test("largest outputs retain source-crop detail within a measured compression error budget", async () => {
  for (const set of manifest.sets) {
    const source = await readFile(path.join(root, manifest.sources[set.source].file));
    const files = manifest.files.filter((file) => file.set === set.id && file.width === set.widths.at(-1));
    for (const file of files) {
      const reference = await sharp(source).extract(set.rect)
        .resize(file.width, file.height, { fit: "cover", position: set.position })
        .toColourspace("srgb").removeAlpha().raw().toBuffer();
      const encoded = await sharp(path.join(root, file.file)).toColourspace("srgb").removeAlpha().raw().toBuffer();
      assert.equal(encoded.length, reference.length, file.file);
      let totalError = 0;
      for (let i = 0; i < reference.length; i += 1) totalError += Math.abs(reference[i] - encoded[i]);
      const meanError = totalError / reference.length;
      assert.ok(meanError <= 6, `${file.file}: mean absolute channel error ${meanError.toFixed(2)}/255`);
    }
  }
});

test("the asset catalogue records source and review fingerprints without claiming clearance", async () => {
  const index = (await readFile(path.join(root, "branding/ASSET_INDEX.csv"), "utf8")).split(/\r?\n/);
  const paths = [
    ...Object.values(manifest.sources).map((source) => source.file),
    ...manifest.files.map((file) => file.file),
    "branding/website/cafe-concepts/manifest.json",
    "branding/website/cafe-concepts/preview.html",
  ];
  for (const file of paths) {
    const rows = index.filter((line) => line.includes(`,${file},`));
    assert.equal(rows.length, 1, file);
    assert.ok(rows[0].includes(sha256(await readFile(path.join(root, file)))), file);
    assert.match(rows[0], /rights.*unverified/i, file);
    assert.match(rows[0], /owner visual approval pending/i, file);
  }
});
