"""Splits the 8-frame windmill sheet into a still tower and one set of sails,
so the game can turn the sails smoothly instead of stepping through 8 frames.

Frame 1 has the sails straight up/down/left/right. Their shape (the cream
cloth, a few pixels of frame around it and the hub) is a mask; each later
frame is the same mask turned another 11.25 degrees. The tower is, per pixel,
the most common colour among the frames whose sails don't cover it.
Run with the imagegen venv:
  ../imagegen/.venv/bin/python scripts/split_windmill.py
"""
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

SHEETS = Path(__file__).resolve().parent.parent / 'public/assets/spritesheets'
SIZE = 208
HUB = (104, 104)
STEP = 90 / 8


def is_cloth(c):
    r, g, b, a = c
    return a > 0 and r > 190 and g > 170 and b > 140 and max(r, g, b) - min(r, g, b) < 70


def split(name):
    sheet = Image.open(SHEETS / f'{name}.png').convert('RGBA')
    frames = [
        sheet.crop(((i % 3) * SIZE, (i // 3) * SIZE, (i % 3 + 1) * SIZE, (i // 3 + 1) * SIZE))
        for i in range(8)
    ]
    first = frames[0].load()
    cloth = Image.new('L', (SIZE, SIZE))
    cp = cloth.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if is_cloth(first[x, y]) and (abs(x - HUB[0]) > 8 or abs(y - HUB[1]) > 8):
                cp[x, y] = 255
    # Keep only the four broad panels, not thin light lines on the tower.
    cloth = cloth.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    cloth = cloth.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    cp = cloth.load()
    seen = set()
    for y0 in range(SIZE):
        for x0 in range(SIZE):
            if not cp[x0, y0] or (x0, y0) in seen:
                continue
            stack, part = [(x0, y0)], []
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                part.append((x, y))
                for nx, ny in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
                    if 0 <= nx < SIZE and 0 <= ny < SIZE and cp[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            xs, ys = [q[0] for q in part], [q[1] for q in part]
            if min(max(xs) - min(xs), max(ys) - min(ys)) < 10:
                for q in part:
                    cp[q] = 0
    # The cloth's frame, spar and the hub around it.
    mask = cloth.filter(ImageFilter.MaxFilter(7))
    ImageDraw.Draw(mask).ellipse((HUB[0] - 12, HUB[1] - 12, HUB[0] + 12, HUB[1] + 12), fill=255)
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        ImageDraw.Draw(mask).line(
            (HUB[0], HUB[1], HUB[0] + dx * 95, HUB[1] + dy * 95), fill=255, width=6
        )

    # Which way do the sails turn? Pick the direction whose turned mask best
    # covers frame 2's cloth.
    def masks(sign):
        return [mask.rotate(sign * k * STEP, resample=Image.NEAREST, center=HUB) for k in range(8)]

    def fit(ms):
        f, m = frames[1].load(), ms[1].load()
        return sum(1 for y in range(SIZE) for x in range(SIZE) if is_cloth(f[x, y]) and m[x, y])

    turned = max([masks(1), masks(-1)], key=fit)
    direction = 1 if turned is masks(1) else -1

    px = [f.load() for f in frames]
    mp = [m.load() for m in turned]
    tower = Image.new('RGBA', (SIZE, SIZE))
    sails = Image.new('RGBA', (SIZE, SIZE))
    t, s = tower.load(), sails.load()
    for y in range(SIZE):
        for x in range(SIZE):
            free = [px[k][x, y] for k in range(8) if not mp[k][x, y]]
            colours = [c if c[3] else (0, 0, 0, 0) for c in free]
            if colours:
                t[x, y] = Counter(colours).most_common(1)[0][0]
    # Right by the hub every frame has sails on top; fill those few pixels
    # from their neighbours so the tower has no hole behind the hub.
    solid = [all(px[k][x, y][3] for k in range(8)) for y in range(SIZE) for x in range(SIZE)]
    for _ in range(20):
        filled = False
        for y in range(1, SIZE - 1):
            for x in range(1, SIZE - 1):
                if t[x, y][3] or not solid[y * SIZE + x]:
                    continue
                near = [t[x + dx, y + dy] for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]]
                near = [c for c in near if c[3]]
                if near:
                    t[x, y] = Counter(near).most_common(1)[0][0]
                    filled = True
        if not filled:
            break
    # The sails are what frame 1 shows inside the mask that isn't tower
    # (the cloth itself always, even where it matches the tower's colour).
    inner = cloth.filter(ImageFilter.MaxFilter(3)).load()
    near = cloth.filter(ImageFilter.MaxFilter(5))
    ImageDraw.Draw(near).ellipse((HUB[0] - 12, HUB[1] - 12, HUB[0] + 12, HUB[1] + 12), fill=255)
    near = near.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if not first[x, y][3]:
                continue
            if inner[x, y] or (near[x, y] and mp[0][x, y] and first[x, y] != t[x, y]):
                s[x, y] = first[x, y]
    tower.save(SHEETS / f'{name}-tower.png')
    sails.save(SHEETS / f'{name}-sails.png')
    print('wrote', name, 'turning', 'counter-clockwise' if direction > 0 else 'clockwise')


for name in ['windmill', 'windmill-vivid']:
    split(name)
