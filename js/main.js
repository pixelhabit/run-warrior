// App entry point: title and warrior setup, stage map, live GPS fights.

import { loadMonsters } from './monsters.js';
import {
  loadState, saveState, emptyState, loadProfile, saveProfile, hasProfile, displayName,
  loadActiveFight, saveActiveFight, DEFAULT_NAME, NAME_MAX,
} from './storage.js';
import {
  newFight, stepFight, livePace, targetPace, fairPlayCheck, paceSecPerKm,
  WARRIOR_MAX_HP, GRACE_MS, LEVELS,
} from './rules.js';
import { formatDuration, formatPace, formatKm, goalText, formatDay, toDateString } from './format.js';
import { sprite, SPRITES } from './sprites.js';
import { createScene, SCENE_W, SCENE_H, FEET_Y } from './scene.js';
import { sfx, isMuted, setMuted } from './audio.js';
import { createTracker, deviceSource, simulatedGps, gpsSupport } from './gps.js';

const app = document.getElementById('app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Fight positions in scene pixels: close enough to trade blows.
const HERO_X = 54;
const MON_X = 110;
const CLASH_X = 80;

const LEVEL_NAMES = ['Beginner', 'Casual', 'Regular', 'Fast', 'Elite'];

let monsters = [];
let state = loadState();
let profile = loadProfile();
let scene = null;
let cleanups = [];
let typing = null;
let live = null; // the fight being run: { monster, status, fight, tracker, date }
let anims = Promise.resolve(); // fight animations play one after another

// Add ?simulate to the URL to fake a GPS run (optionally ?simulate=330&speed=20:
// pace in sec/km and how many times faster than real time).
const params = new URLSearchParams(location.search);
const sim = params.has('simulate')
  ? simulatedGps({ pace: Number(params.get('simulate')) || 360, speedup: Number(params.get('speed')) || 20 })
  : null;

// --- Small helpers ---

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const today = () => toDateString(new Date());
const q = (sel) => app.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 60) : ms));
const pct = (x) => (x / SCENE_W) * 100;
const upper = (s) => s.toUpperCase();
const heroArt = () => profile.character;
const name = () => displayName(profile);
const byStage = () => [...monsters].sort((a, b) => a.stage - b.stage);
const byId = (id) => monsters.find((m) => m.id === id);
const isBeaten = (m) => !!state.beaten[m.id];
const isUnlocked = (m) => m.stage === 1 || byStage().some((p) => p.stage === m.stage - 1 && isBeaten(p));
const nextMonster = (m) => byStage().find((n) => n.stage === m.stage + 1) ?? null;
const paceText = (sec) => (sec == null || sec === Infinity || !Number.isFinite(sec) ? '--:--' : formatDuration(sec));

function spriteImg(art, { frame = 0, cls = '', alt = '' } = {}) {
  const s = sprite(art, frame);
  const w = s.w * (SPRITES[art].scale ?? 2);
  return `<img class="${cls}" src="${s.url}" alt="${esc(alt)}" width="${s.w}" height="${s.h}" style="--w:${w}" draggable="false">`;
}

/** Vertical middle and top of a sprite standing on the ground, in scene pixels. */
function spriteBox(art) {
  const h = sprite(art).h * SPRITES[art].scale;
  return { mid: FEET_Y - h / 2, top: FEET_Y - h };
}

/** Pace targets at a level across all monsters, e.g. '8:15–9:00/km'. */
function levelRange(level) {
  const paces = monsters.map((m) => targetPace(m, level));
  const lo = Math.min(...paces), hi = Math.max(...paces);
  return lo === hi ? formatPace(lo) : `${formatDuration(lo)}–${formatPace(hi)}`;
}

// --- Screen plumbing ---

function mount(html, theme, opts) {
  stopLive();
  cleanups.forEach((fn) => fn());
  cleanups = [];
  typing?.cancel();
  scene?.destroy();
  scene = null;
  app.innerHTML = html;
  window.scrollTo(0, 0);
  const root = q('.scene');
  if (root) scene = createScene(root, theme, opts);
  q('#sound')?.addEventListener('click', toggleSound);
  q('#edit-warrior')?.addEventListener('click', renderProfileEdit);
  q('#to-map')?.addEventListener('click', () => renderMap());
  q('#reset')?.addEventListener('click', resetProgress);
}

const canvases = () => `<canvas class="bg" width="${SCENE_W}" height="${SCENE_H}"></canvas>`;
const fxCanvas = () => `<canvas class="fx" width="${SCENE_W}" height="${SCENE_H}"></canvas>`;

function topbar() {
  return `<header class="topbar">
    <span class="brand">RUN WARRIOR</span>
    <button class="icon-btn" id="sound" aria-pressed="${!isMuted()}">${soundLabel()}</button>
  </header>`;
}

const soundLabel = () => (isMuted() ? '♪ OFF' : '♪ ON');

function toggleSound(e) {
  setMuted(!isMuted());
  e.currentTarget.textContent = soundLabel();
  e.currentTarget.setAttribute('aria-pressed', String(!isMuted()));
  sfx.select();
}

