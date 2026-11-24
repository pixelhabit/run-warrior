// Shared test data. Mirrors data/monsters.json so rule tests don't depend on fetch.

export const slime = { id: 'slime', name: 'Slime', stage: 1, hp: 100, attack: 10, goal: { distanceKm: 3, paceByLevel: [495, 435, 375, 330, 285] } };
export const goblin = { id: 'goblin', name: 'Goblin', stage: 2, hp: 150, attack: 8, goal: { distanceKm: 5, paceByLevel: [510, 450, 390, 345, 300] } };
export const troll = { id: 'troll', name: 'Troll', stage: 3, hp: 200, attack: 6, goal: { distanceKm: 10, paceByLevel: [525, 465, 405, 360, 315] } };
export const dragon = { id: 'dragon', name: 'Dragon', stage: 4, hp: 400, attack: 5, boss: true, goal: { distanceKm: 21, paceByLevel: [540, 480, 420, 375, 330] } };

export const MONSTERS = [slime, goblin, troll, dragon];

let nextId = 1;
export function makeRun(distanceKm, durationSec, extra = {}) {
  return { id: `r${nextId++}`, date: '2026-11-24', distanceKm, durationSec, source: 'gps', trackPoints: 100, ...extra };
}

/**
 * Tracker snapshots for a run at a steady pace, one every `stepSec` seconds,
 * starting after `fromSec` with `fromKm` already covered.
 */
export function steadySnaps(paceSecPerKm, seconds, { stepSec = 5, fromSec = 0, fromKm = 0, fromPoints = 0 } = {}) {
  const snaps = [];
  for (let s = stepSec; s <= seconds; s += stepSec) {
    snaps.push({
      elapsedMs: (fromSec + s) * 1000,
      distanceKm: fromKm + (paceSecPerKm === Infinity ? 0 : s / paceSecPerKm),
      points: fromPoints + s,
    });
  }
  return snaps;
}
