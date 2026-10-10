"""Paints Tera's outfit layers and writes them to public/mascot/outfits/.

    python3 design-playground/tera-outfits/build.py            # layers + contact sheet
    python3 design-playground/tera-outfits/build.py --only outfit_crown

Tera himself is never redrawn: the faces are read from `guideFaces.ts` only to (a) find what must
stay IN FRONT of an accessory (his crest, his beak) and (b) preview the result.
Every outfit is `back` (under the face image) + `front` (over it). The crest is painted a little
differently on each face tile, so `front` exists per face: neutral (shared with blink), happy, oops.
Layer canvas = the 240x368 face box plus a 24 unit bleed on every side (288x416).
"""
import base64
import io
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import paint as p
from paint import px  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
FACES_TS = ROOT / 'packages/activities/src/kinds/scene/guideFaces.ts'
OUT = ROOT / 'public/mascot/outfits'
FACES = ('neutral', 'happy', 'oops')

GOLD = ((112, 62, 14), (224, 156, 40), (255, 224, 122))
GOLD_DARK = ((70, 36, 8), (150, 92, 22), (214, 160, 70))
GOLD_PALE = ((150, 96, 30), (246, 198, 92), (255, 240, 176))
GRAPHITE = ((10, 14, 13), (40, 46, 46), (104, 116, 112))
CUSHION = ((8, 12, 11), (30, 34, 34), (74, 82, 80))
CREAM = ((132, 112, 84), (232, 220, 198), (255, 251, 240))
EMERALD = ((6, 70, 40), (40, 196, 112), (170, 255, 200))
RUBY = ((90, 10, 22), (214, 44, 60), (255, 170, 160))


def load_faces():
    src = FACES_TS.read_text()
    out = {}
    for m in re.finditer(r"export const GUIDE_FACE_(\w+)\s*=\s*['\"]data:image/\w+;base64,([^'\"]+)", src):
        out[m.group(1).lower()] = Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert('RGBA')
    return out


