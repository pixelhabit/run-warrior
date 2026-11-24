// Animated pixel-art battle scene: layered background, ambient weather and
// hit effects, all drawn on low-resolution canvases scaled up with crisp pixels.

export const SCENE_W = 160;
export const SCENE_H = 100;
export const GROUND_Y = 82;
export const FEET_Y = 86;
const PERIOD = 320; // background layers repeat every 320px so they can scroll

const BAYER = [[0, 2], [3, 1]];

export const THEMES = {
  meadow: {
    sky: ['#2a1a4f', '#5a2a6e', '#a3407a', '#e8706b', '#ffb06b'],
    orb: { x: 118, y: 56, r: 11, c: '#ffe08a', glow: '#ff9f6b' },
    stars: 16,
    far: { c: '#5a3a7a', base: 58, terms: [[6, 2, 0], [4, 5, 1], [2, 11, 2]] },
    mid: { c: '#2f7a5a', base: 71, terms: [[4, 3, 1], [3, 7, 0.4]] },
    ground: { top: '#8ce06b', base: '#4caf50', dark: '#2f7a3f', deco: 'flowers' },
    ambient: 'petals',
  },
  forest: {
    sky: ['#07131f', '#0c2433', '#123a47', '#1d5458', '#2a6b62'],
    orb: { x: 34, y: 18, r: 7, c: '#eaf6ff', glow: '#6fb3c9' },
    stars: 40,
    far: { c: '#123544', base: 56, terms: [[5, 2, 2], [3, 6, 0]] },
    mid: { c: '#0a2229', kind: 'pines' },
    ground: { top: '#3f7a4a', base: '#24503a', dark: '#163528', deco: 'grass' },
    ambient: 'fireflies',
  },
  mountain: {
    sky: ['#151d3b', '#22346a', '#3c5a9e', '#6f93cf', '#b4cdee'],
    orb: { x: 128, y: 20, r: 6, c: '#ffffff', glow: '#b4cdee' },
    stars: 24,
    far: { c: '#4c5c8f', base: 44, terms: [[14, 2, 0], [9, 5, 1.3], [4, 13, 0.2]], snow: '#eef4ff' },
    mid: { c: '#2e3866', base: 66, terms: [[8, 3, 2], [4, 9, 0.5]], snow: '#c9d6f2' },
    ground: { top: '#b8c4dc', base: '#7d87a8', dark: '#565f80', deco: 'rocks' },
    ambient: 'snow',
  },
  volcano: {
    sky: ['#0d0408', '#2a0a14', '#4f1219', '#8a2318', '#d4521f'],
    stars: 8,
    far: { c: '#2a0d14', kind: 'volcano' },
    mid: { c: '#170609', base: 73, terms: [[6, 4, 1], [4, 9, 2], [2, 17, 0]] },
    ground: { top: '#6a3226', base: '#2e1414', dark: '#1a0a0a', deco: 'lava' },
    ambient: 'embers',
  },
};

