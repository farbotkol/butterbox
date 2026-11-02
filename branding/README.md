# Butterbox — Branding and website imagery

**Status:** Governed inventory; final identity and rights approval remain pending.
**Branch:** `copilot/finish-roadmap-for-app`

## Inventory and approval boundary

[ASSET_INDEX.csv](ASSET_INDEX.csv) is the authoritative path-by-path catalogue.
Paths are relative to the repository root. The inventory was verified on
2026-11-02 against development checkpoint `efd9c77`: **15 records, 10 present,
5 missing, no owner-approved assets recorded**. Version identifies the last
source-changing commit, not a marketing release. SHA-256 binds each present
entry to the inspected bytes. A new source change requires a catalogue update.

Each entry records intended use, source/derivative relationship, custody,
provenance, rights/permission status, reviewer and approval evidence.
**Repository possession, an app reference or an agent review does not establish
copyright ownership, redistribution permission or final owner approval.**
The product owner is the library custodian, not an asserted rights holder.
Unknown provenance or rights are explicitly unverified rather than silently
assumed licensed.

The app's current inline `BrandLockup` and the public SVGs are different mark
implementations. They are inventoried as existing drafts, not silently unified
or replaced here. The manifest references `public/icon.svg`; the shared
component appears in authenticated and authentication layouts. The standalone
public logo and five scaffold SVGs had no direct reference in inspected
`src/` TypeScript/TSX. Absence of such a reference is not proof of no external
use; do not delete them without checking dependants.

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

No WebP/AVIF derivative, editable logo master, campaign creative or approved
marketing release is claimed. BB-BRAND-002 and later stories retain their
separate production, owner-review and rights gates.

## Contributing and storing assets

1. Check the inventory before adding an asset. Preserve original sources;
   never replace a missing reference with an unrelated image under its name.
   Use descriptive new names such as `butterbox_<purpose>_<variant>_v001.ext`.
   Preserve existing paths while dependants still use them.
2. Keep future editable/high-resolution masters in `branding/sources/`,
   optimized exports in `branding/derivatives/` and non-sensitive approval
   references in `branding/evidence/`. These are **proposed storage locations**,
   not a claim that those folders or files exist now. Publish only reviewed
   web derivatives to `public/`; everything there is publicly retrievable.
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