function resetProgress() {
  if (!confirm('Reset all progress? Beaten monsters and fight history will be cleared.')) return;
  saveActiveFight(null);
  state = emptyState();
  saveState(state);
  renderMap();
}

async function whiteFlash(then) {
  const el = document.createElement('div');
  el.className = 'wipe';
  document.body.appendChild(el);
  await sleep(220);
  then();
  await sleep(400);
  el.remove();
}

const dialogHtml = () => `<div class="dialog" id="dialog">
    <p class="dialog-text" aria-hidden="true"></p>
    <p class="sr" role="status" aria-live="polite"></p>
    <span class="caret" aria-hidden="true">▼</span>
  </div>`;

/** Types a line into the dialog box. Click the box to finish it at once. */
function say(text, tone = '') {
  const box = q('#dialog');
  if (!box) return Promise.resolve();
  typing?.cancel();
  const out = box.querySelector('.dialog-text');
  box.querySelector('.sr').textContent = text;
  box.className = `dialog ${tone}`;
  return new Promise((resolve) => {
    let i = 0;
    let id = 0;
    const finish = () => {
      clearInterval(id);
      out.textContent = text;
      box.classList.add('done');
      typing = null;
      resolve();
    };
    typing = { cancel: () => { clearInterval(id); resolve(); }, finish };
    box.onclick = () => typing?.finish();
    if (reduced) return finish();
    out.textContent = '';
    id = setInterval(() => {
      i += 1;
      out.textContent = text.slice(0, i);
      if (text[i - 1] !== ' ') sfx.blip();
      if (i >= text.length) finish();
    }, 22);
  });
}

function complain(text) {
  sfx.error();
  q('#dialog')?.animate?.(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
    { duration: reduced ? 1 : 240, easing: 'steps(4)' },
  );
  say(text, 'bad');
}

// --- Router ---

function render() {
  if (!hasProfile()) return renderTitle();
  const active = loadActiveFight();
  const monster = active && byId(active.monsterId);
  if (monster) return renderBattle(monster, { restore: active });
  if (active) saveActiveFight(null);
  renderMap();
}

// --- Warrior profile ---

function profileHtml() {
  const cards = [['hero', 'MALE'], ['heroine', 'FEMALE']].map(([art, label]) => `
    <label class="pick-card">
      <input type="radio" name="character" value="${art}" ${profile.character === art ? 'checked' : ''}>
      ${spriteImg(art, { alt: '' })}
      <span>${label}</span>
    </label>`).join('');
  const levels = LEVELS.map((l) => `
    <label class="level-pick">
      <input type="radio" name="level" value="${l}" ${profile.level === l ? 'checked' : ''}>
      <span>${l}</span>
    </label>`).join('');
  return `<section class="panel setup" id="setup">
      <h2 class="panel-title">YOUR WARRIOR</h2>
      <label class="field"><span>Name</span>
        <input type="text" id="p-name" maxlength="${NAME_MAX}" value="${esc(profile.name)}"
               placeholder="${DEFAULT_NAME}" autocomplete="nickname" spellcheck="false">
      </label>
      <div class="field" role="radiogroup" aria-label="Character">
        <span>Character</span>
        <div class="pick">${cards}</div>
      </div>
      <div class="field" role="radiogroup" aria-label="Level">
        <span>Level <i class="muted">1 = slow runners · 5 = fast runners</i></span>
        <div class="levels">${levels}</div>
        <p class="level-note" id="level-note">${levelNote(profile.level)}</p>
      </div>
    </section>`;
}

function levelNote(level) {
  return `<b>LV${level} · ${LEVEL_NAMES[level - 1].toUpperCase()}</b> Pace targets ${esc(levelRange(level))}`;
}

function readProfileForm() {
  const art = q('input[name="character"]:checked')?.value;
  const level = Number(q('input[name="level"]:checked')?.value) || 1;
  return {
    name: (q('#p-name')?.value ?? '').trim().slice(0, NAME_MAX),
    character: art === 'heroine' ? 'heroine' : 'hero',
    level: Math.min(5, Math.max(1, level)),
  };
}

function bindProfileForm() {
  app.querySelectorAll('input[name="character"]').forEach((input) => input.addEventListener('change', () => {
    sfx.select();
    const img = q('.scene .hero img');
    if (img) img.src = sprite(readProfileForm().character).url;
  }));
  app.querySelectorAll('input[name="level"]').forEach((input) => input.addEventListener('change', () => {
    sfx.select();
    q('#level-note').innerHTML = levelNote(readProfileForm().level);
  }));
}

// --- Title (first visit) ---

function renderTitle() {
  mount(`
    <div class="screen title-screen">
      ${topbar()}
      <div class="scene scene--title">
        ${canvases()}
        <h1 class="logo"><span>RUN</span><span>WARRIOR</span></h1>
        <div class="actor hero" style="--x:50"><div class="body"><div class="stance">${spriteImg(heroArt(), { alt: 'Your warrior running' })}</div></div></div>
        ${fxCanvas()}
      </div>
      <p class="lead center tagline">Monsters block the trail. Beat each one with a real run, at your own pace, whenever you're ready.</p>
      ${profileHtml()}
      <button class="btn btn--big btn--pulse" id="start">PRESS START</button>
    </div>`, 'meadow', { scroll: 0.6 });

  const img = q('.hero img');
  let frame = 0;
  const id = setInterval(() => {
    frame ^= 1;
    img.src = sprite(readProfileForm().character, frame).url;
  }, 150);
  cleanups.push(() => clearInterval(id));
  bindProfileForm();

  q('#start').addEventListener('click', () => {
    profile = readProfileForm();
    saveProfile(profile);
    sfx.start();
    whiteFlash(() => renderMap());
  });
}

