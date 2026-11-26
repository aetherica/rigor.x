"""Circular, transparent-cornered PNG icons from the Aetherica emblem (2026-11-26 audit, directive §11).

Deterministic: the same input gives byte-identical output. Nothing is redrawn: the emblem's own
pixels are placed on a square canvas and cut with an anti-aliased circular mask (4x supersampled);
pixels outside the circle are fully transparent. Where the circle reaches beyond the original
image (composition "full"), the canvas is filled with the emblem's own background, extended from
its edges (reflection, heavily blurred, feathered into the original), so no hard image edge shows.

Usage: python -I assets/brand/tools/make_circular_icon.py assets/brand/aetherica-emblem.png deploy/cloudflare-ts/public [ring|full]
(the Worker serves deploy/cloudflare-ts/public as static assets: /icon-<size>.png and /favicon.ico)
"""
import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SIZES = (32, 48, 64, 96, 128, 192, 256, 448)
SS = 4  # supersampling for the circle edge

# Geometry measured on aetherica-emblem.png (473 x 456): ring centre about (240, 250), ring radius
# about 145; halo flames reach y = 0, molten drips y = 450; the "0°" mark sits near (20, 378).
COMPOSITIONS = {
    # Shipped: the largest circle that lies entirely inside the source (side 456 = the image height),
    # centred on the ring horizontally. Every pixel is the emblem's own; nothing is synthesized. It
    # keeps the ring, halo with its flames, bull, side flames and molten drips. The "0°" mark and the
    # left end of the gold base line (lower-left corner, about 270 px from the centre) fall outside.
    "ring": {"cx": 240.0, "cy": 228.0, "r": 228.0},
    # Not shipped: a circle wide enough for the "0°" mark (r = 268) must extend ~60 px beyond the
    # source; the halo flames are already cut by the source's top edge, so the extension shows a
    # hard line (checked in the 2026-11-26 preview). Kept to reproduce that comparison.
    "full": {"cx": 238.0, "cy": 236.0, "r": 268.0},
}


def extended_canvas(img: Image.Image, cx: float, cy: float, r: float) -> tuple[Image.Image, float, float]:
    """A canvas of side 2r around (cx, cy); regions outside the source are the source's own edges, extended and blurred."""
    side = int(np.ceil(2 * r))
    left, top = int(np.floor(cx - r)), int(np.floor(cy - r))
    w, h = img.size
    pad_l, pad_t = max(0, -left), max(0, -top)
    pad_r, pad_b = max(0, left + side - w), max(0, top + side - h)
    src = np.asarray(img.convert("RGB")).astype(np.float32)
    if pad_l or pad_t or pad_r or pad_b:
        padded = np.pad(src, ((pad_t, pad_b), (pad_l, pad_r), (0, 0)), mode="reflect")
        blurred = np.asarray(Image.fromarray(padded.astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))).astype(np.float32)
        # Darken the extension so it reads as background, not as a mirrored flame.
        ph, pw = padded.shape[:2]
        yy, xx = np.mgrid[0:ph, 0:pw]
        dx = np.maximum(0, np.maximum(pad_l - xx, xx - (pad_l + w - 1)))
        dy = np.maximum(0, np.maximum(pad_t - yy, yy - (pad_t + h - 1)))
        dist = np.sqrt(dx.astype(np.float32) ** 2 + dy.astype(np.float32) ** 2)
        base = np.array([18.0, 13.0, 11.0], dtype=np.float32)  # emblem background (corner average)
        fade = np.clip(dist / 40.0, 0, 1)[..., None]
        ext = blurred * (1 - 0.85 * fade) + base * (0.85 * fade)
        # Feather: inside the original keep it exact; blend over 6 px at the original's edge.
        inside = np.zeros((ph, pw), dtype=np.float32)
        inside[pad_t:pad_t + h, pad_l:pad_l + w] = 1.0
        feather = np.asarray(Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)[..., None] / 255.0
        feather = np.where(inside[..., None] > 0, np.maximum(feather, 0.0), 0.0)
        core = np.zeros_like(inside)
        core[pad_t + 6:pad_t + h - 6, pad_l + 6:pad_l + w - 6] = 1.0
        feather = np.maximum(feather, core[..., None])
        merged = padded * feather + ext * (1 - feather)
        src = merged
        left, top = left + pad_l, top + pad_t
    crop = src[top:top + side, left:left + side]
    return Image.fromarray(np.clip(crop, 0, 255).astype(np.uint8), "RGB"), cx - (left - pad_l), cy - (top - pad_t)


def circle_mask(side: int) -> Image.Image:
    big = side * SS
    yy, xx = np.mgrid[0:big, 0:big].astype(np.float32)
    c = (big - 1) / 2.0
    inside = ((xx - c) ** 2 + (yy - c) ** 2) <= (big / 2.0 - SS * 0.5) ** 2
    return Image.fromarray((inside * 255).astype(np.uint8), "L").resize((side, side), Image.Resampling.LANCZOS)


def build(src_path: Path, out_dir: Path, composition: str = "ring") -> list[tuple[str, int, str]]:
    g = COMPOSITIONS[composition]
    canvas, _, _ = extended_canvas(Image.open(src_path), g["cx"], g["cy"], g["r"])
    out_dir.mkdir(parents=True, exist_ok=True)
    made = []
    master_side = canvas.size[0]
    for size in SIZES:
        if size > master_side:
            continue  # never upscale: no detail exists beyond the source resolution
        rgb = canvas.resize((size, size), Image.Resampling.LANCZOS)
        rgba = rgb.convert("RGBA")
        rgba.putalpha(circle_mask(size))
        name = f"icon-{size}.png" if composition == "ring" else f"icon-{composition}-{size}.png"
        path = out_dir / name
        rgba.save(path, "PNG", optimize=True)  # no metadata chunks are written
        made.append((name, path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest()))
    if composition == "ring":
        # favicon.ico: a real ICO container with 16, 32 and 48 px images (browsers request it by default).
        ico = out_dir / "favicon.ico"
        base = canvas.resize((256, 256), Image.Resampling.LANCZOS).convert("RGBA")
        base.putalpha(circle_mask(256))
        base.save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
        made.append((ico.name, ico.stat().st_size, hashlib.sha256(ico.read_bytes()).hexdigest()))
    return made


if __name__ == "__main__":
    for name, size, digest in build(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "ring"):
        print(f"{name}\t{size} bytes\tsha256 {digest}")
