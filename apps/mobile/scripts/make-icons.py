#!/usr/bin/env python3
"""Regenerates apps/mobile/assets/*.png from the Itera monogram of public/favicon.svg.

Provenance: the geometry (the "I" bars and the slash, viewBox 64) and the colours (#0A0908 ground,
#F4EDE2 ink, #3FD17F slash) are copied from public/favicon.svg; no art was invented. The web repo
has no square 1024 px source, so the shell icons are drawn here at 4x and scaled down.

Usage: python3 scripts/make-icons.py   (needs Pillow; run from apps/mobile; outputs are committed)
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (10, 9, 8, 255)
INK = (244, 237, 226, 255)
GREEN = (63, 209, 127, 255)
SIZE = 1024
SS = 4
OUT = Path(__file__).resolve().parent.parent / "assets"

# favicon.svg shapes, viewBox 64: three rects of the "I" and the slash parallelogram.
BARS = [(20, 16, 34, 22), (24, 16, 30, 48), (20, 42, 34, 48)]
SLASH = [(44, 16), (50, 16), (40, 48), (34, 48)]
CX, CY = 35.0, 32.0  # centre of the glyph's bounding box (x 20..50, y 16..48)


def glyph(size, scale, ink=INK, slash=GREEN):
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    k = scale * SS

    def pt(x, y):
        return (big / 2 + (x - CX) * k, big / 2 + (y - CY) * k)

    for x0, y0, x1, y1 in BARS:
        draw.rectangle([*pt(x0, y0), *pt(x1, y1)], fill=ink)
    draw.polygon([pt(x, y) for x, y in SLASH], fill=slash)
    return img.resize((size, size), Image.LANCZOS)


def on_ground(img):
    base = Image.new("RGBA", img.size, BG)
    base.alpha_composite(img)
    return base.convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    # iOS app icon: opaque, full bleed, the system rounds it.
    on_ground(glyph(SIZE, 16)).save(OUT / "icon.png")
    # Android adaptive: the launcher masks to about 66% of the canvas, so the glyph stays inside that circle.
    glyph(SIZE, 13).save(OUT / "adaptive-icon.png")
    # Android 13 themed icon: one flat colour, the system tints it.
    mono = (255, 255, 255, 255)
    glyph(SIZE, 13, ink=mono, slash=mono).save(OUT / "adaptive-icon-monochrome.png")
    # Splash: the glyph alone on a transparent canvas; the plugin supplies the #0A0908 ground.
    glyph(SIZE, 16).save(OUT / "splash-icon.png")


if __name__ == "__main__":
    main()