function renderProfileEdit() {
  mount(`
    <div class="screen">
      ${topbar()}
      <div class="scene">
        ${canvases()}
        <div class="actor hero" style="--x:50"><div class="body"><div class="stance">${spriteImg(heroArt(), { cls: 'idle-bob', alt: name() })}</div></div></div>
        ${fxCanvas()}
      </div>
      ${profileHtml()}
      <button class="btn btn--big" id="save-warrior">SAVE</button>
      <footer class="foot"><button class="link" id="back">Back</button></footer>
    </div>`, 'meadow');
  bindProfileForm();
  q('#save-warrior').addEventListener('click', () => {
    profile = readProfileForm();
    saveProfile(profile);
    sfx.start();
    whiteFlash(render);
  });
  q('#back').addEventListener('click', render);
}

// --- Stage map ---

function stageStatus(m) {
  if (isBeaten(m)) return 'won';
  return isUnlocked(m) ? 'open' : 'locked';
}

function renderMap() {
  const list = byStage();
  const champion = list.every(isBeaten);
  const totalKm = state.runs.reduce((s, r) => s + r.distanceKm, 0);

  const cards = list.map((m) => {
    const status = stageStatus(m);
    const best = state.best[m.id];
    const badge = status === 'won' ? '✓ BEATEN' : status === 'locked' ? 'LOCKED' : 'FIGHT!';
    return `<li>
      <button class="stage ${status}" data-stage="${m.id}" ${status === 'locked' ? 'disabled' : ''}>
        <span class="stage-art">${spriteImg(m.art, { cls: status === 'locked' ? 'sil' : '', alt: '' })}</span>
        <span class="stage-info">
          <span class="stage-num">STAGE ${m.stage}${m.boss ? ' · <i class="boss">BOSS</i>' : ''}</span>
          <b class="stage-name">${status === 'locked' ? '???' : esc(upper(m.name))}</b>
          <span class="stage-dist">${esc(formatKm(m.goal.distanceKm))}</span>
          <span class="stage-pace">${esc(formatPace(targetPace(m, profile.level)))} · LV${profile.level}</span>
          ${best && status !== 'won' ? `<span class="stage-best">BEST ${Math.round(best * 100)}%</span>` : ''}
        </span>
        <span class="stage-badge">${badge}</span>
      </button>
    </li>`;
  }).join('');

  mount(`
    <div class="screen map-screen">
      ${topbar()}
      <div class="scene scene--map">
        ${canvases()}
        <div class="actor hero" style="--x:50"><div class="body"><div class="stance">${spriteImg(heroArt(), { cls: 'idle-bob', alt: name() })}</div></div></div>
        ${fxCanvas()}
        <div class="hud hud--hero hud--card">
          <b>${esc(upper(name()))}</b>
          <span>LEVEL ${profile.level} · ${esc(upper(LEVEL_NAMES[profile.level - 1]))}</span>
        </div>
        <div class="banner" id="banner" aria-hidden="true"></div>
      </div>
      ${champion ? `<section class="panel center champion">
          <h2 class="panel-title">CHAMPION!</h2>
          <p>${esc(name())} defeated every monster.</p>
          <dl class="stats">
            <div><dt>Monsters</dt><dd>${list.length}/${list.length}</dd></div>
            <div><dt>Distance</dt><dd>${esc(formatKm(totalKm))}</dd></div>
            <div><dt>Fights</dt><dd>${state.runs.length}</dd></div>
          </dl>
          <button class="btn btn--big" id="new-campaign">NEW CAMPAIGN</button>
        </section>` : ''}
      <h2 class="section-title">CHOOSE YOUR FOE</h2>
      <ol class="stages">${cards}</ol>
      <p class="muted center map-note">Fight any open stage whenever you're ready. Beat a stage to unlock the next.</p>
      <footer class="foot">
        <button class="link" id="edit-warrior">Edit warrior</button>
        <button class="link" id="reset">Reset progress</button>
      </footer>
    </div>`, champion ? 'meadow' : list.find((m) => stageStatus(m) === 'open')?.scene ?? 'meadow');

  app.querySelectorAll('[data-stage]').forEach((btn) => btn.addEventListener('click', () => {
    sfx.select();
    const m = byId(btn.dataset.stage);
    whiteFlash(() => renderBattle(m));
  }));

  if (champion) {
    showBanner('CHAMPION!');
    const id = setInterval(() => scene?.coins(SCENE_W / 2, FEET_Y - 20, 12), 1600);
    scene.coins(SCENE_W / 2, FEET_Y - 20, 24);
    cleanups.push(() => clearInterval(id));
    q('#new-campaign').addEventListener('click', () => {
      if (!confirm('Start a new campaign? Beaten monsters will be locked again.')) return;
      state = emptyState();
      saveState(state);
      sfx.start();
      whiteFlash(() => renderMap());
    });
  }
}