// --- Helpers ---

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const wave = (x, terms) => terms.reduce((s, [a, k, p]) => s + a * Math.sin((2 * Math.PI * k * x) / PERIOD + p), 0);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const a = Math.abs(amount);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (target - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const dither = (x, y, ratio) => BAYER[y % 2][x % 2] / 4 < ratio;

// --- Static layers ---

function paintSky(theme) {
  const c = makeCanvas(SCENE_W, SCENE_H);
  const ctx = c.getContext('2d');
  const cols = theme.sky;
  const band = GROUND_Y / cols.length;
  for (let y = 0; y < SCENE_H; y++) {
    const b = Math.min(cols.length - 1, Math.floor(y / band));
    const into = y - b * band;
    for (let x = 0; x < SCENE_W; x++) {
      let col = cols[b];
      if (b < cols.length - 1 && into >= band - 3) {
        const ratio = (into - (band - 3) + 1) / 4;
        if (dither(x, y, ratio)) col = cols[b + 1];
      }
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const o = theme.orb;
  if (o) {
    for (let dy = -o.r - 3; dy <= o.r + 3; dy++) {
      for (let dx = -o.r - 3; dx <= o.r + 3; dx++) {
        const d = Math.hypot(dx, dy);
        const x = o.x + dx, y = o.y + dy;
        if (d <= o.r) ctx.fillStyle = o.c;
        else if (d <= o.r + 3 && dither(x, y, 0.5 - (d - o.r) / 8)) ctx.fillStyle = o.glow;
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // A couple of craters / sun spots for character.
    ctx.fillStyle = tint(o.c, -0.12);
    ctx.fillRect(o.x - 2, o.y - 1, 2, 2);
    ctx.fillRect(o.x + 2, o.y + 2, 1, 1);
  }
  return c;
}

function paintFar(theme, rand) {
  const spec = theme.far;
  const c = makeCanvas(PERIOD, SCENE_H);
  const ctx = c.getContext('2d');
  for (let x = 0; x < PERIOD; x++) {
    let top;
    if (spec.kind === 'volcano') {
      const cone = 30 + Math.abs(x - 62) * 1.1;
      top = Math.round(Math.min(Math.max(cone, 36), 62 + wave(x, [[4, 3, 0], [3, 7, 1]])));
    } else {
      top = Math.round(spec.base + wave(x, spec.terms));
    }
    ctx.fillStyle = spec.c;
    ctx.fillRect(x, top, 1, SCENE_H - top);
    ctx.fillStyle = tint(spec.c, 0.18);
    ctx.fillRect(x, top, 1, 1);
    if (spec.snow && top < spec.base - 3) {
      ctx.fillStyle = spec.snow;
      ctx.fillRect(x, top, 1, Math.min(4, Math.round((spec.base - top) / 4)));
    }
  }
  if (spec.kind === 'volcano') {
    // Glowing crater and lava streaks.
    for (let x = 57; x <= 67; x++) {
      for (let y = 31; y < 36; y++) {
        if (dither(x, y, (y - 30) / 6)) {
          ctx.fillStyle = '#ff6a1a';
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(x, 36, 1, 1);
    }
    ctx.fillStyle = '#ff6a1a';
    ctx.fillRect(59, 37, 1, 9);
    ctx.fillRect(60, 45, 1, 6);
    ctx.fillRect(65, 37, 1, 5);
    ctx.fillRect(66, 41, 1, 4);
  }
  return c;
}

function paintMid(theme, rand) {
  const spec = theme.mid;
  const c = makeCanvas(PERIOD, SCENE_H);
  const ctx = c.getContext('2d');
  if (spec.kind === 'pines') {
    ctx.fillStyle = spec.c;
    ctx.fillRect(0, GROUND_Y - 4, PERIOD, SCENE_H);
    let x = 2;
    while (x < PERIOD - 4) {
      const h = 14 + Math.floor(rand() * 18);
      const top = GROUND_Y - h;
      for (let i = 0; i < h; i++) {
        let half = Math.max(1, Math.floor(i / 2.2));
        if (i > 5 && i % 6 < 2) half -= 2;
        half = Math.max(1, half);
        ctx.fillStyle = i === 0 ? tint(spec.c, 0.25) : spec.c;
        ctx.fillRect(x - half, top + i, half * 2 + 1, 1);
        ctx.fillStyle = tint(spec.c, 0.12);
        ctx.fillRect(x - half, top + i, 1, 1);
      }
      x += 6 + Math.floor(rand() * 9);
    }
    return c;
  }
  for (let x = 0; x < PERIOD; x++) {
    const top = Math.round(spec.base + wave(x, spec.terms));
    ctx.fillStyle = spec.c;
    ctx.fillRect(x, top, 1, SCENE_H - top);
    ctx.fillStyle = tint(spec.c, 0.15);
    ctx.fillRect(x, top, 1, 1);
    if (spec.snow && top < spec.base - 4) {
      ctx.fillStyle = spec.snow;
      ctx.fillRect(x, top, 1, 2);
    }
  }
  return c;
}

function paintGround(theme, rand) {
  const g = theme.ground;
  const c = makeCanvas(PERIOD, SCENE_H);
  const ctx = c.getContext('2d');
  const put = (x, y, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  for (let y = GROUND_Y; y < SCENE_H; y++) {
    for (let x = 0; x < PERIOD; x++) {
      let col = g.base;
      if (y === GROUND_Y) col = g.top;
      else if (y === GROUND_Y + 1) col = dither(x, y, 0.5) ? g.top : g.base;
      else if (y >= SCENE_H - 3) col = g.dark;
      else if (y >= SCENE_H - 5) col = dither(x, y, 0.5) ? g.dark : g.base;
      put(x, y, col);
    }
  }
  for (let i = 0; i < 160; i++) {
    put(Math.floor(rand() * PERIOD), GROUND_Y + 3 + Math.floor(rand() * 11), g.dark);
  }
  if (g.deco === 'flowers') {
    const colors = ['#ffffff', '#ffd84d', '#ff8fb1'];
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rand() * PERIOD), y = GROUND_Y + 2 + Math.floor(rand() * 9);
      put(x, y, colors[i % 3]);
    }
    for (let i = 0; i < 50; i++) put(Math.floor(rand() * PERIOD), GROUND_Y - 1, g.top);
  } else if (g.deco === 'grass') {
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(rand() * PERIOD);
      put(x, GROUND_Y - 1, g.top);
      if (rand() < 0.4) put(x, GROUND_Y - 2, g.top);
    }
  } else if (g.deco === 'rocks') {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rand() * PERIOD), y = GROUND_Y + 3 + Math.floor(rand() * 10);
      ctx.fillStyle = g.dark;
      ctx.fillRect(x, y, 4, 2);
      ctx.fillStyle = '#dfe6f5';
      ctx.fillRect(x, y, 3, 1);
    }
  } else if (g.deco === 'lava') {
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rand() * PERIOD), y = GROUND_Y + 4 + Math.floor(rand() * 9);
      const len = 3 + Math.floor(rand() * 7);
      ctx.fillStyle = '#ff6a1a';
      ctx.fillRect(x, y, len, 1);
      put(x + Math.floor(len / 2), y, '#ffd84d');
    }
  }
  return c;
}

// --- Ambient weather ---

function makeAmbient(kind, rand) {
  const count = { petals: 14, fireflies: 12, snow: 45, embers: 24 }[kind] ?? 0;
  return Array.from({ length: count }, () => ({
    x: rand() * SCENE_W,
    y: rand() * GROUND_Y,
    ph: rand() * Math.PI * 2,
    sp: 0.5 + rand(),
  }));
}

function drawAmbient(ctx, kind, list, t, f) {
  for (const p of list) {
    let col;
    if (kind === 'petals') {
      p.x -= 0.22 * p.sp * f;
      p.y += (0.12 + Math.sin(t * 2 + p.ph) * 0.08) * f;
      col = p.ph > 3 ? '#ffd1dc' : '#ffffff';
    } else if (kind === 'fireflies') {
      p.x += Math.sin(t * 0.7 + p.ph) * 0.15 * f;
      p.y += Math.cos(t * 0.9 + p.ph) * 0.1 * f;
      const glow = Math.sin(t * 3 + p.ph);
      if (glow < -0.2) continue;
      if (glow > 0.6) {
        ctx.fillStyle = 'rgba(217,255,107,0.35)';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
        ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
      }
      col = '#e9ff8a';
    } else if (kind === 'snow') {
      p.y += 0.25 * p.sp * f;
      p.x += Math.sin(t + p.ph) * 0.12 * f;
      col = p.sp > 1.1 ? '#ffffff' : '#c9d6f2';
    } else if (kind === 'embers') {
      p.y -= 0.3 * p.sp * f;
      p.x += Math.sin(t * 2 + p.ph) * 0.15 * f;
      col = p.y > 50 ? '#ffd84d' : p.y > 25 ? '#ff8a2a' : '#c23a1a';
    }
    if (p.y > GROUND_Y) { p.y = -2; p.x = Math.random() * SCENE_W; }
    if (p.y < -3) { p.y = GROUND_Y; p.x = Math.random() * SCENE_W; }
    if (p.x < -2) p.x = SCENE_W + 1;
    if (p.x > SCENE_W + 2) p.x = -1;
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
}

// --- Scene ---

/**
 * Starts an animated scene inside `root`, which must contain canvas.bg and canvas.fx.
 * @param {HTMLElement} root
 * @param {string} themeName key of THEMES
 * @param {{ scroll?: number }} [opts] scroll speed in px/frame (title screen runs)
 */
export function createScene(root, themeName, { scroll = 0 } = {}) {
  const theme = THEMES[themeName] ?? THEMES.meadow;
  const rand = rng(themeName.length * 7919 + 17);
  const bg = root.querySelector('canvas.bg');
  const fxCanvas = root.querySelector('canvas.fx');
  const ctx = bg.getContext('2d');
  const fctx = fxCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const sky = paintSky(theme);
  const far = paintFar(theme, rand);
  const mid = paintMid(theme, rand);
  const ground = paintGround(theme, rand);
  const stars = Array.from({ length: theme.stars }, () => ({
    x: Math.floor(rand() * SCENE_W), y: Math.floor(rand() * GROUND_Y * 0.5), ph: rand() * 6, big: rand() < 0.15,
  }));
  const ambient = makeAmbient(theme.ambient, rand);
  const particles = [];
  const effects = [];

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setUnit = () => root.style.setProperty('--u', `${root.clientWidth / SCENE_W}px`);
  setUnit();
  const ro = new ResizeObserver(setUnit);
  ro.observe(root);

  let offset = 0, t = 0, last = performance.now(), raf = 0;

  const layer = (canvas, off) => {
    const o = Math.floor(off % PERIOD);
    ctx.drawImage(canvas, -o, 0);
    ctx.drawImage(canvas, PERIOD - o, 0);
  };

  function frame(now) {
    const f = Math.min(3, (now - last) / 16.67);
    last = now;
    t += f / 60;
    if (!reduced) offset += scroll * f;

    ctx.drawImage(sky, 0, 0);
    for (const s of stars) {
      const tw = Math.sin(t * 2 + s.ph);
      ctx.fillStyle = tw > 0.2 ? '#ffffff' : '#8f86c9';
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big && tw > 0.6) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
      }
    }
    layer(far, offset * 0.15);
    layer(mid, offset * 0.45);
    layer(ground, offset);
    if (!reduced) drawAmbient(ctx, theme.ambient, ambient, t, f);

    // Effects layer
    fctx.clearRect(0, 0, SCENE_W, SCENE_H);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g * f;
      p.x += p.vx * f;
      p.y += p.vy * f;
      if (p.y > FEET_Y && p.vy > 0) {
        p.y = FEET_Y;
        p.vy *= -0.45;
        p.vx *= 0.7;
      }
      p.life -= f;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.life < 12 && Math.floor(p.life) % 2) continue; // blink out
      fctx.fillStyle = p.c;
      fctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.age += f;
      if (e.age > 18) { effects.splice(i, 1); continue; }
      const p = Math.min(1, e.age / 5);
      const len = 34 * p;
      for (let d = 0; d < len; d++) {
        const x = Math.round(e.x - 17 + d), y = Math.round(e.y - 15 + d * 0.9);
        fctx.fillStyle = e.age > 9 ? '#ffd84d' : '#ffffff';
        fctx.fillRect(x, y, 2, 1);
        if (e.age < 9) {
          fctx.fillStyle = 'rgba(255,216,77,0.6)';
          fctx.fillRect(x - 1, y + 1, 1, 1);
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const spawn = (x, y, colors, n, { speed = 1.6, gravity = 0.06, size } = {}) => {
    const count = reduced ? Math.ceil(n / 4) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.4 + Math.random() * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.9,
        g: gravity,
        life: 30 + Math.random() * 30,
        c: colors[i % colors.length],
        s: size ?? (Math.random() < 0.35 ? 2 : 1),
      });
    }
  };

  return {
    /** Particle burst at scene coordinates. */
    burst: spawn,
    /** Sword slash across a point. */
    slash(x, y) { effects.push({ x, y, age: 0 }); },
    /** A fountain of gold coins. */
    coins(x, y, n = 20) {
      const count = reduced ? 4 : n;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 6, y,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -1.8 - Math.random() * 1.8,
          g: 0.1,
          life: 60 + Math.random() * 40,
          c: i % 3 ? '#ffd84d' : '#fff3b0',
          s: 2,
        });
      }
    },
    /** Scroll speed in px/frame; 0 stops the background. */
    setScroll(v) { scroll = v; },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}
