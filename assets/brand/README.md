# Aetherica brand assets

Provided by the owner on 2026-11-26 for upcoming Aetherica / RIGOR-X work. The three original files
are the owner's uploads, stored byte for byte (SHA-256 below); nothing in them was resized, recoloured
or cropped. One derived file, a tagline-free crop of the wordmark, was made at the owner's request.

| File | Role | Size | Notes |
|---|---|---|---|
| `aetherica-banner.png` | Main logo / banner | 1536 × 803 px, RGB | Emblem above the AETHERICA wordmark on a gold diagonal rule, black field with embers. **Contains the tagline.** |
| `aetherica-emblem.png` | Emblem | 473 × 456 px | Bull silhouette inside a ring of swirling flames, flaming golden halo above, molten drips below, a thin gold line with a small "0°" mark at the lower left. No text. |
| `aetherica-wordmark.png` | Brand name (wordmark) | 614 × 134 px | "AETHERICA" in gold, wide-spaced serif capitals. **Contains the tagline** below the name. |
| `aetherica-wordmark-no-tagline.png` | Brand name without the tagline (derived) | 614 × 92 px | Rows 0–91 of `aetherica-wordmark.png`, cut above the tagline. **Use this one in the main work.** |

Palette: gold, amber, orange-red flame, black.

## Owner rule: no tagline in the main work

The line "Beat The Heat. Dare The Fire." is **not** used in the main work (owner, 2026-11-26:
«ট্যাগলাইন হিসেবে Beat The Heat, Dare The Fire লাইনটা মূল কাজে বাদ যাবে»).

- Wordmark: use `aetherica-wordmark-no-tagline.png`.
- Emblem: has no text; use it as it is.
- Banner: the tagline sits on the diagonal rule under the name, so it cannot be cut off cleanly;
  a tagline-free banner has to be re-exported from the source artwork (or rebuilt from the emblem
  and the tagline-free wordmark).

How the wordmark crop was made: a luminance profile per row shows the wordmark glyphs, their gold
rule and glow in rows 17–86, background only in rows 86–92 inside the tagline's horizontal range
(maximum luminance 18.6 on 0–255, against 22.2 in text-free background rows), and the tagline from
row 94. The crop keeps rows 0–91, which also leaves near-equal margins above and below the name.
It is a plain crop: the kept pixels are identical to the original (checked), nothing was resampled
or repainted.

## Technical limits of these files

- All three have opaque dark backgrounds (the two RGBA files have no transparent pixels), so they
  are not ready for light or coloured backgrounds.
- The emblem and the wordmark are small raster images: fine for screens and avatars, not for print
  or large displays. Higher-resolution or vector masters would be needed for those uses.

## Trademark

Aetherica, RIGOR.X, RIGOR-X and their logos are Project Marks: Apache-2.0 grants no right to use
them as a brand, an endorsement or a sign of official status. See [TRADEMARKS.md](../../TRADEMARKS.md)
and [LICENSING.md](../../LICENSING.md) §5.

## Provenance

| File | Uploaded as | SHA-256 |
|---|---|---|
| `aetherica-banner.png` | `1000042533.png` | `a6c773505fdf96a748d59eac4deec5600b901c22f910bd5b2bcc671ed54dabbf` |
| `aetherica-emblem.png` | `1000044167.png` | `2567e338e60362cb6b9d7c7e364a06b1a4580a53a933e5a300f26e7f4d3f3c78` |
| `aetherica-wordmark.png` | `1000044827.png` | `7b52a7adb1b4a07ab7298eb487827ec58abb193c1cc3947756d538542edd61eb` |
| `aetherica-wordmark-no-tagline.png` | derived from `aetherica-wordmark.png` (crop box 0, 0, 614, 92) | `e12b4d93440a51c8fae4fa51987f2063e40199f1939ce064380008fe9eac8524` |