// --- Battle ---

function miniMapHtml(current) {
  return byStage().map((m) => {
    const status = m.id === current.id ? 'now' : stageStatus(m) === 'won' ? 'won' : stageStatus(m) === 'locked' ? 'soon' : 'open';
    return `<li class="node ${status}">
      <div class="node-art">${spriteImg(m.art, { cls: status === 'soon' ? 'sil' : '', alt: '' })}</div>
      <span class="node-label">${status === 'soon' ? '???' : esc(upper(m.name))}</span>
      <span class="node-dist">${esc(formatKm(m.goal.distanceKm))}</span>
    </li>`;
  }).join('');
}

function hpClass(hp, max) {
  const r = hp / max;
  return r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low';
}

function hpBarHtml(which, label, hp, max) {
  return `<div class="hpbar ${which} ${hpClass(hp, max)}" data-bar="${which}" role="meter" aria-label="${esc(label)} HP"
       aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${hp}">
    <div class="lag" style="width:${(hp / max) * 100}%"></div>
    <div class="fill" style="width:${(hp / max) * 100}%"></div>
  </div>
  <span class="hpnum">HP <span data-num="${which}">${hp}</span>/${max}</span>`;
}

function foeStatsHtml(m) {
  return `<section class="panel foe-stats">
      <h2 class="panel-title">${esc(upper(m.name))} STATS</h2>
      <dl class="stats stats--4">
        <div><dt>Distance</dt><dd>${esc(formatKm(m.goal.distanceKm))}</dd></div>
        <div><dt>Pace</dt><dd>${esc(formatDuration(targetPace(m, profile.level)))}</dd></div>
        <div><dt>HP</dt><dd>${m.hp}</dd></div>
        <div><dt>Attack</dt><dd class="atk">${m.attack}</dd></div>
      </dl>
      <p class="rule">Every 30 seconds you trade blows. Your strikes land as you cover distance.
        Hold <b>${esc(formatPace(targetPace(m, profile.level)))}</b> or faster to block its attack;
        fall behind and it hits you for up to <b class="atk">${m.attack}</b>. The first minute is a warm-up.</p>
    </section>`;
}

function historyHtml(m) {
  const runs = state.runs.filter((r) => r.monsterId === m.id).slice(-5).reverse();
  if (!runs.length) return '';
  const label = { won: '<b class="ko">WON</b>', lost: '<b class="taken">KO</b>', retreat: '<b class="muted">RETREAT</b>' };
  return `<section class="panel log">
      <h2 class="panel-title">FIGHT LOG</h2>
      <ul class="runs">${runs.map((r) => `<li class="${r.result === 'won' ? 'kill' : ''}">
        <span class="d">${esc(formatDay(r.date))}</span>
        <span class="r">${esc(formatKm(r.distanceKm))} · ${esc(formatDuration(r.durationSec))}
          <small>${r.distanceKm > 0.02 ? esc(formatPace(paceSecPerKm(r))) : ''}</small></span>
        <span class="dmg">${label[r.result] ?? ''}</span>
        <span class="hits">LV${r.level} · ${Math.round(r.progress * 100)}% of ${esc(formatKm(m.goal.distanceKm))}</span>
      </li>`).join('')}</ul>
    </section>`;
}

function trackerHtml(m) {
  return `<section class="panel tracker" id="tracker">
      <h2 class="panel-title">FIGHT${sim ? ' <i class="sim">SIMULATED GPS</i>' : ''}</h2>
      <div class="readouts">
        <div><span>Distance</span><b id="t-dist">0.00</b><small>OF ${esc(formatKm(m.goal.distanceKm).toUpperCase())}</small></div>
        <div><span>Time</span><b id="t-time">0:00</b><small>&nbsp;</small></div>
        <div><span>Live pace</span><b id="t-pace">--:--</b><small>/KM</small></div>
      </div>
      <p class="pace-status" id="t-status">TARGET ${esc(formatPace(targetPace(m, profile.level)).toUpperCase())}</p>
      <div class="goalbar" aria-hidden="true"><div class="goalfill" id="t-goal"></div></div>
      <p class="gps" id="t-gps"><span class="dot"></span><span id="t-gps-text">GPS off</span></p>
      <div class="tracker-buttons" id="t-buttons"></div>
      <p class="wake idle" id="t-wake" role="status"></p>
      <p class="hint">Keep this tab open while you run.</p>
    </section>`;
}

