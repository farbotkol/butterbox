# BB-BRAND-004 — Homepage photography brief

**Status:** Owner brief, received 2026-11-03. No images have been produced from it yet; this repository has no
image-generation capability, and none of the earlier generated concepts were found. Do not mark BB-BRAND-004
Done until delivered files meet the acceptance checklist below.

Tagline context: **Butterbox — Less admin. More good days.**

## Creative direction (owner brief)

Use the approved Coastal Wave identity. The imagery should feel like a real, modern Australian coastal café near
Long Reef / Northern Beaches, Sydney: bright, sunny, warm, relaxed, premium but approachable. Show a welcoming café
team and manager in a calm, well-run hospitality environment, with subtle beachside / ocean-adjacent cues.

- **Mood:** calm, capable, sunny, efficient, welcoming, local, hospitality-first, beachside, modern.
- **Setting:** beachside café culture; bright natural light; glimpses of ocean or coastal light; outdoor or
  open-front café; natural Australian coastal textures; relaxed suburban hospitality; fresh and breezy.
- **Palette:** timber, warm neutrals, soft cream, butter yellow, muted teal and charcoal accents. Match the brand
  palette in [BRAND_GUIDELINES.md](../BRAND_GUIDELINES.md).
- **People and story:** staff working confidently together; a manager or owner reviewing rosters or scheduling;
  natural, positive interaction; a sense of operational calm and team coordination. The scene implies rosters,
  time and attendance, shifts, staff communication and smoother day-to-day operations.
- **Style:** natural photography; bright but not harsh; warm coastal grading; clean and commercial; candid, not
  posed.

### Avoid

- A generic American diner, an inner-city corporate café or stock corporate-office imagery.
- Overdone tech futurism or floating dashboards. Any product UI must be subtle and secondary, and must never be
  presented as a real Butterbox screenshot.
- Invented signage, or any implication that a real, identifiable venue is depicted, unless supported by actual
  reference images and permission. The aim is *inspired by* the location, not a fake documentary photo.
- Beach clichés already excluded by the guidelines (palms, surfboards and cocktails as focal points).

## Deliverables

| # | Image | Composition | Master size | Crops required |
| --- | --- | --- | --- | --- |
| 1 | Homepage hero | Wide coastal café scene. Keep calm negative space (sky, wall or sea) on the **left** for headline text. Keep the subject group right of centre | ≥ 3200 × 1800 | 16:7 desktop (2560 w), 4:5 phone (960 w) with the subject still visible |
| 2 | Supporting image | Team collaboration: a manager and staff around a tablet or printed roster at the counter; calm service behind | ≥ 2400 × 2400 | 1:1 tile (960 w), 3:2 feature (1600 w) |
| 3 | Login / auth side (optional) | Simpler, cleaner detail: a coffee pass, morning light, a soft ocean glimpse; few or no faces | ≥ 1600 × 2000 | 4:5 (1200 w); must sit beside the form without obscuring it |

## Provenance required before use

Each delivered master must arrive with:

1. **Creator or generator** (photographer, or AI tool name and version), plus the creation date.
2. **For AI images:** the prompt used and the tool's commercial-use terms at the time of generation.
3. **For photography:** licence or model/property releases (keep signed releases in a private system; record only a
   reference ID here).
4. The owner's written selection and approval of the specific file.
5. Metadata stripped of GPS and personal data.

## Acceptance checklist (BB-BRAND-004)

- [ ] Master files kept unmodified under `branding/originals/photography/` and catalogued in
      [ASSET_INDEX.csv](../ASSET_INDEX.csv) with SHA-256, provenance and licence fields.
- [ ] Labelled clearly as photography or AI illustration, and never as an application screenshot.
- [ ] AVIF and WebP responsive derivatives at the crop sizes above, with the masters retained.
- [ ] Meaningful alt text for informative images; `alt=""` for decorative ones.
- [ ] Verified at 390 px and 1440 px for crop, text contrast over negative space, loading and axe, using the
      method already applied to `website/homepage/preview.html`.
- [ ] Owner final visual review recorded.
