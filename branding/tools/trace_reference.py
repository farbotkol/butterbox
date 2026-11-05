#!/usr/bin/env python3
"""Trace the owner-selected Coastal Wave reference into vector geometry.

Requirements (developer tooling only, not app dependencies):
  potrace >= 1.16 on PATH, Python 3 with Pillow and NumPy.

Usage (from the repository root):
  python3 branding/tools/trace_reference.py

Writes branding/logos/source/traced-geometry.json, which
scripts/build-brand-assets.mjs turns into every SVG/PNG/ICO variant.
The raster reference is only read; it is never embedded in an output.
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "branding/originals/butterbox-approved-logo.png"
OUTPUT = ROOT / "branding/logos/source/traced-geometry.json"
SCALE = 4  # supersample before tracing for sub-pixel edge accuracy

# Median colours sampled from fully opaque reference pixels.
PALETTE = {
    "gold": (0xF0, 0xB1, 0x50),
    "teal": (0x61, 0x9A, 0x92),
    "cream": (0xF9, 0xF1, 0xE5),
    "charcoal": (0x18, 0x28, 0x2B),
}
# Reference-pixel regions; everything outside is stray generator noise.
ICON_BOX = (380, 270, 900, 760)
WORDMARK_BOX = (80, 785, 1175, 990)


def classify(img: np.ndarray) -> np.ndarray:
    rgb = img[..., :3].astype(np.float64)
    names = list(PALETTE)
    dist = np.stack([((rgb - np.array(PALETTE[n])) ** 2).sum(-1) for n in names])
    labels = np.array(names, dtype=object)[dist.argmin(0)]
    labels[img[..., 3] < 128] = "none"
    return labels


def box_mask(shape, box):
    mask = np.zeros(shape, dtype=bool)
    x0, y0, x1, y1 = (v * SCALE for v in box)
    mask[y0:y1, x0:x1] = True
    return mask


TOKEN = re.compile(r"[MmLlCcZz]|-?\d+(?:\.\d+)?")


def potrace_path(mask: np.ndarray, turdsize: int) -> str:
    height = mask.shape[0]
    with tempfile.TemporaryDirectory() as tmp:
        pbm = Path(tmp) / "layer.pbm"
        Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).convert("1").save(pbm)
        svg = subprocess.run(
            ["potrace", str(pbm), "-b", "svg", "--flat", "-t", str(turdsize),
             "-a", "1.0", "-O", "0.4", "-o", "-"],
            check=True, capture_output=True, text=True,
        ).stdout
    raw = " ".join(re.findall(r'<path d="([^"]+)"', svg, re.S))
    tokens = TOKEN.findall(raw)

    # potrace emits translate(0,H) scale(0.1,-0.1) in bitmap units.
    def tx(x, y):
        return x * 0.1 / SCALE, (height - y * 0.1) / SCALE

    out, i, cmd = [], 0, None
    cx = cy = sx = sy = 0.0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                out.append("Z")
                cx, cy = sx, sy
                continue
        count = 6 if cmd in "Cc" else 2
        vals = [float(v) for v in tokens[i:i + count]]
        i += count
        rel = cmd.islower()
        pts = []
        for j in range(0, count, 2):
            x, y = vals[j], vals[j + 1]
            if rel:
                x, y = x + cx, y + cy
            pts.append((x, y))
        cx, cy = pts[-1]
        letter = cmd.upper()
        if letter == "M":
            sx, sy = cx, cy
            cmd = "l" if rel else "L"
        coords = " ".join(f"{a:.2f} {b:.2f}" for a, b in (tx(*p) for p in pts))
        out.append(f"{letter}{coords}")
    return " ".join(out)


def main():
    src = Image.open(REFERENCE).convert("RGBA")
    big = np.array(src.resize((src.width * SCALE, src.height * SCALE), Image.LANCZOS))
    labels = classify(big)
    icon = box_mask(labels.shape, ICON_BOX)
    word = box_mask(labels.shape, WORDMARK_BOX)
    solid = labels != "none"
    turd = 40 * SCALE * SCALE
    layers = {
        # Stacked bottom-to-top so adjacent fills share an edge without seams.
        "silhouette": potrace_path(icon & solid, turd),
        "creamAndGold": potrace_path(icon & np.isin(labels, ["cream", "gold"]), turd),
        "gold": potrace_path(icon & (labels == "gold"), turd),
        # Separate teal-only layer for single-colour knock-out variants.
        "teal": potrace_path(icon & (labels == "teal"), turd),
        "wordmark": potrace_path(word & solid, 6 * SCALE * SCALE),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({
        "reference": str(REFERENCE.relative_to(ROOT)),
        "referenceSize": [src.width, src.height],
        "iconBox": ICON_BOX,
        "wordmarkBox": WORDMARK_BOX,
        "palette": {k: "#%02X%02X%02X" % v for k, v in PALETTE.items()},
        "paths": layers,
    }, indent=2) + "\n")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
