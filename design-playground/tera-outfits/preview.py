"""Preview helpers: Tera wearing the built layers, composited exactly like the app does.

    python3 design-playground/tera-outfits/preview.py zoom outfit_crown   # big, three faces
    python3 design-playground/tera-outfits/preview.py sheet               # the approval sheet (new only)
"""
import sys
from pathlib import Path

from PIL import Image

from build import FACES, OUT, OUTFITS, load_faces
from paint import BLEED, BOX_H, BOX_W

BG = (15, 13, 11, 255)
CW, CH = BOX_W + 2 * BLEED, BOX_H + 2 * BLEED


def layer_path(key, part, face):
    variant = OUT / f'{key}-{part}-{face}.webp'
    return variant if variant.exists() else OUT / f'{key}-{part}.webp'


def wear(faces, key, face, scale=1.0):
    """Tera on the bleed canvas (CW x CH), scaled."""
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    tile = faces['neutral' if face == 'blink' else face] if face != 'blink' else faces['blink']
    back = layer_path(key, 'back', face) if key else None
    if back and back.exists():
        canvas.alpha_composite(Image.open(back).convert('RGBA'))
    canvas.alpha_composite(faces[face], (BLEED, BLEED))
    lookup = 'neutral' if face == 'blink' else face
    front = layer_path(key, 'front', lookup) if key else None
    if front and front.exists():
        canvas.alpha_composite(Image.open(front).convert('RGBA'))
    del tile
    if scale != 1.0:
        canvas = canvas.resize((round(CW * scale), round(CH * scale)), Image.LANCZOS)
    return canvas


def zoom(key, out):
    faces = load_faces()
    names = ('neutral', 'blink', 'happy', 'oops')
    sheet = Image.new('RGBA', (CW * 2 * 4, CH * 2), BG)
    for i, face in enumerate(names):
        sheet.alpha_composite(wear(faces, key, face, 2.0), (i * CW * 2, 0))
    sheet.save(out)
    return out


def small(out):
    faces = load_faces()
    keys = list(OUTFITS)
    sizes = (200, 96, 72, 48, 32)
    width = sum(s + 40 for s in sizes) + 20
    sheet = Image.new('RGBA', (width, 340 * len(keys)), BG)
    for row, key in enumerate(keys):
        x = 20
        for s in sizes:
            img = wear(faces, key, 'neutral', s / BOX_W)
            sheet.alpha_composite(img, (x, row * 340 + 10))
            x += s + 40
    sheet.save(out)
    return out


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'zoom':
        print(zoom(sys.argv[2], Path(sys.argv[3] if len(sys.argv) > 3 else f'/tmp/hk/art/v2/zoom-{sys.argv[2]}.png')))
    elif mode == 'small':
        print(small(Path('/tmp/hk/art/v2/small.png')))
    _ = FACES
