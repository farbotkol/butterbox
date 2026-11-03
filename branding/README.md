# Butterbox — Branding and website imagery

**Status:** Coastal Wave identity. The owner approved the **design direction**. The traced vector logo system,
icons, artwork and [brand guidelines](BRAND_GUIDELINES.md) are **drafts awaiting the owner's final visual
review**. Rights and trademark clearance remain pending.
**Branch:** `copilot/finish-roadmap-for-app`

## Approved reference (source of truth)

| Item | Value |
| --- | --- |
| File | [`originals/butterbox-approved-logo.png`](originals/butterbox-approved-logo.png), retained unchanged |
| Image | 1254 × 1254 RGBA PNG, transparent background |
| SHA-256 | `9b0880e39d39f2ae21f0125de9e0b22656b7f58385d878c4fd23b3015153fe15` |
| Approval | Product owner selected the Coastal Wave concept as the official **design direction** |
| Not approved yet | Final production vectors, exact colour values and the guide details below |

**Name discrepancy:** the owner's message named the file
`branding/originals/butterbox-coastal-wave-approved-reference.png` and described it as committed. The file
actually supplied was untracked and named `butterbox-approved-logo.png`. After visual inspection confirmed it
matches the described concept (gold upper B, teal lower B, cream diagonal wave, charcoal "Butterbox"
wordmark), it was committed unchanged under its supplied name in `677a33e` rather than renamed.

## Folder structure

| Folder | Contents |
| --- | --- |
| `originals/` | Owner-supplied reference (never modified) |
| `tools/` | `trace_reference.py`: reproducible potrace vectorisation of the reference |
| `logos/source/` | `traced-geometry.json`: vector master path data in reference-pixel coordinates |
| `logos/svg/` | 11 SVG masters: stacked and horizontal in light, dark, mono-dark and mono-white, plus the icon in colour, mono-dark and mono-white |
| `logos/png/` | Transparent PNG derivatives (stacked 1200 w, horizontal 1600 w and 480 w, icon 1024 w) |
| `logos/verification/` | Small-size rendering evidence (icon 16/32/64/128 px, horizontal lockup 96–240 px) |
| `icons/` | Favicon SVG/ICO/PNG 16–48, app icon 192/512, maskable 512, apple-touch 180, social profile 400/1024 |
| `auth/` | Coastal sun, hill and wave vector artwork used on sign-in and the dashboard |
| `website/` | Artwork WebP/AVIF (desktop 1600 w, mobile 800 w) and Open Graph image 1200 × 630 |

Production copies live in `public/brand/` (served logos, PWA icons and the prepared email logo) and in
`src/app/` (`favicon.ico`, `icon.svg`, `apple-icon.png` and `opengraph-image.png` use the Next.js file
conventions). The app renders the logo only through `src/components/brand-lockup.tsx`, which uses the
generated `src/components/brand/logo-geometry.ts`. Do not paste logo paths elsewhere.

## How the vectors were made

The vectors are not an embedded raster. Each pixel of the reference is supersampled ×4 (Lanczos) and
classified to the nearest of the four sampled logo colours. Each colour layer is then traced with
**potrace 1.16** into absolute cubic Bézier paths. The colour icon stacks a teal silhouette, then cream, then
gold, so no anti-alias seams appear. Monochrome variants knock the cream wave out to transparency.