function renderBattle(monster, { restore = null, outcome = null } = {}) {
  const fight = restore?.fight ?? newFight(monster, profile.level);
  const won = outcome?.result === 'won';
  const sp = SPRITES[monster.art];
  const NAME = upper(monster.name);

  mount(`
    <div class="screen battle">
      ${topbar()}
      <ol class="map" aria-label="Stages">${miniMapHtml(monster)}</ol>
      <div class="scene" id="scene">
        ${canvases()}
        <div class="actor hero" style="--x:${pct(HERO_X)}">
          <div class="body"><div class="stance">${spriteImg(heroArt(), { cls: 'idle-bob', alt: name() })}</div></div>
        </div>
        <div class="actor monster ${won ? 'is-down' : ''}" style="--x:${pct(MON_X)}">
          <div class="body"><div class="stance">${won
            ? spriteImg('grave', { alt: `${monster.name}, defeated` })
            : spriteImg(monster.art, { cls: `idle-${sp.idle}`, alt: monster.name })}</div></div>
        </div>
        ${fxCanvas()}
        <div class="hud hud--hero">
          <b>${esc(upper(name()))}</b>
          ${hpBarHtml('warrior', name(), outcome ? outcome.warriorHp : fight.warriorHp, WARRIOR_MAX_HP)}
        </div>
        <div class="hud hud--foe">
          <b>${esc(NAME)}${monster.boss ? ' <i class="boss">BOSS</i>' : ''}</b>
          ${hpBarHtml('foe', monster.name, outcome ? outcome.monsterHp : fight.monsterHp, monster.hp)}
        </div>
        <div class="week-tag">STAGE ${monster.stage} · <span>${esc(formatKm(monster.goal.distanceKm).toUpperCase())}</span> · LV${fight.level}</div>
        <div class="banner" id="banner" aria-hidden="true"></div>
      </div>
      ${dialogHtml()}
      <div id="below">${outcome ? outcomeHtml(monster, outcome) : trackerHtml(monster)}${foeStatsHtml(monster)}${historyHtml(monster)}</div>
      <footer class="foot">
        <button class="link" id="to-map">Stage map</button>
        <button class="link" id="edit-warrior">Edit warrior</button>
      </footer>
    </div>`, monster.scene);

  if (outcome) {
    bindOutcome(monster, outcome);
    say(outcome.message, outcome.result === 'won' ? 'win' : 'bad');
    return;
  }

  setupFight(monster, restore);
  if (restore?.fight.result) {
    endFight(restore.fight.result); // it ended before the page closed: record it now
  } else if (restore) {
    say(`Your fight is paused at ${formatKm(restore.tracker.distanceKm)}. Press RESUME to keep going.`);
  } else {
    say(`${NAME} blocks the trail! ${goalText(monster, profile.level)} to defeat it.`);
  }
}

// --- Live fight ---

function setupFight(monster, restore) {
  live = {
    monster,
    status: restore ? 'paused' : 'idle',
    fight: restore?.fight ?? newFight(monster, profile.level),
    date: restore?.date ?? today(),
    tracker: restore ? makeTracker(restore.tracker) : null,
    mood: null,
  };
  anims = Promise.resolve();
  updateFightUI(restore ? { ...restore.tracker, running: false, accuracy: null } : null);
  drawButtons();
  q('#tracker').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'start') startFight();
    else if (act === 'pause') pauseFight();
    else if (act === 'retreat') retreat();
  });
}

function makeTracker(restore) {
  return createTracker({
    source: sim ? sim.source : deviceSource(),
    now: sim ? sim.now : () => Date.now(),
    restore,
    onUpdate: (snap) => advance(snap),
    onError: onGpsError,
  });
}

function drawButtons() {
  const el = q('#t-buttons');
  if (!el || !live) return;
  const { status } = live;
  el.innerHTML = status === 'idle'
    ? '<button class="btn btn--big btn--pulse" data-act="start">START FIGHT</button>'
    : `<div class="btn-row">
        ${status === 'running'
          ? '<button class="btn btn--ghost" data-act="pause">PAUSE</button>'
          : '<button class="btn" data-act="start">RESUME</button>'}
        <button class="btn btn--ghost" data-act="retreat">RETREAT</button>
      </div>`;
  q('#tracker').classList.toggle('is-paused', status === 'paused');
  q('#tracker').classList.toggle('is-running', status === 'running');
}

function startFight() {
  if (!sim) {
    const support = gpsSupport();
    if (!support.ok) return complain(support.reason);
  }
  const resuming = live.status === 'paused';
  if (!live.tracker) live.tracker = makeTracker(null);
  live.tracker.start();
  live.status = 'running';
  drawButtons();
  startFightLook();
  lockScreen();
  sfx.start();
  if (!resuming) showBanner('FIGHT!');
  say(resuming
    ? 'Back in the fight! Keep your pace.'
    : `FIGHT! Hold ${formatPace(targetPace(live.monster, live.fight.level))} or faster. The first minute is a warm-up.`);
}

function pauseFight() {
  live.tracker.pause();
  live.status = 'paused';
  persist();
  drawButtons();
  stopFightLook();
  unlockScreen();
  sfx.select();
  say('Fight paused. Nobody attacks until you resume.');
}

function retreat() {
  if (!confirm('Retreat? The fight ends and you can try again any time.')) return;
  endFight('retreat');
}

/** Feeds a tracker snapshot to the fight engine and plays what happened. */
function advance(snap) {
  if (!live || live.status !== 'running') {
    updateFightUI(snap);
    return;
  }
  const { fight, events } = stepFight(live.fight, live.monster, snap);
  live.fight = fight;
  live.snap = snap;
  updateFightUI(snap);
  persist();
  for (const e of events) queueEvent(e);
  if (fight.result) endFight(fight.result);
}

