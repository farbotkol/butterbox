# Butterbox Systems — Brand Guidelines

**Version:** 2.0 draft (Coastal Wave identity), supersedes the visual sections of
[`Butterbox_Systems_Brand_Guidelines_v1.pdf`](../Butterbox_Systems_Brand_Guidelines_v1.pdf).

**Approval status**

| Item | Status |
| --- | --- |
| Coastal Wave logo **design direction** ([reference](originals/butterbox-approved-logo.png)) | **Owner-approved** |
| Traced vector masters, variants, favicons and app icons in this folder | Draft. Awaiting the owner's final visual review |
| Exact colour values, typography and the rules in this guide | Draft. Awaiting owner review |
| Coastal café imagery | AI-generated photographic-style concepts supplied; draft only, with resolution and rights limits. See [Photography](#photography-direction) |

Nothing in this guide is a registered trademark, legal clearance or production
launch approval. Trademark, business-name and photography rights checks are
still outstanding (see v1 launch checklist).

---

## 1. Brand positioning

- **Name:** Butterbox leads in the product, app icon and everyday communication. The formal descriptor
  **Butterbox Systems** is used on proposals, invoices, legal and formal communications.
- **Tagline:** **Less admin. More good days.**
- **Product line:** Rosters, timesheets and teams. Sorted.
- **Audience:** independent cafés, restaurants and hospitality teams, and the owners, FOH/BOH managers,
  employees and payroll people who run them.
- **Personality:** approachable, calm, confident, modern, uncomplicated and distinctly Australian coastal.
  - Approachable, not careless: relaxed tone with dependable behaviour.
  - Calm and confident: the capable person who makes a chaotic Saturday shift run smoothly.
  - Modern and uncomplicated: show the useful outcome first, never enterprise jargon.
  - Coastal: sunshine and ocean, without resort or surf-school clichés.
- **Relationship:** Butterbox Systems is inspired by Butterbox Café at Long Reef. Do not suggest ownership,
  endorsement or affiliation unless agreed and documented.
- **Avoid** generic corporate enterprise styling: no navy-and-grey dashboards with stock handshakes,
  heavy gradients, glossy 3D or dense jargon.

### Voice

Write like a supportive, capable café manager: clear, warm, short and direct. Use sentence-case labels.

| Context | On-brand | Avoid |
| --- | --- | --- |
| Roster published | Your team's roster is live. | Roster dissemination completed. |
| Clock-in exception | We couldn't verify your location. Your time request is saved for manager review. | Geofence validation error 403. |
| Payroll | Approved timesheets are ready to export. | Payroll artefact generation succeeded. |

---

## 2. Colour

### Logo palette

These colours were sampled from opaque pixels of the owner-approved reference. They are the only colours used in
the logo masters.

| Name | HEX | RGB | Role |
| --- | --- | --- | --- |
| Sunshine gold | `#F0B150` | 240 177 80 | Upper B (sunshine), highlights, accent moments |
| Coastal teal | `#619A92` | 97 154 146 | Lower B (ocean), decorative surfaces, illustrations |
| Wave cream | `#F9F1E5` | 249 241 229 | Wave through the B, reversed wordmark, warm surfaces |
| Deep charcoal | `#18282B` | 24 40 43 | Wordmark, dark backgrounds, browser theme colour |

### Supporting product palette

These are existing application tokens in `src/app/globals.css`. They are retained so that the shipped UI keeps
its tested contrast.

| Name | HEX | CSS token | Role |
| --- | --- | --- | --- |
| Shell | `#FBF6EE` | `--brand-shell` | Warm panel behind sign-in artwork |
| Ocean | `#123F4A` | `--ocean` | Primary buttons, navigation, headings |
| Ink | `#173A40` | `--ink` | Body text |
| Muted | `#53696D` | `--muted` | Secondary text |
| Sea glass | `#83B9BC` | `--sea-glass` | Borders, dividers, decoration only |
| Soft sea | `#EDF5F4` | `--soft-sea` | Selected and info surfaces |
| Cloud | `#FAF9F6` | `--cloud` | App background |
| Artwork tints | `#D7E6E2`, `#A9CCC5`, `#4E847D` | n/a (artwork data) | Coastal hill and wave layers in illustrations |

The brand tokens are exposed as `--brand-gold`, `--brand-teal`, `--brand-cream`, `--brand-charcoal`,
`--brand-shell` and Tailwind `bg-brand-*` / `text-brand-*` utilities.

Brand gold is an accent. Do not use it as a functional warning colour; the semantic success, warning and error
tokens stay separate.

### Accessible contrast

The ratios below are WCAG 2.x relative-luminance contrast ratios, calculated from the HEX values above.

| Foreground | Background | Ratio | Use |
| --- | --- | --- | --- |
| Charcoal `#18282B` | White | 15.25:1 | ✅ Any text |
| Charcoal | Shell `#FBF6EE` | 14.17:1 | ✅ Any text |
| Charcoal | Cream `#F9F1E5` | 13.61:1 | ✅ Any text |
| Cream / White | Charcoal | 13.61 / 15.25:1 | ✅ Any text (dark mode, footers) |
| Charcoal | Gold `#F0B150` | 8.07:1 | ✅ Any text (accent badges, buttons on gold) |
| Gold | Charcoal | 8.07:1 | ✅ Any text |
| Charcoal | Teal `#619A92` | 4.75:1 | ✅ Normal text (AA) |
| Ink `#173A40` | White | 12.24:1 | ✅ Body text |
| Ocean `#123F4A` | White / Shell / Soft sea | 11.44 / 10.63 / 10.33:1 | ✅ Any text, primary buttons |
| Muted `#53696D` | White / Shell | 5.82 / 5.41:1 | ✅ Secondary text (AA) |
| Teal | White | 3.21:1 | ⚠️ Large text (≥24 px, or ≥18.66 px bold) and graphics only |
| White | Teal | 3.21:1 | ⚠️ Large text and icons only |
| Cream | Teal | 2.86:1 | ❌ Not for text |
| Gold | White | 1.89:1 | ❌ Never for text or essential UI on white |
| Cream | Gold | 1.69:1 | ❌ Never for text |

Rules:

- Body and UI text uses charcoal, ink, ocean or muted.
- Teal and gold carry meaning only in logo artwork, illustrations or with a text label. Never use colour alone for
  status.
- The full-colour logo meets graphic contrast (≥3:1) on white, shell and cream through its charcoal wordmark and
  teal silhouette. On charcoal, use the dark variant (cream wordmark).

---

## 3. Typography

| Use | Typeface | Weights | Source / licence |
| --- | --- | --- | --- |
| Headings, display, numbers in cards | **Poppins** | 600 SemiBold, 700 Bold | Google Fonts, SIL Open Font License 1.1, loaded via `next/font/google` |
| Body copy and product UI | **Inter** | 400, 500, 600 | Google Fonts, SIL Open Font License 1.1, loaded via `next/font/google` |
| Logo wordmark | **Artwork only** | n/a | Traced from the approved reference |

- The **Butterbox** wordmark is artwork. Never retype it in Poppins, Inter or any other font. Always use the
  logo files or the `BrandLockup` component.
- Use sentence case for headings and labels. Reserve letter-spaced capitals for small eyebrows and descriptors (for
  example `SYSTEMS`, `TODAY`).
- Use a restrained scale: page title 28–36 px Poppins 600, section 18–20 px Poppins 600, body 15–16 px Inter 400,
  helper text 13–14 px Inter in muted.

---

## 4. Logo

### Concept

A stylised capital **B** with a flowing ocean wave. The gold upper bowl is sunshine, the teal lower bowl is the
ocean and a cream wave flows diagonally through the letter. It sits with a bold, rounded **Butterbox** wordmark in
deep charcoal.

### Variants

All masters are clean SVG paths traced from the reference. They contain no embedded raster.

| Variant | File | Use |
| --- | --- | --- |
| Primary stacked, light | `logos/svg/butterbox-logo-stacked-light.svg` | Presentations, signage, splash, square layouts |
| Primary horizontal, light | `logos/svg/butterbox-logo-horizontal-light.svg` | App navigation, sign-in, email header, documents |
| Stacked / horizontal, dark | `logos/svg/butterbox-logo-*-dark.svg` | Charcoal or deep-ocean backgrounds (cream wordmark) |
| Single colour dark | `logos/svg/butterbox-logo-*-mono-dark.svg`, `butterbox-icon-mono-dark.svg` | One-colour print, fax, embossing, light photos |
| Single colour white | `logos/svg/butterbox-logo-*-mono-white.svg`, `butterbox-icon-mono-white.svg` | Dark photos and dark single-colour surfaces |
| Icon only | `logos/svg/butterbox-icon.svg` | Avatars, compact navigation, loading marks |
| Favicon | `icons/butterbox-favicon.svg`, `icons/favicon.ico` (16/32/48), `icons/butterbox-favicon-{16,32,48}.png` | Browser tabs |
| App / PWA icon | `icons/butterbox-app-icon.svg`, `-192.png`, `-512.png`, `-maskable-512.png`, `apple-touch-icon-180.png` | Home screen, PWA manifest, iOS |
| Social profile | `icons/butterbox-social-profile.svg`, `-1024.png`, `-400.png` | Square social avatars |

PNG derivatives with transparent backgrounds are in `logos/png/`. In the application, always render the logo
through `src/components/brand-lockup.tsx` (`BrandLockup`, `BrandMark`). Do not add new copies of the paths.

In the monochrome versions the cream wave is knocked out (transparent), so the background shows through the wave.

### Clear space

Keep clear space on all sides equal to **¼ of the icon height** (marked `x` below). No text, edge or other graphic
may enter this zone. For the horizontal lockup, measure `x` from the B's height.

```
   x
 x [B  Butterbox] x
   x
```

### Minimum sizes

| Variant | Minimum digital size | Minimum print |
| --- | --- | --- |
| Horizontal lockup | 120 px wide | 30 mm wide |
| Stacked lockup | 80 px wide | 20 mm wide |
| Icon only | 16 px (favicon); 24 px preferred in UI | 6 mm |

Verification renders at 16, 32, 64 and 128 px are in `logos/verification/`. The B and its wave are recognisable at
16 px and clear from 32 px. The wordmark is legible from about 120 px lockup width.

### Backgrounds

- **Light:** white, cloud `#FAF9F6`, shell `#FBF6EE`, cream `#F9F1E5`, soft sea. Use the light (colour) variant.
- **Dark:** charcoal `#18282B`, ocean `#123F4A`. Use the dark variant (cream wordmark).
- **Photography:** use the mono white or mono dark variant on a calm, low-detail area of the image. If needed, add a
  solid or 60 %+ scrim behind the logo. Never place the colour logo over busy photography.
- **Mid-tone teal or gold surfaces:** use a mono variant. Do not place the colour logo on teal or gold, because its
  bowls will disappear.

### Favicon and app icon

- The favicon uses the icon at 96 % of a transparent canvas, so it is as large as possible in browser tabs.
- App and Apple touch icons centre the icon at 72 % on a white square. Platforms apply their own corner rounding;
  do not pre-round the PNG.
- The maskable PWA icon keeps the icon within the central 56 % so it survives circular and squircle masks.
- The browser and PWA theme colour is charcoal `#18282B`; the manifest background is white.
- Do not add the wordmark, tagline, gradients or shadows to small icons.

### Incorrect use

Do not:

1. Retype, re-letter or change the font of the wordmark.
2. Stretch, squash, rotate, skew or change the proportions between B and wordmark.
3. Recolour the parts (for example a teal top or gold bottom), or swap in other blues and yellows.
4. Add gradients, bevels, glows, outlines or drop shadows.
5. Place the colour logo on gold, teal, busy photographs or low-contrast backgrounds.
6. Put the colour wordmark (charcoal) on charcoal or ocean. Use the dark variant instead.
7. Crop the B, remove the wave or fill the wave with a different colour.
8. Add "Systems", the tagline or other text inside the clear space as part of a new lockup without approval.
9. Embed the raster reference inside an SVG and present it as a vector master.
10. Recreate the mark with emoji, stock wave icons or AI-regenerated variations.

---

## 5. Imagery

### Photography direction

- Real Australian coastal café life, such as Northern Beaches headlands, surf and coastal vegetation.
- Teams in action: opening shifts, espresso machines, handovers, natural timber and daylight.
- People first: honest working moments, not polished corporate poses.
- Warm early or late sunlight, with sea-glass, teal and sand tones. Subtle grain is acceptable.
- Compose for overlays: keep a calm area (sky, wall, sea) on one side for text, with a desktop and a mobile crop.
- Use genuine photography only with a documented licence or permission. Never present generated scenes as photos of
  a real venue.

**Status:** The five historical concept files (`concept-team`, `concept-roster`, `concept-attendance`,
`concept-confidence`, `concept-board`) are still missing. A different set of AI-generated, photographic-style
coastal café illustrations was supplied on 2026-11-03. The
[selection summary](website/CAFE_IMAGERY_SELECTION.md) and `website/cafe-concepts/` contain low-resolution
review drafts, **not real photographs or product screenshots**. The owner approved the proposed visual
selection on 2026-11-03; applicable account terms, third-party rights and publication clearance remain
unverified. Do not publish them as cleared marketing assets. Product surfaces continue to use the vector
artwork below.

### Illustration

- Use flat, layered vector shapes in the logo palette and artwork tints: sun gold, rolling teal hills and cream
  wave lines. See `auth/butterbox-coastal-artwork.svg` and `src/components/coastal-illustration.tsx`.
- Use soft curves, no outlines, no gradients or texture, and no beach clichés (palms, surfboards, cocktails).
- Decorative artwork is `aria-hidden` and must never sit behind form fields or body text.

### Iconography

- Use [Lucide](https://lucide.dev) outline icons (already a dependency) at 1.5–2 px stroke with rounded caps.
- Choose purposeful icons such as calendar, clock, team, location and notifications. Avoid decorative beach symbols
  in dense operational screens.
- Always pair status icons with text.

---

## 6. Governance

- **Masters:** `branding/logos/source/traced-geometry.json`, generated by `branding/tools/trace_reference.py` from the
  reference. All variants and app copies are generated by `scripts/build-brand-assets.mjs`. Never hand-edit derived
  files; change the generator and rebuild.
- **Catalogue:** every asset is recorded in `branding/ASSET_INDEX.csv` with its parent, version, approval state and
  SHA-256.
- **Changes:** need design review by the product owner and an update to this guide and the catalogue.
- **Outstanding before launch:** owner final visual review of the vectors, an optional professional redraw of the
  wordmark, trademark and business-name searches, and licensed photography.

### Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | Oct 2026 | PDF guide: positioning, concept direction, ocean/sea-glass/sand/sun palette (concept) |
| 2.0 draft | Nov 2026 | Coastal Wave identity from the owner-approved reference: traced vector masters, exact logo palette, logo system, contrast table |