Regenerate everything (requires `potrace`, Python with Pillow/NumPy and the repository's `sharp`):

```sh
python3 branding/tools/trace_reference.py   # reference → logos/source/traced-geometry.json
node scripts/build-brand-assets.mjs          # geometry → all SVG/PNG/ICO/WebP/AVIF, public/, src/app, TS data
```

Then update the SHA-256 values in `ASSET_INDEX.csv` and rerun the integrity check below.

### Fidelity and rendering evidence (2026-11)

- **Fidelity:** the traced vector was re-rendered at reference coordinates and compared per colour by
  intersection over union. Results: gold 0.9958, teal 0.9991, cream 0.9960 and charcoal wordmark 0.9946. Only
  905 of 269,189 solid pixels differ, all on 1 px anti-aliased edges. A side-by-side visual comparison
  showed no visible difference.
- **Small sizes:** the icon is recognisable at 16 px and clear from 32 px. The horizontal wordmark is legible
  from about 120 px wide, which is the documented minimum (see `logos/verification/`).
- **SVG integrity:** all SVGs parse as XML and use only `path`, `g`, `title` and (for app-icon backgrounds) `rect` elements with solid fills. They contain no
  `<image>`, script, external reference, gradient or filter.
- **Contrast:** see the table in [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md#accessible-contrast).

## Inventory and approval boundary

[ASSET_INDEX.csv](ASSET_INDEX.csv) is the authoritative path-by-path catalogue. Paths are relative to the
repository root. The current catalogue has **88 records**:

- 1 approved: the reference, for design direction only.
- 75 draft: the Coastal Wave derivatives and app copies, awaiting the owner's final visual review.
- 10 unreviewed: 5 missing concept photos and 5 scaffold SVGs.
- 2 retired: `public/butterbox_logo.svg` and `public/icon.svg`, the superseded pre-Coastal Wave drafts.

Version identifies the source-changing commit (`git-677a33e`) or `brand-v2-draft` for app integration files.
SHA-256 binds each present entry to the inspected bytes. Any source change requires a catalogue update.

Each entry records intended use, source/derivative relationship, custody,
provenance, rights/permission status, reviewer and approval evidence.
**Repository possession, an app reference or an agent review does not establish
copyright ownership, redistribution permission or final owner approval.**
The product owner is the library custodian, not an asserted rights holder.
Unknown provenance or rights are explicitly unverified rather than silently
assumed licensed.

The typography entry inventories configuration, not font binary ownership or
an archived font distribution. Dependency-provided icons/fonts and generated
build caches are not new standalone library assets. Record and retain the
specific upstream license/version if extracting or redistributing them.

## Catalogued concept references -- all missing

These are references from the previous catalogue, **not available downloads**.
No source binary, generation log, rights grant or approval is present.

| Catalogue ID / expected file | Intended use | Presence / approval |
| --- | --- | --- |
| concept-board / `butterbox_coastal_brand_system_board.png` | Identity reference, logo concepts and visual direction | Missing / unreviewed |
| concept-team / `sunny_coastal_cafe_team_collaboration.png` | Proposed homepage team imagery | Missing / unreviewed |
| concept-roster / `warm_cafe_team_roster_dashboard.png` | Illustrative roster marketing image; **not** a screenshot | Missing / unreviewed |
| concept-attendance / `coastal_attendance_app_showcase.png` | Illustrative attendance/mobile marketing image | Missing / unreviewed |
| concept-confidence / `coastal_cafe_confidence.png` | Proposed benefits/lifestyle imagery | Missing / unreviewed |

These photos are still missing, so BB-BRAND-004 homepage **photography** is blocked. The WebP/AVIF files in
`website/` are derivatives of the original vector coastal artwork, not photographs. No campaign creative or
approved marketing release is claimed.

On 2026-11-03 the owner authorised the generated coastal hospitality imagery as the creative direction for the
internal Showcase. A search of the repository, all Git history, the operator's Mac (Spotlight, Downloads,
Desktop, Pictures) and agent session files found **none** of the five files above, so their generator, date,
prompt and usage terms cannot be documented. They remain `missing`; do not recreate them under these names.

## Homepage imagery library (BB-BRAND-004, internal)

`website/homepage/` is a reusable, responsive imagery library built only from the original repository vector
artwork. Rebuild it with `node scripts/build-homepage-imagery.mjs`; the output is byte-for-byte deterministic and
the script never modifies `auth/butterbox-coastal-artwork.svg` or other brand assets. No public homepage is
deployed.

| Set | Aspect / widths | Use | Alt text |
| --- | --- | --- | --- |
| `hero-wide` | 16:7 — 640–2560 w | Tablet/desktop hero background | `""` (decorative) |
| `hero-portrait` | 4:5 — 480/720/960 w | Phone hero via `<picture media>`; cropped to keep the sun | `""` (decorative) |
| `section-band` | 4:1 — 800/1600/2400 w | Decorative section divider | `""` (decorative) |
| `feature-tile` | 1:1 — 480/960 w | Supporting tile with the wordmark | "Butterbox logo above a calm coastal sunrise illustration" |

Every size is supplied as AVIF and WebP. `manifest.json` lists dimensions, bytes, SHA-256, `sizes` hints and alt
text; `preview.html` is the verification harness. On phones, stack text above the hero instead of overlaying
it. All files are **illustrations** — never present them as photographs or application screenshots.

## Contributing and storing assets

1. Check the inventory before adding an asset. Preserve original sources;
   never replace a missing reference with an unrelated image under its name.
   Use descriptive new names such as `butterbox_<purpose>_<variant>_v001.ext`.
   Preserve existing paths while dependants still use them.
2. Keep owner-supplied originals in `branding/originals/`, editable masters and
   generated variants in the folders described above, and generate production
   copies with `scripts/build-brand-assets.mjs`. Publish only web derivatives to
   `public/`; everything there is publicly retrievable.
3. Add a catalogue row for every source and derivative. Include a parent ID,
   actual version, SHA-256, intended placement/size, creator or upstream
   provenance, license/permission reference, reviewer and status. Mark an
   expected but absent item `missing` with digest `missing`; never `approved`.
4. Do not commit credentials, customer/employee data, private conversations,
   signed releases or identifying photo metadata. Use synthetic UI captures.
   Strip unnecessary EXIF/GPS data; inspect SVG for scripts, external
   references and embedded content. Keep sensitive permission evidence in
   an authorized private system and reference only a non-sensitive identifier.
   AI artwork needs a recorded generator/source date and applicable usage
   permission; the word "generated" alone is not rights clearance.
5. Optimize images without overwriting masters. Record the parent, export
   settings, dimensions, format and changed hash. Check alt text, crop,
   contrast, mobile sizes and actual rendered placement before release.

## Usage notes

- The missing references were described as **AI-generated visual concepts**,
  not screen-verified application screenshots; that description is catalogue
  provenance, not independent verification of unavailable files.
- The board was described as rasterised draft logo explorations; approve and rebuild any final logo as a standalone vector rather than cropping a production logo from the moodboard.
- Use descriptive alt text for informative photography and empty alt text for decorative imagery.
- Treat logo, UI and typography details in the concept imagery as proposed styling, not established product behavior or third-party validation.
- Do not place personal employee information or production application data in website assets.

## Release, replacement and withdrawal

- Presence and approval are independent. `missing` means unavailable;
  `present` means bytes verified. Approval begins at `unreviewed`, proceeds
  to `draft` during design review and becomes `approved` only with an explicit
  product-owner record identifying the exact asset version/hash and permitted
  use. Use `retired` for an explicitly withdrawn version. Record the real
  reviewer, date and evidence identifier; an inventory check cannot approve art.
- Rights/privacy review and intended-use approval are release prerequisites.
  Final logo decisions require the owner. Never promote current drafts,
  concepts or third-party scaffold marks into a new approved marketing release
  merely because they render in development. Existing runtime sources are
  unchanged by this documentation.
- Release only the reviewed derivative and its matching source/evidence
  references in a normal reviewed commit. Record the release commit and
  placements; retain required attribution/license notices. Campaign spending,
  provider uploads and deployment require their own authorization.
- For replacement, create a new version, inspect every reference (including
  metadata, manifest, authentication, print and external placements), verify
  accessibility/size and update references plus inventory together. Retain the
  old source/version in history, mark it retired with its replacement ID,
  reason and approval reference, and retain a tested rollback target.
  Do not rewrite history or delete uncommitted/source files to tidy the library.

## Reproduce the presence and integrity check

Run from the repository root. Missing items must remain explicitly absent;
when supplied, update their row and provenance rather than suppressing failure.

```sh
python3 - <<'PY'
import csv
import hashlib
from pathlib import Path

root = Path.cwd().resolve()
with (root / "branding/ASSET_INDEX.csv").open(newline="", encoding="utf-8") as handle:
    rows = list(csv.DictReader(handle))
assert len({row["ID"] for row in rows}) == len(rows)
assert len({row["Path"] for row in rows}) == len(rows)
ids = {row["ID"] for row in rows}
for row in rows:
    assert all(value for key, value in row.items() if key != "Parent"), row["ID"]
    path = (root / row["Path"]).resolve()
    assert path.is_relative_to(root), row["ID"]
    assert not row["Parent"] or row["Parent"] in ids, row["ID"]
    if row["Presence"] == "missing":
        assert not path.exists() and row["SHA256"] == "missing", row["ID"]
        assert row["Approval"] != "approved", row["ID"]
    else:
        assert row["Presence"] == "present" and path.is_file(), row["ID"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row["SHA256"], row["ID"]
print(f"Verified {len(rows)} catalogue records")
PY
```