function persist() {
  if (!live?.tracker) return;
  const snap = live.tracker.snapshot();
  saveActiveFight({
    monsterId: live.monster.id,
    date: live.date,
    tracker: { distanceKm: snap.distanceKm, points: snap.points, elapsedMs: snap.elapsedMs },
    fight: live.fight,
  });
}

function onGpsError(err) {
  if (err.code === 1) {
    if (live?.status === 'running') pauseFight();
    complain('Location access is blocked. Allow location for this site in your browser settings, then press RESUME.');
  } else {
    const text = q('#t-gps-text');
    if (text) text.textContent = 'Searching for GPS…';
  }
}

function updateFightUI(snap) {
  if (!live || !q('#tracker')) return;
  const { monster, fight } = live;
  const km = snap?.distanceKm ?? 0;
  const ms = snap?.elapsedMs ?? 0;
  q('#t-dist').textContent = km.toFixed(2);
  q('#t-time').textContent = formatDuration(ms / 1000);
  q('#t-goal').style.width = `${Math.min(1, km / monster.goal.distanceKm) * 100}%`;

  const target = targetPace(monster, fight.level);
  const pace = ms > 0 ? livePace(fight, ms) : null;
  q('#t-pace').textContent = paceText(pace);
  const status = q('#t-status');
  if (live.status !== 'running') {
    status.className = 'pace-status';
    status.textContent = `TARGET ${upper(formatPace(target))}`;
  } else if (ms < GRACE_MS) {
    status.className = 'pace-status warm';
    status.textContent = `WARM-UP ${formatDuration((GRACE_MS - ms) / 1000)} · TARGET ${upper(formatPace(target))}`;
  } else if (pace === null) {
    status.className = 'pace-status';
    status.textContent = 'NO GPS SIGNAL · NO DAMAGE';
  } else if (pace <= target) {
    status.className = 'pace-status good';
    status.textContent = `ON PACE · TARGET ${upper(formatPace(target))}`;
  } else {
    status.className = 'pace-status bad';
    status.textContent = `TOO SLOW · SPEED UP TO ${upper(formatPace(target))}`;
  }

  const gps = q('#t-gps');
  const text = q('#t-gps-text');
  const acc = snap?.accuracy;
  if (live.status !== 'running') {
    gps.className = 'gps';
    text.textContent = live.status === 'paused' ? 'GPS paused' : 'GPS off';
  } else if (acc == null) {
    gps.className = 'gps searching';
    text.textContent = 'Finding GPS…';
  } else {
    gps.className = `gps ${acc <= 12 ? 'good' : acc <= 35 ? 'ok' : 'weak'}`;
    text.textContent = `GPS ±${Math.round(acc)} m${acc > 35 ? ' (weak, move into the open)' : ''}`;
  }
}

/** Ends the fight: records it, then shows the result once the animations finish. */
function endFight(result) {
  if (!live || live.status === 'over') return;
  const { monster, fight } = live;
  live.status = 'over'; // first: stopping the tracker sends one last update
  const snap = live.tracker?.stop() ?? { distanceKm: 0, elapsedMs: 0, points: 0 };
  const run = {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    date: live.date,
    monsterId: monster.id,
    level: fight.level,
    distanceKm: Math.round(snap.distanceKm * 1000) / 1000,
    durationSec: Math.round(snap.elapsedMs / 1000),
    source: 'gps',
    trackPoints: snap.points,
    progress: Math.min(1, snap.distanceKm / monster.goal.distanceKm),
  };
  let outcome = result;
  if (result === 'won' && !fairPlayCheck(run).ok) outcome = 'void';

  saveActiveFight(null);
  unlockScreen();
  q('#t-buttons').innerHTML = '';

  if (outcome !== 'void' && (run.distanceKm > 0 || outcome === 'lost')) {
    state.runs.push({ ...run, result: outcome });
    state.best[monster.id] = Math.max(state.best[monster.id] ?? 0, run.progress);
    if (outcome === 'won') state.beaten[monster.id] = true;
    saveState(state);
  }

  const n = upper(monster.name);
  const pace = run.distanceKm > 0.02 ? ` at ${formatPace(paceSecPerKm(run))}` : '';
  const messages = {
    won: `VICTORY! ${name()} ran ${formatKm(run.distanceKm)} in ${formatDuration(run.durationSec)}${pace} and defeated ${n}!`,
    lost: `${name()} was knocked out at ${formatKm(run.distanceKm)} (${Math.round(run.progress * 100)}%). ${n} wins this round. Rest, then try again.`,
    retreat: `${name()} retreated at ${formatKm(run.distanceKm)} (${Math.round(run.progress * 100)}%). ${n} will be waiting.`,
    void: `That run failed the fair-play check (${fairPlayCheck(run).reason}) and doesn't count.`,
  };

  const finish = { result: outcome, message: messages[outcome], warriorHp: fight.warriorHp, monsterHp: fight.monsterHp };
  anims = anims.then(async () => {
    stopFightLook();
    if (outcome === 'won') await playVictory(monster);
    else if (outcome === 'lost') await playKnockout();
    await sleep(500);
    renderBattle(monster, { outcome: finish });
  });
}

