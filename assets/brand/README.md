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

## Circular icon family (2026-11-26, engineering audit §11)

Made from `aetherica-emblem.png` (byte-identical to the emblem the owner attached on 2026-11-26,
SHA-256 `2567e338…`) by `tools/make_circular_icon.py` (deterministic; run it again to reproduce the
files byte for byte). The files live where the Worker serves them: `deploy/cloudflare-ts/public/`.

- **Composition:** the largest circle that lies entirely inside the emblem image (diameter 456 px =
  the image height, centre (240, 228)). Every pixel is the emblem's own; nothing is redrawn,
  recoloured or synthesized. It keeps the ring, the halo with its flames, the bull, the side flames
  and the molten drips.
- **Trade-off (disclosed):** the small "0°" mark and the left end of the gold base line sit in the
  lower-left corner, about 270 px from the centre, so they fall outside any circle that stays inside
  the source. A wider circle was built and checked: it needs ~60 px of invented background, and the
  halo flames, already cut by the source's top edge, then show a hard line. Including the "0°" mark
  cleanly needs a larger or vector master of the emblem.
- **Format:** PNG, RGBA 8-bit, transparent outside the circle (anti-aliased edge, 4x supersampled,
  half a pixel of margin), only IHDR/IDAT/IEND chunks (no metadata). Sizes 32–448 px, never
  upscaled (the source is 456 px tall). `favicon.ico` is an ICO container with 16, 32 and 48 px.
- **Where it shows:** MCP `serverInfo.icons` (48, 96, 192, 448; hosts show it in their connector
  list), the favicon and the emblem on the sign-in consent, privacy, terms and message pages.
  Checked: `tests/test_brand_icons.py` (circle, transparency, chunks; standard library only),
  `deploy/cloudflare-ts/test/integration/auth-probe.mjs` (served by the static asset layer with the
  built bytes), `test/integration/ui-render.mjs` (rendered in Chromium, light and dark).

| File | Size | SHA-256 |
|---|---|---|
| `icon-32.png` | 3236 B | `9116ab9bb0ad4181…` |
| `icon-48.png` | 6898 B | `5c5a58e2e2e02ffc…` |
| `icon-64.png` | 11648 B | `39abc1b642e524f1…` |
| `icon-96.png` | 24400 B | `5c0ee4747db2df2a…` |
| `icon-128.png` | 40763 B | `2230db1bad1dd127…` |
| `icon-192.png` | 82451 B | `7bd95839afc23f2f…` |
| `icon-256.png` | 135332 B | `d13327aae48b8df0…` |
| `icon-448.png` | 342721 B | `af05490da0ce9d86…` |
| `favicon.ico` | 10475 B | `fa4ff7dce4cba432…` |