def to_canvas(mask_1x):
    """A 240x368 boolean array -> smooth supersampled mask on the layer canvas."""
    img = Image.fromarray((mask_1x * 255).astype(np.uint8), 'L').filter(ImageFilter.MedianFilter(5))
    big = img.resize((p.BOX_W * p.S, p.BOX_H * p.S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(p.S * 0.6))
    big = big.point(lambda v: max(0, min(255, (v - 96) * 4)))
    out = p.new_mask()
    out.paste(big, (p.BLEED * p.S, p.BLEED * p.S))
    return out


def face_masks(face):
    """What is in front of an accessory on this face: (crest, beak)."""
    n = np.asarray(face).astype(int)
    r, g, b, a = [n[..., i] for i in range(4)]
    yy, xx = np.mgrid[0:p.BOX_H, 0:p.BOX_W]
    ring = n[366, 120, :3]
    not_ring = np.abs(n[..., :3] - ring).sum(-1) > 46
    crest = (a > 128) & (g > 120) & (r / np.maximum(g, 1) > 0.42) & (b < 150) & (yy < 222) & (xx > 86) & not_ring
    crest &= ~((yy > 176) & (xx > 176))  # the pale forehead patch by the far brow is skin, not crest
    beak = (a > 128) & (r > 170) & (g > 105) & (b < 120) & (r - b > 95) & (yy > 262)
    beak &= yy > 262 + 0.86 * (150 - xx) - 5
    beak &= ~((xx > 176) & (yy < 276))
    return to_canvas(crest), to_canvas(beak)


# ───────────────────────────── outfits ─────────────────────────────

def glasses(crest, beak):
    """Round gold glasses on the beak bridge; the far lens is foreshortened by the head turn."""
    inside = p.disc(111.2)
    near = dict(cx=103, cy=260, rx=37.5, ry=36, rot=-4)
    far = dict(cx=201, cy=257, rx=27, ry=33.5, rot=-3)
    t = 8.0

    def ring(e, grow):
        return p.ellipse(e['cx'], e['cy'], e['rx'] + grow, e['ry'] + grow, e['rot'])

    lens_n, lens_f = ring(near, -t / 2), ring(far, -t / 2)
    rim = p.minus(p.union(ring(near, t / 2), ring(far, t / 2)), p.union(lens_n, lens_f))
    bridge = p.stroke(p.bezier((139.5, 250), (148, 238), (166, 237), (175.5, 249)), 7.2)
    arm = p.stroke(p.bezier((66.5, 252), (58, 248), (50, 244), (40, 241)), 7.4, taper=lambda u: 1.0 - 0.35 * u)
    hinge = p.ellipse(66.5, 252.5, 6.0, 7.4, -10)
    frame = p.union(rim, bridge, arm, hinge)

    layer = p.shadow(frame, 2.4, 5.0, 2.6, alpha=0.62, clip=inside)
    # glass: a cool film, brighter towards the light, with two brushed glare streaks
    yy, xx = np.mgrid[0:p.H, 0:p.W].astype(np.float32)
    grad = np.clip(1.15 - (yy / p.S - p.BLEED - 224) / 80, 0, 1)
    for lens, e in ((lens_n, near), (lens_f, far)):
        film = p.flat_layer(lens, (196, 236, 226), 1.0)
        film[..., 3] *= 0.07 + 0.13 * grad
        layer = p.over(layer, film)
        k = e['rx'] / 37.5
        streak = p.union(
            p.poly([(e['cx'] - 26 * k, e['cy'] - 2), (e['cx'] - 4 * k, e['cy'] - 30), (e['cx'] + 5 * k, e['cy'] - 30), (e['cx'] - 22 * k, e['cy'] + 10)]),
            p.poly([(e['cx'] - 14 * k, e['cy'] + 14), (e['cx'] + 12 * k, e['cy'] - 28), (e['cx'] + 16 * k, e['cy'] - 26), (e['cx'] - 10 * k, e['cy'] + 18)]),
        )
        glare = p.flat_layer(p.intersect(p.blur(streak, 1.6), lens), (255, 255, 246), 0.30)
        layer = p.over(layer, glare)
        # inner shadow of the rim on the glass, top left
        inner = p.intersect(p.minus(lens, p.shift(lens, 2.2, 3.2)), lens)
        layer = p.over(layer, p.flat_layer(p.blur(inner, 0.9), (6, 30, 20), 0.5))
    layer = p.over(layer, p.shade(frame, GOLD, bevel=2.3, depth=9, spec=0.85, gloss=22, bounce_k=0.32))
    layer = p.over(layer, p.shade(hinge, GOLD_PALE, bevel=1.8, depth=9, spec=0.9))
    layer = p.keep(layer, inside)
    layer = p.occlude(layer, beak)
    return None, layer


def crown_points(cx, cy, rx, ry, rot, a0, a1, band, spikes, valley, steps=140):
    """Outline of half a crown wall: the rim arc a0..a1 (degrees, 0 = front centre), then the zigzag back."""
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))

    def place(u, v):
        return (cx + u * c - v * s, cy + u * s + v * c)

    def height(a):
        best = band + valley
        for at, h in spikes:
            w = 21.0
            d = abs(a - at)
            if d < w:
                best = max(best, band + valley + (h - valley) * (1 - d / w) ** 0.9)
        return best

    angles = [a0 + (a1 - a0) * i / steps for i in range(steps + 1)]
    low = [place(rx * math.sin(math.radians(a)), ry * math.cos(math.radians(a))) for a in angles]
    top = [place(rx * math.sin(math.radians(a)), ry * math.cos(math.radians(a)) - height(a)) for a in reversed(angles)]
    tips = [place(rx * math.sin(math.radians(at)), ry * math.cos(math.radians(at)) - band - h) for at, h in spikes]
    return low + top, tips, place