function outcomeHtml(monster, outcome) {
  const next = nextMonster(monster);
  const title = { won: 'VICTORY!', lost: 'KNOCKED OUT', retreat: 'RETREATED', void: 'NOT COUNTED' }[outcome.result];
  const buttons = outcome.result === 'won'
    ? (next ? `<button class="btn btn--big" data-go="next">NEXT: ${esc(upper(next.name))}</button>`
      : '<button class="btn btn--big" data-go="map">CLAIM YOUR CROWN</button>')
    : '<button class="btn btn--big" data-go="again">FIGHT AGAIN</button>';
  return `<section class="panel center outcome ${outcome.result}">
      <h2 class="panel-title">${title}</h2>
      ${outcome.result === 'won' && next ? `<p class="muted">Stage ${next.stage} unlocked: ${esc(formatKm(next.goal.distanceKm))}.</p>` : ''}
      ${buttons}
      ${outcome.result === 'won' && next ? '<button class="link" data-go="map">Stage map</button>' : ''}
    </section>`;
}

function bindOutcome(monster) {
  q('.outcome')?.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (!go) return;
    sfx.select();
    if (go === 'next') whiteFlash(() => renderBattle(nextMonster(monster)));
    else if (go === 'again') renderBattle(monster);
    else renderMap();
  });
}

/** Pauses and saves a fight in progress when leaving the screen. */
function stopLive() {
  if (!live) return;
  if (live.tracker && live.status !== 'over') {
    if (live.status === 'running') live.tracker.pause();
    persist();
    live.tracker.stop();
  }
  stopFightLook();
  unlockScreen();
  live = null;
}

// --- Fight animations ---

let fightLook = null;

/** While the fight runs: hero runs, the world scrolls, blades clash. */
function startFightLook() {
  stopFightLook();
  const root = q('#scene');
  const img = q('.hero img');
  if (!root || !img) return;
  root.classList.add('fighting');
  img.classList.remove('idle-bob');
  let frame = 0;
  const run = setInterval(() => {
    frame ^= 1;
    img.src = sprite(heroArt(), frame).url;
  }, 150);
  const clash = setInterval(() => {
    scene?.burst(CLASH_X, FEET_Y - 16, ['#ffffff', '#ffd84d', '#c9d2e6'], 4, { speed: 1, gravity: 0.08 });
  }, 1200);
  const tick = setInterval(() => live?.tracker && live.status === 'running' && advance(live.tracker.snapshot()), 1000);
  scene?.setScroll(0.35);
  fightLook = { run, clash, tick, img, root };
}

function stopFightLook() {
  if (!fightLook) return;
  clearInterval(fightLook.run);
  clearInterval(fightLook.clash);
  clearInterval(fightLook.tick);
  fightLook.img.src = sprite(heroArt()).url;
  fightLook.img.classList.add('idle-bob');
  fightLook.root.classList.remove('fighting');
  scene?.setScroll(0);
  fightLook = null;
}

let pendingAnims = 0;

function queueEvent(e) {
  pendingAnims += 1;
  anims = anims
    .then(() => playEvent(e))
    .catch((err) => console.error(err))
    .finally(() => { pendingAnims -= 1; });
}

async function playEvent(e) {
  if (!live || !q('#scene')) return;
  const { monster } = live;
  // Catching up (e.g. after the screen slept): skip routine animations, keep the HP bars right.
  if (pendingAnims > 3 && (e.type === 'strike' || e.type === 'block')) {
    if (e.type === 'strike') setHp('foe', live.fight.monsterHp, monster.hp);
    return;
  }
  const target = targetPace(monster, live.fight.level);
  if (e.type === 'strike') await playStrike(monster, e.damage);
  else if (e.type === 'block') {
    await playBlock(monster);
    if (live?.mood !== 'good') say(`Blocked! You're on pace at ${paceText(e.pace)}/km. Keep it up!`);
    if (live) live.mood = 'good';
  } else if (e.type === 'hit') {
    await playHit(monster, e.damage);
    say(e.pace === Infinity
      ? `You stopped! ${upper(monster.name)} hits you for ${e.damage}. Get moving!`
      : `Too slow at ${paceText(e.pace)}/km! ${upper(monster.name)} hits you for ${e.damage}. Speed up to ${formatPace(target)}!`, 'bad');
    if (live) live.mood = 'bad';
  } else if (e.type === 'nosignal' && live?.mood !== 'nosignal') {
    say('Lost the GPS signal. Nobody gets hurt until it comes back.');
    if (live) live.mood = 'nosignal';
  }
}

