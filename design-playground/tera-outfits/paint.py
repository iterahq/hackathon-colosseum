"""Small raster "painting" toolkit for Tera's outfits (Pillow + numpy only).

Everything is drawn 4x supersampled on a canvas that is the 240x368 face box plus a
24 unit bleed on every side, in FACE units, so numbers match `guideFaces` coordinates.
Shapes are masks; `shade` turns a mask into a lit, bevelled, painted solid.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 4
BLEED = 24
BOX_W, BOX_H = 240, 368
W, H = (BOX_W + 2 * BLEED) * S, (BOX_H + 2 * BLEED) * S

# Key light of the painting: upper left, a little in front (read from the beak and crest highlights).
LIGHT = np.array([-0.42, -0.68, 0.60])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0.0, 0.0, 1.0])
HALF = HALF / np.linalg.norm(HALF)

RING_CENTER = (120.0, 248.0)


def px(x, y):
    return ((x + BLEED) * S, (y + BLEED) * S)


def new_mask():
    return Image.new('L', (W, H), 0)


def poly(points, mask=None):
    mask = mask or new_mask()
    ImageDraw.Draw(mask).polygon([px(x, y) for x, y in points], fill=255)
    return mask


def ellipse(cx, cy, rx, ry, rot=0.0, mask=None, steps=96):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pts = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        u, v = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + u * c - v * s, cy + u * s + v * c))
    return poly(pts, mask)


def stroke(points, width, mask=None, taper=None):
    """A round-capped thick polyline. `taper(t)` scales the width along its length."""
    mask = mask or new_mask()
    d = ImageDraw.Draw(mask)
    dense = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) * 2))
        dense += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    dense.append(points[-1])
    for i, (x, y) in enumerate(dense):
        r = width / 2 * (taper(i / (len(dense) - 1)) if taper else 1.0) * S
        cx, cy = px(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    return mask


def bezier(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def arr(mask):
    return np.asarray(mask, dtype=np.float32) / 255.0


def to_mask(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L')


def blur(mask, radius_units):
    return mask.filter(ImageFilter.GaussianBlur(radius_units * S))


def union(*masks):
    out = arr(masks[0])
    for m in masks[1:]:
        out = np.maximum(out, arr(m))
    return to_mask(out)


def minus(a, b):
    return to_mask(arr(a) * (1 - arr(b)))


def intersect(a, b):
    return to_mask(arr(a) * arr(b))


def shift(mask, dx, dy):
    out = new_mask()
    out.paste(mask, (int(round(dx * S)), int(round(dy * S))))
    return out


_rng = np.random.default_rng(7)
_noise = None


def paint_noise():
    """Low frequency value wobble, so fills read as brushed paint and not as vector flats."""
    global _noise
    if _noise is None:
        small = _rng.random((H // 24, W // 24)).astype(np.float32)
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        _noise = np.asarray(img, dtype=np.float32) / 255.0 - 0.5
    return _noise


def lerp(a, b, t):
    return a + (b - a) * t


def shade(mask, ramp, bevel=3.0, depth=7.0, spec=0.6, gloss=28, bounce=(52, 150, 84), bounce_k=0.38,
          rim=(236, 246, 150), rim_k=0.30, flat=0.0, wobble=0.10):
    """Mask -> RGBA float layer, lit like a soft solid.

    ramp: (shadow, mid, light) RGB. `bevel` is the roundness in face units, `depth` its strength.
    The underside picks up the green of Tera's feathers (`bounce`), the lit edge a lime rim (`rim`).
    """
    box = mask.getbbox()
    full = np.zeros((H, W, 4), dtype=np.float32)
    if box is None:
        return full
    pad = int(bevel * S * 3) + 4
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad))
    mask = mask.crop(box)
    noise = paint_noise()[box[1]:box[3], box[0]:box[2]]
    m = arr(mask)
    h = arr(mask.filter(ImageFilter.GaussianBlur(bevel * S))) * m
    gy, gx = np.gradient(h)
    k = depth * bevel * S
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / ln, ny / ln, nz / ln
    diff = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    flat_light = LIGHT[2]
    diff = lerp(diff, flat_light, flat) + noise * wobble
    sh, mid, li = [np.array(c, dtype=np.float32) for c in ramp]
    t = np.clip((diff - flat_light) / (1 - flat_light + 1e-6), -1, 1)[..., None]
    lo = np.clip((diff / max(flat_light, 1e-6)), 0, 1)[..., None]
    rgb = np.where(t >= 0, lerp(mid, li, np.clip(t, 0, 1) ** 0.8), lerp(sh, mid, lo ** 1.2))
    hl = np.clip(nx * HALF[0] + ny * HALF[1] + nz * HALF[2], 0, 1) ** gloss
    rgb = rgb + (255 - rgb) * (hl * spec)[..., None]
    down = np.clip(ny, 0, 1) ** 1.3
    rgb = lerp(rgb, np.array(bounce, dtype=np.float32), (down * bounce_k)[..., None])
    edge = np.clip(-(nx * 0.55 + ny * 0.83), 0, 1) ** 2.2
    rgb = lerp(rgb, np.array(rim, dtype=np.float32), (edge * rim_k)[..., None])
    full[box[1]:box[3], box[0]:box[2], :3] = np.clip(rgb, 0, 255)
    full[box[1]:box[3], box[0]:box[2], 3] = m
    return full


def flat_layer(mask, color, alpha=1.0):
    out = np.zeros((H, W, 4), dtype=np.float32)
    out[..., :3] = np.array(color, dtype=np.float32)
    out[..., 3] = arr(mask) * alpha
    return out


def empty():
    return np.zeros((H, W, 4), dtype=np.float32)


def over(dst, src):
    """Straight alpha "src over dst", in place safe."""
    alpha = src[..., 3]
    rows, cols = np.flatnonzero(alpha.any(axis=1)), np.flatnonzero(alpha.any(axis=0))
    out = dst.copy()
    if rows.size == 0:
        return out
    win = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
    s, d = src[win], dst[win]
    sa, da = s[..., 3:4], d[..., 3:4]
    oa = sa + da * (1 - sa)
    out[win][..., :3] = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    out[win][..., 3:4] = oa
    return out


def shadow(mask, dx=2.0, dy=4.0, soft=3.0, color=(4, 26, 16), alpha=0.55, clip=None):
    """Contact shadow the accessory drops on the feathers, away from the key light."""
    m = blur(shift(mask, dx, dy), soft)
    if clip is not None:
        m = intersect(m, clip)
    return flat_layer(m, color, alpha)


def occlude(layer, *hide):
    out = layer.copy()
    for m in hide:
        out[..., 3] *= 1 - arr(m)
    return out


def keep(layer, mask):
    out = layer.copy()
    out[..., 3] *= arr(mask)
    return out


def disc(radius, feather=0.4):
    m = ellipse(RING_CENTER[0], RING_CENTER[1], radius, radius, steps=240)
    return blur(m, feather) if feather else m


def finish(layer, soften=0.35):
    """Downsample to the delivery size (1x face units, bleed included)."""
    a = np.clip(layer, 0, [255, 255, 255, 1]).copy()
    a[..., :3] *= a[..., 3:4]  # premultiply so transparent pixels do not bleed colour
    a[..., 3] *= 255
    img = Image.fromarray(a.astype(np.uint8), 'RGBa').convert('RGBA')
    small = img.resize((W // S, H // S), Image.LANCZOS)
    if soften:
        small = small.filter(ImageFilter.GaussianBlur(soften))
    return small