def crown(crest, beak):
    """A gold crown AROUND the base of the crest: back wall behind the feathers, front wall over them."""
    cx, cy, rx, ry, rot = 140, 170, 58, 14, -9
    band = 17
    back_pts, back_tips, place = crown_points(cx, cy, rx, ry, rot, 90, 270, band, [(140, 24), (180, 28), (220, 24)], 4)
    front_pts, front_tips, _ = crown_points(cx, cy, rx, ry, rot, -90, 90, band, [(-76, 31), (-38, 39), (0, 46), (38, 39), (76, 31)], 4)
    back = p.poly(back_pts)
    front = p.poly(front_pts)

    # back wall: darker, behind the crest
    lb = p.shade(back, GOLD_DARK, bevel=3.0, depth=4, spec=0.15, flat=0.5, bounce_k=0.5)
    lb = p.occlude(lb, crest)

    # front wall, with a raised rim, a brand-green gem, two rubies, pearls on the tips
    rim_low = [place(rx * math.sin(math.radians(a)), ry * math.cos(math.radians(a)) - 2.6) for a in range(-90, 91, 3)]
    rim_top = [place(rx * math.sin(math.radians(a)), ry * math.cos(math.radians(a)) - band + 1.5) for a in range(-90, 91, 3)]
    trim = p.intersect(p.union(p.stroke(rim_low, 5.2), p.stroke(rim_top, 3.6)), front)
    lf = p.shadow(front, 1.5, 6.5, 3.4, alpha=0.6)
    lf = p.occlude(lf, back)  # the shadow falls on feathers, not on the crown's own inside
    lf = p.over(lf, p.shade(front, GOLD, bevel=4.2, depth=5.5, spec=0.55, gloss=18, bounce_k=0.42))
    lf = p.over(lf, p.flat_layer(p.intersect(p.blur(p.shift(trim, 0.8, 1.8), 0.9), front), (92, 46, 8), 0.55))
    lf = p.over(lf, p.shade(trim, GOLD_PALE, bevel=1.7, depth=10, spec=0.9, gloss=16, bounce_k=0.3))
    gems = [(0, 6.4, 7.6, EMERALD), (-41, 4.0, 4.8, RUBY), (41, 4.0, 4.8, RUBY), (-72, 2.6, 3.4, CREAM), (72, 2.6, 3.4, CREAM)]
    for a, gw, gh, ramp in gems:
        gx, gy = place(rx * math.sin(math.radians(a)), ry * math.cos(math.radians(a)) - band / 2 - 0.4)
        squash = max(0.45, math.cos(math.radians(a)))
        setting = p.ellipse(gx, gy, (gw + 2.0) * squash, gh + 2.0, rot)
        gem = p.ellipse(gx, gy, gw * squash, gh, rot)
        lf = p.over(lf, p.shade(setting, GOLD_DARK, bevel=1.5, depth=8, spec=0.3))
        lf = p.over(lf, p.shade(gem, ramp, bevel=2.0, depth=10, spec=1.0, gloss=40, bounce_k=0.1, rim_k=0.1))
    for tx, ty in front_tips:
        lf = p.over(lf, p.flat_layer(p.blur(p.ellipse(tx + 0.8, ty + 2.2, 5.2, 5.2), 1.0), (92, 46, 8), 0.5))
        lf = p.over(lf, p.shade(p.ellipse(tx, ty, 5.0, 5.0), GOLD_PALE, bevel=2.6, depth=9, spec=1.0, gloss=24))
    # ambient occlusion where the front wall meets the back wall
    inner = p.flat_layer(p.intersect(p.blur(p.shift(front, 0, -3), 2.6), back), (48, 22, 4), 0.55)
    lb = p.over(lb, p.occlude(inner, crest))
    return None, p.over(lb, lf)