function floatText(text, x, y, cls = '') {
  const root = q('#scene');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `dmg-num ${cls}`;
  el.textContent = text;
  el.style.left = `${pct(x)}%`;
  el.style.top = `${(y / SCENE_H) * 100}%`;
  root.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function setHp(which, hp, max) {
  const bar = q(`[data-bar="${which}"]`);
  if (!bar) return;
  bar.className = `hpbar ${which} ${hpClass(hp, max)}`;
  bar.setAttribute('aria-valuenow', hp);
  bar.querySelector('.fill').style.width = `${(hp / max) * 100}%`;
  bar.querySelector('.lag').style.width = `${(hp / max) * 100}%`;
  const num = q(`[data-num="${which}"]`);
  const from = Number(num.textContent);
  for (let i = 1; i <= 10; i++) {
    setTimeout(() => { num.textContent = Math.round(from + ((hp - from) * i) / 10); }, i * 30);
  }
}

function shake(px) {
  const el = q('#scene');
  if (reduced || !el?.animate) return;
  el.animate([
    { transform: 'translate(0,0)' },
    { transform: `translate(${-px}px,${px / 2}px)` },
    { transform: `translate(${px}px,${-px / 2}px)` },
    { transform: 'translate(0,0)' },
  ], { duration: 260, easing: 'steps(4)' });
}

function showBanner(text, cls = '') {
  const el = q('#banner');
  if (!el) return;
  el.innerHTML = [...text].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  el.className = `banner show ${cls}`;
  setTimeout(() => el.classList.remove('show'), 2400);
}

/** Restart a CSS animation class on an element. */
function flash(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

async function playStrike(monster, damage) {
  const box = spriteBox(monster.art);
  sfx.slash();
  flash(q('.hero .body'), 'swing');
  await sleep(140);
  scene?.slash(MON_X, box.mid);
  sfx.hit();
  flash(q('.monster .body'), 'hurt');
  scene?.burst(MON_X, box.mid, SPRITES[monster.art].colors, 10);
  floatText(`-${damage}`, MON_X, box.top);
  setHp('foe', live.fight.monsterHp, monster.hp);
  shake(2);
  await sleep(380);
}

async function playBlock(monster) {
  const box = spriteBox(heroArt());
  sfx.dash();
  flash(q('.monster .body'), 'jab');
  await sleep(180);
  sfx.block();
  flash(q('.hero .body'), 'block');
  scene?.burst(HERO_X + 10, box.mid, ['#ffffff', '#59e3ff', '#ffd84d'], 10, { speed: 1.8 });
  floatText('BLOCK', HERO_X, box.top, 'block-txt');
  await sleep(380);
}

async function playHit(monster, damage) {
  const box = spriteBox(heroArt());
  sfx.dash();
  flash(q('.monster .body'), 'jab');
  await sleep(180);
  sfx.hurt();
  flash(q('.hero .body'), 'ouch');
  scene?.burst(HERO_X, box.mid, ['#ff4d6d', '#ffffff', '#ffb3c1'], 12);
  floatText(`-${damage}`, HERO_X, box.top, 'taken');
  setHp('warrior', live?.fight.warriorHp ?? 0, WARRIOR_MAX_HP);
  shake(4);
  await sleep(420);
}

async function playVictory(monster) {
  const foe = q('.monster .body');
  const box = spriteBox(monster.art);
  if (!foe) return;
  await sleep(200);
  sfx.die();
  foe.classList.add('dying');
  await sleep(760);
  scene?.burst(MON_X, box.mid, SPRITES[monster.art].colors, 60, { speed: 2.2 });
  foe.classList.remove('dying');
  foe.innerHTML = `<div class="stance">${spriteImg('grave', { alt: `${monster.name}, defeated` })}</div>`;
  flash(foe, 'pop');
  q('.monster').classList.add('is-down');
  showBanner('VICTORY!');
  sfx.win();
  scene?.coins(MON_X, FEET_Y - 10, 26);
  flash(q('.hero .body'), 'cheer');
  await sleep(1500);
}

async function playKnockout() {
  sfx.ko();
  q('.hero .body')?.classList.add('down');
  showBanner('KNOCKED OUT', 'bad');
  flash(q('.monster .body'), 'cheer');
  await sleep(1600);
}

// --- Screen wake lock ---
// Keeps the phone screen on during a fight. If the browser can't (unsupported,
// refused, or battery saver), the fight panel says so instead of failing silently.

let wakeLock = null;
let wantWake = false; // true while a fight is running

function showWake(state) {
  const el = q('#t-wake');
  if (!el) return;
  el.className = `wake ${state}`;
  el.textContent = {
    on: '☀ Screen stays on during the fight',
    off: "⚠ This phone may lock its screen mid-run. Turn off auto-lock, or tap the screen now and then.",
    idle: '',
  }[state];
}

async function lockScreen() {
  wantWake = true;
  if (!('wakeLock' in navigator)) return showWake('off');
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!wantWake) return lock.release().catch(() => {}); // the fight paused while we waited
    wakeLock = lock;
    showWake('on');
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
      // Released by the system while still running and visible (e.g. battery saver).
      if (wantWake && document.visibilityState === 'visible') showWake('off');
    });
  } catch {
    wakeLock = null;
    showWake('off');
  }
}

function unlockScreen() {
  wantWake = false;
  const lock = wakeLock;
  wakeLock = null;
  lock?.release?.().catch(() => {});
  showWake('idle');
}

// Browsers drop the lock whenever the page is hidden; ask again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake && live?.status === 'running') lockScreen();
});

// --- Start ---

loadMonsters()
  .then((list) => { monsters = list; render(); })
  .catch((err) => { app.textContent = err.message; console.error(err); });
