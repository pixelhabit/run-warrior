"""Draws the Run Warrior icon: the warrior's portrait (from the game sprite,
doubled) against the stage 1 sunset sky. Writes PNGs with the standard library only."""
import struct, sys, zlib, os

OUT = sys.argv[1]

def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def mix(c, toward, a):
    return tuple(round(v + (toward - v) * a) for v in c)

OUTLINE = hexrgb('#1a1028')
PAL = {k: hexrgb(v) for k, v in {
    'e': '#1a1028', 'w': '#ffffff', 'y': '#ffd84d', 'r': '#ff4d6d',
    'f': '#ffcc99', 'n': '#3f7be8', 'N': '#284fa8',
    'm': '#dfe5f0', 'M': '#7d8597', 'B': '#4f3220',
}.items()}
FLAT = set('ewy')

# Same rows as HERO_TOP in js/sprites.js: helmet, face, scarf, tunic, sword.
HERO_TOP = [
    '....mmmmm.....',
    '...mmmmmmm..m.',
    '...MMMMMMM..m.',
    '...ffffeff..m.',
    '...fffffff..m.',
    '....rrrrr...m.',
    'rr.nnnnnnn..m.',
    '.rnnnnnnnnnMMM',
    '..nnnnnnnnnff.',
    '..nnnNNNnnn...',
    '...BBBBBBB....',
]

def sprite_pixels(rows):
    """Flat sprite → dict of (x, y) → rgb, with outline and shading like the game."""
    w = max(len(r) for r in rows) + 2
    h = len(rows) + 2
    def at(x, y):
        if 1 <= y <= len(rows) and 1 <= x <= len(rows[y - 1]):
            ch = rows[y - 1][x - 1]
            return ch if ch != '.' else None
        # Below the last row the body continues off the icon: no outline there.
        if y > len(rows) and 1 <= x <= len(rows[-1]) and rows[-1][x - 1] != '.':
            return 'B'
        return None
    px = {}
    for y in range(h):
        for x in range(w):
            ch = at(x, y)
            if ch and y <= len(rows):
                c = PAL[ch]
                if ch not in FLAT:
                    if not at(x, y - 1):
                        c = mix(c, 255, 0.3)
                    elif not at(x + 1, y):
                        c = mix(c, 0, 0.15)
                px[(x, y)] = c
            elif not ch and (at(x - 1, y) or at(x + 1, y) or at(x, y - 1) or at(x, y + 1)):
                px[(x, y)] = OUTLINE
    return px, w, h

BAYER = [[0, 2], [3, 1]]
SKY = [hexrgb(c) for c in ['#2a1a4f', '#5a2a6e', '#a3407a', '#e8706b', '#ffb06b']]

def draw(n):
    """An n×n icon (n ≥ 32): sky, sun, stars, then the warrior bust at 2×."""
    img = [[None] * n for _ in range(n)]
    band = n / len(SKY)
    for y in range(n):
        b = min(len(SKY) - 1, int(y / band))
        into = y - b * band
        for x in range(n):
            c = SKY[b]
            if b < len(SKY) - 1 and into >= band - 3:
                ratio = (into - (band - 3) + 1) / 4
                if BAYER[y % 2][x % 2] / 4 < ratio:
                    c = SKY[b + 1]
            img[y][x] = c
    # Sun in the open sky at top left, with a dithered glow.
    sx, sy, r = 5, 6, 3
    for y in range(n):
        for x in range(n):
            d = ((x - sx) ** 2 + (y - sy) ** 2) ** 0.5
            if d <= r:
                img[y][x] = hexrgb('#ffe08a')
            elif d <= r + 2 and (x + y) % 2 == 0:
                img[y][x] = hexrgb('#ff9f6b')
    for x, y in [(12, 2), (n - 4, 3), (n - 10, 1), (n - 3, 9), (1, 14)]:
        img[y][x] = (255, 255, 255)

    px, w, h = sprite_pixels(HERO_TOP)
    scale = 2
    ox = (n - w * scale) // 2
    oy = n - (h - 1) * scale  # the bottom outline row falls off the icon
    for (x, y), c in px.items():
        for dy in range(scale):
            for dx in range(scale):
                X, Y = ox + x * scale + dx, oy + y * scale + dy
                if 0 <= X < n and 0 <= Y < n:
                    img[Y][X] = c
    return img

def upscale(img, k):
    return [[c for c in row for _ in range(k)] for row in img for _ in range(k)]

def write_png(path, img):
    h, w = len(img), len(img[0])
    raw = b''.join(b'\x00' + bytes(v for c in row for v in c) for row in img)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(data)

os.makedirs(OUT, exist_ok=True)
base32, base36 = draw(32), draw(36)
outputs = {
    'icon-32.png': base32,                 # browser tab
    'icon-180.png': upscale(base36, 5),    # iPhone home screen
    'icon-192.png': upscale(base32, 6),    # Android home screen
    'icon-512.png': upscale(base32, 16),   # Android splash / install
}
for name, img in outputs.items():
    write_png(os.path.join(OUT, name), img)
    print(name, len(img), 'px')
