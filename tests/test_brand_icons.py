"""Checks the circular RIGOR-X icons the Worker serves (deploy/cloudflare-ts/public, 2026-11-26 audit §11).

Standard library only (a small PNG decoder), so CI needs no imaging package: PNG format, RGBA 8-bit,
square sizes, no metadata chunks, fully transparent corners, an opaque disc, and an alpha mask that
is a circle (radius size/2 - 0.5 px: covered area within 0.6 % of pi*r^2, mirror-symmetric).
"""

import math
import struct
import unittest
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "deploy" / "cloudflare-ts" / "public"
SIZES = (32, 48, 64, 96, 128, 192, 256, 448)


def decode_png(data: bytes) -> tuple[int, int, list[bytes], list[str]]:
    """Width, height, RGBA rows and chunk types of an 8-bit RGBA, non-interlaced PNG."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos, chunks, idat = 8, [], b""
    width = height = 0
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8].decode("ascii")
        body = data[pos + 8:pos + 8 + length]
        chunks.append(kind)
        if kind == "IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert (depth, color, interlace) == (8, 6, 0), "expected 8-bit RGBA, not interlaced"
        elif kind == "IDAT":
            idat += body
        pos += 12 + length
    raw = zlib.decompress(idat)
    stride, bpp, rows, prev = width * 4, 4, [], bytearray(width * 4)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        rows.append(bytes(line))
        prev = line
    return width, height, rows, chunks


class BrandIconTests(unittest.TestCase):
    def test_icons_are_circular_transparent_rgba_pngs(self):
        for size in SIZES:
            with self.subTest(size=size):
                w, h, rows, chunks = decode_png((PUBLIC / f"icon-{size}.png").read_bytes())
                self.assertEqual((w, h), (size, size))
                self.assertEqual(set(chunks), {"IHDR", "IDAT", "IEND"}, "no metadata chunks")
                alpha = [[row[x * 4 + 3] for x in range(w)] for row in rows]
                for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
                    self.assertEqual(alpha[y][x], 0, "corners are fully transparent")
                c = size // 2
                self.assertEqual(alpha[c][c], 255)
                self.assertEqual(alpha[c][int(size * 0.1)], 255, "opaque well inside the circle")
                # The mask is a circle of radius size/2 - 0.5 px (half a pixel of margin, so the anti-aliased
                # edge never touches the canvas edge); its covered area is pi * r^2 within 0.6 %.
                covered = sum(a for r in alpha for a in r) / (255.0 * size * size)
                expected = math.pi * ((size / 2 - 0.5) / size) ** 2
                self.assertAlmostEqual(covered, expected, delta=0.006, msg="alpha mask is a circle")
                self.assertTrue(all(abs(alpha[y][x] - alpha[y][w - 1 - x]) <= 2 for y in range(h) for x in range(w)), "mirror-symmetric mask")

    def test_favicon_is_an_ico_container(self):
        data = (PUBLIC / "favicon.ico").read_bytes()
        reserved, kind, count = struct.unpack("<HHH", data[:6])
        self.assertEqual((reserved, kind), (0, 1))
        self.assertGreaterEqual(count, 3)


if __name__ == "__main__":
    unittest.main()
