// Game rules: fair-play checks and the live fight engine.
// Everything here is pure: functions never change what's passed in.

/**
 * @typedef {Object} Run
 * @property {string} id
 * @property {string} date          'YYYY-MM-DD'
 * @property {number} distanceKm
 * @property {number} durationSec
 * @property {'gps'} source
 * @property {number} [trackPoints]
 */

export const MAX_SPEED_KMH = 25;
export const MIN_GPS_TRACK_POINTS = 30;
export const WARRIOR_MAX_HP = 100;
export const LEVELS = [1, 2, 3, 4, 5];

/** Moving time between pace checks (and blows traded), in ms. */
export const CHECK_MS = 30000;
/** No pace checks during the first minute: warm-up and GPS lock. */
export const GRACE_MS = 60000;
/** Less than this many km in a check window counts as standing still. */
export const MIN_WINDOW_KM = 0.005;

/** Average pace in seconds per km. */
export function paceSecPerKm(run) {
  return run.durationSec / run.distanceKm;
}

/**
 * @param {Run} run
 * @returns {{ ok: boolean, reason?: string }}
 */
export function fairPlayCheck(run) {
  if (!(run.distanceKm > 0)) return { ok: false, reason: 'Distance must be more than 0.' };
  if (!(run.durationSec > 0)) return { ok: false, reason: 'Time must be more than 0.' };

  const speedKmh = run.distanceKm / (run.durationSec / 3600);
  if (speedKmh > MAX_SPEED_KMH) {
    return { ok: false, reason: `Faster than ${MAX_SPEED_KMH} km/h. That's not a run.` };
  }
  if (run.source === 'gps' && !((run.trackPoints ?? 0) >= MIN_GPS_TRACK_POINTS)) {
    return { ok: false, reason: 'Not enough GPS points recorded.' };
  }
  return { ok: true };
}

/** Level 1 to 5 from any input. */
export const clampLevel = (level) => Math.min(5, Math.max(1, Math.round(Number(level) || 1)));

/** Pace target (sec/km) for a monster at a level. */
export function targetPace(monster, level) {
  return monster.goal.paceByLevel[clampLevel(level) - 1];
}

/**
 * Damage the monster deals in one check when the runner is slower than the target.
 * 0 when on pace. Off pace it scales with how far off: 5% slow → 20% of attack,
 * 25% slow or more (or standing still) → the full attack. At least 25% of attack.
 * @param {number} pace    live pace in sec/km (Infinity when standing still)
 * @param {number} target  pace target in sec/km
 * @param {number} attack  monster attack
 */
export function offPaceDamage(pace, target, attack) {
  if (pace <= target) return 0;
  const severity = pace === Infinity ? 1 : Math.min(1, Math.max(0.25, (pace / target - 1) * 4));
  return Math.ceil(Number((attack * severity).toFixed(6)));
}

/**
 * @typedef {Object} Fight
 * @property {string} monsterId
 * @property {number} level
 * @property {number} monsterHp
 * @property {number} warriorHp
 * @property {number} distanceKm
 * @property {number} nextCheckMs     moving time of the next pace check
 * @property {{ t: number, d: number, p: number }[]} window  recent samples: ms, km, GPS points
 * @property {number|null} lastPace
 * @property {null|'won'|'lost'} result
 */

/** A fresh fight: both at full HP. @returns {Fight} */
export function newFight(monster, level) {
  return {
    monsterId: monster.id,
    level: clampLevel(level),
    monsterHp: monster.hp,
    warriorHp: WARRIOR_MAX_HP,
    distanceKm: 0,
    nextCheckMs: GRACE_MS,
    window: [{ t: 0, d: 0, p: 0 }],
    lastPace: null,
    result: null,
  };
}

/**
 * Live pace over the last CHECK_MS of moving time, in sec/km.
 * null when the GPS sent no new points (no signal); Infinity when standing still.
 */
export function livePace(fight, t) {
  const win = fight.window;
  const last = win[win.length - 1];
  let first = win[0];
  for (const s of win) {
    if (s.t <= t - CHECK_MS) first = s;
  }
  if (last.t <= first.t || last.p === first.p) return null;
  const km = last.d - first.d;
  if (km < MIN_WINDOW_KM) return Infinity;
  return (last.t - first.t) / 1000 / km;
}

/**
 * Advances a fight with a tracker snapshot. Returns the new fight and what
 * happened, in order, for the animations:
 *   strike  { damage }        the warrior's blows land (monster HP follows distance)
 *   block   { pace }          on pace: the monster's attack is blocked
 *   hit     { damage, pace }  off pace: the monster hits the warrior
 *   nosignal                  no GPS points in the window: no one is hurt
 *   victory                   the goal distance is reached
 *   ko                        the warrior's HP hits 0
 * Blows are traded every CHECK_MS of moving time, after a GRACE_MS warm-up.
 *
 * @param {Fight} fight
 * @param {import('./monsters.js').Monster} monster
 * @param {{ elapsedMs: number, distanceKm: number, points: number }} snap
 * @returns {{ fight: Fight, events: object[] }}
 */
export function stepFight(fight, monster, snap) {
  if (fight.result) return { fight, events: [] };
  const f = { ...fight, window: [...fight.window] };
  const events = [];
  const t = snap.elapsedMs;
  const d = snap.distanceKm;

  const prev = f.window[f.window.length - 1];
  if (t > prev.t) f.window.push({ t, d, p: snap.points });
  while (f.window.length > 2 && f.window[1].t <= t - 2 * CHECK_MS) f.window.shift();
  f.distanceKm = d;

  const goal = monster.goal.distanceKm;
  if (d >= goal) {
    if (f.monsterHp > 0) events.push({ type: 'strike', damage: f.monsterHp });
    f.monsterHp = 0;
    f.result = 'won';
    events.push({ type: 'victory' });
    return { fight: f, events };
  }

  if (t < f.nextCheckMs) return { fight: f, events };
  while (f.nextCheckMs <= t) f.nextCheckMs += CHECK_MS;

  // The warrior's blows: monster HP falls in step with distance covered.
  const hpNow = Math.max(1, Math.round(monster.hp * (1 - d / goal)));
  if (hpNow < f.monsterHp) {
    events.push({ type: 'strike', damage: f.monsterHp - hpNow });
    f.monsterHp = hpNow;
  }

  // The monster's attack: blocked on pace, lands off pace.
  const pace = livePace(f, t);
  f.lastPace = pace;
  if (pace === null) {
    events.push({ type: 'nosignal' });
  } else {
    const damage = offPaceDamage(pace, targetPace(monster, f.level), monster.attack);
    if (damage > 0) {
      f.warriorHp = Math.max(0, f.warriorHp - damage);
      events.push({ type: 'hit', damage, pace });
    } else {
      events.push({ type: 'block', pace });
    }
  }

  if (f.warriorHp <= 0) {
    f.result = 'lost';
    events.push({ type: 'ko' });
  }
  return { fight: f, events };
}