def headphones(crest, beak):
    """Studio headphones: the near cup on the left ear, the band over the head and UNDER the crest."""
    inside = p.disc(111.2)
    band_curve = p.bezier((47, 228), (46, 178), (92, 150), (150, 146), 60) + p.bezier((150, 146), (206, 144), (236, 186), (238, 236), 40)[1:]
    band = p.stroke(band_curve, 17.5)
    pad_curve = [(x + 2.2, y + 4.6) for x, y in band_curve[10:]]
    pad = p.minus(p.stroke(pad_curve, 15.5), band)
    yoke = p.stroke(p.bezier((47, 230), (40, 222), (30, 232), (33, 250)), 7.5)
    cup_cx, cup_cy = 42, 262
    cushion = p.ellipse(cup_cx + 11, cup_cy + 1, 26, 43, 6)
    shell = p.ellipse(cup_cx, cup_cy, 25.5, 42, 6)
    plate = p.ellipse(cup_cx - 3, cup_cy - 0.5, 16.5, 31, 6)
    led = p.minus(p.ellipse(cup_cx - 3, cup_cy - 0.5, 16.5, 31, 6), p.ellipse(cup_cx - 3, cup_cy - 0.5, 13.6, 27.4, 6))
    hub = p.poly([(cup_cx - 8, cup_cy - 9), (cup_cx + 3.5, cup_cy), (cup_cx - 8, cup_cy + 9), (cup_cx - 8, cup_cy + 4.5), (cup_cx - 2.5, cup_cy), (cup_cx - 8, cup_cy - 4.5)])
    everything = p.union(band, pad, cushion, shell)

    layer = p.shadow(everything, 3.0, 5.5, 3.6, alpha=0.6, clip=inside)
    layer = p.over(layer, p.shade(pad, CUSHION, bevel=3.0, depth=5, spec=0.12, flat=0.2))
    layer = p.over(layer, p.shade(band, CREAM, bevel=4.2, depth=6, spec=0.5, gloss=14, bounce_k=0.5))
    seam = p.stroke([(x - 0.6, y - 0.8) for x, y in band_curve], 1.5)
    layer = p.over(layer, p.flat_layer(p.intersect(seam, band), (120, 100, 74), 0.5))
    layer = p.over(layer, p.shade(cushion, CUSHION, bevel=6.5, depth=5, spec=0.18, gloss=8, bounce_k=0.5))
    layer = p.over(layer, p.flat_layer(p.intersect(p.blur(p.shift(shell, 2.0, 2.4), 2.0), cushion), (2, 8, 6), 0.6))
    layer = p.over(layer, p.shade(shell, GRAPHITE, bevel=6.0, depth=5, spec=0.65, gloss=10, bounce_k=0.42, rim_k=0.5))
    layer = p.over(layer, p.shade(yoke, CREAM, bevel=2.2, depth=8, spec=0.6))
    layer = p.over(layer, p.shade(plate, GRAPHITE, bevel=5.0, depth=3, spec=0.5, gloss=10, bounce_k=0.3, flat=0.3))
    glow = p.flat_layer(p.intersect(p.blur(led, 3.0), shell), (63, 209, 127), 0.7)
    layer = p.over(layer, glow)
    layer = p.over(layer, p.shade(led, EMERALD, bevel=1.5, depth=7, spec=0.9, bounce_k=0.0, rim_k=0.0))
    layer = p.over(layer, p.shade(hub, EMERALD, bevel=1.4, depth=7, spec=0.8, bounce_k=0.0, rim_k=0.0))
    layer = p.keep(layer, inside)
    # only the crest proper hides the band; stray lime specks left of it are not feathers in front
    layer = p.occlude(layer, p.intersect(crest, p.poly([(100, 0), (240, 0), (240, 230), (100, 230)])))
    return None, layer


