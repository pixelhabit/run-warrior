// Chiptune sound effects made with the Web Audio API (no sound files).

const KEY = 'run-warrior:muted';
let ctx = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* storage blocked */ }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.12, delay = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const gain = c.createGain();
  src.buffer = buffer;
  gain.gain.setValueAtTime(vol, t);
  src.connect(gain).connect(c.destination);
  src.start(t);
}

const play = (fn) => () => {
  if (muted) return;
  try { fn(); } catch { /* audio unavailable */ }
};

let lastBlip = 0;

export const sfx = {
  blip: play(() => {
    const now = performance.now();
    if (now - lastBlip < 45) return;
    lastBlip = now;
    tone(740, 0.03, { vol: 0.025 });
  }),
  select: play(() => {
    tone(660, 0.06, { vol: 0.05 });
    tone(990, 0.08, { vol: 0.05, delay: 0.06 });
  }),
  start: play(() => {
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.1, { vol: 0.05, delay: i * 0.07 }));
    tone(1047, 0.25, { vol: 0.05, delay: 0.3 });
  }),
  dash: play(() => tone(220, 0.12, { vol: 0.04, slide: 300, type: 'triangle' })),
  slash: play(() => {
    noise(0.1, { vol: 0.08 });
    tone(900, 0.1, { vol: 0.03, slide: -600, type: 'sawtooth' });
  }),
  hit: play(() => {
    noise(0.16, { vol: 0.16 });
    tone(200, 0.18, { vol: 0.07, slide: -140 });
  }),
  die: play(() => {
    [440, 370, 311, 262, 220, 165].forEach((f, i) => tone(f, 0.09, { vol: 0.05, delay: i * 0.08 }));
  }),
  win: play(() => {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    const times = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.7, 0.85];
    notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.45 : 0.1, { vol: 0.05, delay: times[i] }));
    tone(131, 0.9, { vol: 0.04, type: 'triangle', delay: 0.3 });
  }),
  block: play(() => {
    tone(1320, 0.06, { vol: 0.05 });
    tone(1760, 0.12, { vol: 0.04, delay: 0.04, type: 'triangle' });
    noise(0.05, { vol: 0.05 });
  }),
  hurt: play(() => {
    noise(0.12, { vol: 0.12 });
    tone(330, 0.2, { vol: 0.06, slide: -220, type: 'sawtooth' });
  }),
  ko: play(() => {
    [392, 330, 262, 196, 131].forEach((f, i) => tone(f, 0.16, { vol: 0.05, delay: i * 0.14, type: 'triangle' }));
  }),
  heal: play(() => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.08, { vol: 0.035, delay: i * 0.05 }));
  }),
  error: play(() => {
    tone(160, 0.12, { vol: 0.06, type: 'sawtooth' });
    tone(120, 0.18, { vol: 0.06, type: 'sawtooth', delay: 0.12 });
  }),
};