def leaf(cx, cy, length, width, angle):
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    pts = []
    for i in range(41):
        t = i / 40
        w = width * math.sin(math.pi * t ** 0.8) * (1 - 0.25 * t)
        pts.append((t * length, -w / 2))
    for i in range(40, -1, -1):
        t = i / 40
        w = width * math.sin(math.pi * t ** 0.8) * (1 - 0.25 * t)
        pts.append((t * length, w / 2))
    return [(cx + u * c - v * s, cy + u * s + v * c) for u, v in pts]


def laurel(crest, beak):
    """Legendary: a champion's golden laurel hugging the ring, with a warm glow behind Tera."""
    cx, cy = p.RING_CENTER
    radius = 116.5
    layer = p.empty()
    veins = []
    stems = []
    for side in (-1, 1):
        # angles measured from straight down, going up the side of the ring
        stem = [(cx + side * radius * math.sin(math.radians(a)), cy + radius * math.cos(math.radians(a))) for a in range(7, 123, 3)]
        stems.append(p.stroke(stem, 5.4, taper=lambda u: 1.0 - 0.55 * u))
        leaves = []
        for i, a in enumerate(range(12, 122, 17)):
            grow = 1.0 - 0.045 * i
            for out in (1, -1):
                r = radius + out * 2.5
                ox = cx + side * r * math.sin(math.radians(a))
                oy = cy + r * math.cos(math.radians(a))
                tangent = math.degrees(math.atan2(-math.sin(math.radians(a)), side * math.cos(math.radians(a))))
                ang = tangent - side * out * (36 if out > 0 else 30)
                length = (38 if out > 0 else 31) * grow
                leaves.append((a, out, leaf(ox, oy, length, 17.0 * grow, ang), (ox, oy, ang, length)))
        tip_a = 128
        tx, ty = cx + side * radius * math.sin(math.radians(tip_a)), cy + radius * math.cos(math.radians(tip_a))
        tang = math.degrees(math.atan2(-math.sin(math.radians(tip_a)), side * math.cos(math.radians(tip_a))))
        leaves.append((tip_a, 0, leaf(tx, ty, 28, 12.5, tang), (tx, ty, tang, 28)))
        # inner leaves first, then outer ones, bottom to top so each overlaps the one above it
        for a, out, pts, (ox, oy, ang, length) in sorted(leaves, key=lambda item: (item[1] > 0, -item[0])):
            m = p.poly(pts)
            layer = p.over(layer, p.flat_layer(p.blur(p.shift(m, 1.2, 2.6), 1.6), (30, 16, 2), 0.5))
            ramp = GOLD if out >= 0 else ((96, 52, 10), (196, 132, 30), (244, 204, 104))
            layer = p.over(layer, p.shade(m, ramp, bevel=3.6, depth=7.0, spec=0.7, gloss=14, bounce_k=0.3, rim_k=0.35))
            ex, ey = ox + math.cos(math.radians(ang)) * length * 0.86, oy + math.sin(math.radians(ang)) * length * 0.86
            veins.append(p.stroke([(ox, oy), (ex, ey)], 1.2))
    layer = p.over(p.shade(p.union(*stems), GOLD_DARK, bevel=1.6, depth=7, spec=0.4), layer)
    layer = p.over(layer, p.flat_layer(p.union(*veins), (120, 66, 10), 0.42))
    # the knot at six o'clock: a small emerald in a gold setting
    by = cy + radius + 1
    layer = p.over(layer, p.flat_layer(p.blur(p.ellipse(cx + 1, by + 2.5, 11, 11), 1.6), (30, 16, 2), 0.55))
    layer = p.over(layer, p.shade(p.ellipse(cx, by, 10.5, 10.5), GOLD_PALE, bevel=3.0, depth=8, spec=0.9, gloss=16))
    layer = p.over(layer, p.shade(p.ellipse(cx, by, 6.2, 6.2), EMERALD, bevel=2.6, depth=10, spec=1.0, gloss=40, bounce_k=0.0, rim_k=0.1))
    # sparks
    for sx, sy, sr in ((10, 146, 4.2), (236, 150, 3.0)):
        star = p.union(p.poly(leaf(sx - sr * 1.6, sy, sr * 3.2, sr * 0.9, 0)), p.poly(leaf(sx, sy - sr * 1.6, sr * 3.2, sr * 0.9, 90)))
        layer = p.over(layer, p.flat_layer(p.blur(star, 1.6), (255, 214, 110), 0.6))
        layer = p.over(layer, p.flat_layer(star, (255, 250, 220), 1.0))

    # back: warm halo that the ring and Tera sit on
    yy, xx = np.mgrid[0:p.H, 0:p.W].astype(np.float32)
    d = np.hypot(xx / p.S - p.BLEED - cx, yy / p.S - p.BLEED - cy)
    halo = np.clip(1 - np.abs(d - 116) / 24, 0, 1) ** 1.6
    back = p.empty()
    back[..., :3] = np.array([255, 196, 84], dtype=np.float32)
    back[..., 3] = halo * 0.55 * np.clip((yy / p.S - p.BLEED - 96) / 60, 0, 1)
    return back, layer


OUTFITS = {
    'outfit_glasses': glasses,
    'outfit_headphones': headphones,
    'outfit_crown': crown,
    'outfit_laurel': laurel,
}
PER_FACE = {'outfit_glasses', 'outfit_headphones', 'outfit_crown'}


def save(img, path, quality=84):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=quality, alpha_quality=92, method=6)
    return path.stat().st_size


def build(only=None):
    faces = load_faces()
    masks = {f: face_masks(faces[f]) for f in FACES}
    for key, draw in OUTFITS.items():
        if only and key != only:
            continue
        for face in FACES if key in PER_FACE else ('neutral',):
            back, front = draw(*masks[face])
            suffix = '' if face == 'neutral' else f'-{face}'
            size = save(p.finish(front), OUT / f'{key}-front{suffix}.webp')
            print(f'{key}-front{suffix}.webp {size} B')
            if back is not None and face == 'neutral':
                size = save(p.finish(back, soften=0), OUT / f'{key}-back.webp', quality=70)
                print(f'{key}-back.webp {size} B')


def export_backend():
    """Inline the happy face and the happy layers for the edge function (an SVG image cannot load files)."""
    def uri(data):
        return 'data:image/webp;base64,' + base64.b64encode(data).decode()

    src = FACES_TS.read_text()
    face = re.search(r"export const GUIDE_FACE_HAPPY\s*=\s*['\"](data:image/\w+;base64,[^'\"]+)", src).group(1)
    lines = [
        '// Generated by design-playground/tera-outfits/build.py --backend. Do not edit by hand.',
        '// Tera (happy face, 240x368, from guideFaces.ts) and his outfit layers (288x416 = the face box + a 24 unit bleed).',
        '// Inlined because an SVG used as an image cannot load external files.',
        'export const TERA_FACE = { width: 240, height: 368, bleed: 24 } as const;',
        f"export const TERA_FACE_DATA_URI =\n  '{face}';",
        'export const OUTFIT_LAYERS: Record<string, { back?: string; front: string }> = {',
    ]
    for key in OUTFITS:
        front = OUT / f'{key}-front-happy.webp'
        front = front if front.exists() else OUT / f'{key}-front.webp'
        back = OUT / f'{key}-back.webp'
        lines.append(f'  {key}: {{')
        if back.exists():
            lines.append(f"    back: '{uri(back.read_bytes())}',")
        lines.append(f"    front: '{uri(front.read_bytes())}',")
        lines.append('  },')
    lines.append('};')
    target = ROOT / 'supabase/functions/_shared/outfit-art.ts'
    target.write_text('\n'.join(lines) + '\n')
    print(target, target.stat().st_size, 'B')


if __name__ == '__main__':
    if '--backend' in sys.argv:
        export_backend()
        sys.exit(0)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    build(only)
