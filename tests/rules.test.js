import { test, assertEqual } from './runner.js';
import {
  fairPlayCheck, clampLevel, targetPace, offPaceDamage, newFight, stepFight, livePace,
  MIN_GPS_TRACK_POINTS, WARRIOR_MAX_HP,
} from '../js/rules.js';
import { slime, goblin, troll, dragon, makeRun, steadySnaps } from './fixtures.js';

/** Runs a fight through snapshots; returns the final fight and all events. */
function play(monster, level, snaps, fight = newFight(monster, level)) {
  const events = [];
  for (const snap of snaps) {
    const r = stepFight(fight, monster, snap);
    fight = r.fight;
    events.push(...r.events);
  }
  return { fight, events };
}
const count = (events, type) => events.filter((e) => e.type === type).length;

// --- Fair play ---

test('fairPlayCheck rejects runs faster than 25 km/h', () => {
  assertEqual(fairPlayCheck(makeRun(5, 600)).ok, false); // 30 km/h
  assertEqual(fairPlayCheck(makeRun(5, 720)).ok, true);  // exactly 25 km/h
});

test('fairPlayCheck rejects zero distance or time', () => {
  assertEqual(fairPlayCheck(makeRun(0, 600)).ok, false);
  assertEqual(fairPlayCheck(makeRun(5, 0)).ok, false);
});

test('fairPlayCheck rejects GPS runs with too few track points', () => {
  assertEqual(fairPlayCheck(makeRun(5, 1800, { trackPoints: 10 })).ok, false);
  assertEqual(fairPlayCheck(makeRun(5, 1800, { trackPoints: MIN_GPS_TRACK_POINTS })).ok, true);
});

// --- Levels and pace targets ---

test('clampLevel keeps levels between 1 and 5', () => {
  assertEqual([clampLevel(0), clampLevel(3), clampLevel(9), clampLevel('x')], [1, 3, 5, 1]);
});

test('targetPace gets faster with each level', () => {
  assertEqual([1, 2, 3, 4, 5].map((l) => targetPace(slime, l)), [495, 435, 375, 330, 285]);
  assertEqual(targetPace(dragon, 5), 330);
});

// --- Off-pace damage ---

test('offPaceDamage: on or under the target does no damage', () => {
  assertEqual(offPaceDamage(360, 360, 10), 0);
  assertEqual(offPaceDamage(300, 360, 10), 0);
});

test('offPaceDamage scales with how far off pace', () => {
  assertEqual(offPaceDamage(378, 360, 10), 3);       // 5% slow → 25% floor → 2.5 → 3
  assertEqual(offPaceDamage(396, 360, 10), 4);       // 10% slow → 40%
  assertEqual(offPaceDamage(450, 360, 10), 10);      // 25% slow → full
  assertEqual(offPaceDamage(Infinity, 360, 10), 10); // standing still
});

// --- The fight ---

test('a fight starts with both at full HP', () => {
  const f = newFight(goblin, 3);
  assertEqual([f.monsterHp, f.warriorHp, f.level, f.result], [150, WARRIOR_MAX_HP, 3, null]);
});

test('no blows are traded during the warm-up minute', () => {
  const { events } = play(slime, 1, steadySnaps(Infinity, 55)); // standing still
  assertEqual(events, []);
});

test('running on pace: every attack is blocked and the warrior wins', () => {
  // Level 1 Slime: 3 km at 8:15/km. Run 7:30/km.
  const { fight, events } = play(slime, 1, steadySnaps(450, 1400));
  assertEqual(fight.result, 'won');
  assertEqual(fight.warriorHp, WARRIOR_MAX_HP);
  assertEqual(count(events, 'hit'), 0);
  assertEqual(count(events, 'block') > 30, true);
  assertEqual(events[events.length - 1].type, 'victory');
});

test("the warrior's strikes drain monster HP in step with distance", () => {
  // Troll: 10 km, 200 HP. 2.5 km covered by the check at 1260 s → 150 HP left.
  const { fight, events } = play(troll, 1, steadySnaps(504, 1260));
  assertEqual(fight.monsterHp, 150);
  const struck = events.filter((e) => e.type === 'strike').reduce((s, e) => s + e.damage, 0);
  assertEqual(struck, 50);
});

test('running too slow: the monster hits the warrior every check', () => {
  // Level 5 Goblin wants 5:00/km. Run 7:00/km (40% slow → full attack of 8).
  const { fight, events } = play(goblin, 5, steadySnaps(420, 300));
  assertEqual(count(events, 'hit'), 9); // checks at 60 s, 90 s, … 300 s
  assertEqual(fight.warriorHp, WARRIOR_MAX_HP - 9 * 8);
});

test('the same run is on pace at a lower level', () => {
  const { fight } = play(goblin, 1, steadySnaps(420, 300)); // level 1 wants 8:30/km
  assertEqual(fight.warriorHp, WARRIOR_MAX_HP);
});

test('standing still gets the warrior knocked out', () => {
  // Slime attack 10: 10 full hits after the warm-up.
  const { fight, events } = play(slime, 1, steadySnaps(Infinity, 400));
  assertEqual(fight.result, 'lost');
  assertEqual(fight.warriorHp, 0);
  assertEqual(events[events.length - 1].type, 'ko');
});

test('a finished fight ignores further snapshots', () => {
  const lost = play(slime, 1, steadySnaps(Infinity, 400)).fight;
  const { fight, events } = play(slime, 1, steadySnaps(300, 60, { fromSec: 400 }), lost);
  assertEqual([fight.result, events.length], ['lost', 0]);
});

test('no GPS signal: no one is hurt', () => {
  const snaps = steadySnaps(450, 120).map((s) => ({ ...s, points: 7 })); // points never change
  const { fight, events } = play(slime, 5, snaps);
  assertEqual(fight.warriorHp, WARRIOR_MAX_HP);
  assertEqual(count(events, 'nosignal') > 0, true);
});

test('monster HP never hits 0 before the goal distance is reached', () => {
  const { fight } = play(slime, 1, steadySnaps(450, 1345)); // 2.99 km
  assertEqual([fight.result, fight.monsterHp >= 1], [null, true]);
});

test('livePace measures the last 30 seconds only', () => {
  // 60 s slow (10:00/km), then 60 s fast (5:00/km).
  let fight = newFight(dragon, 1);
  const snaps = [
    ...steadySnaps(600, 60),
    ...steadySnaps(300, 60, { fromSec: 60, fromKm: 0.1, fromPoints: 60 }),
  ];
  for (const s of snaps) fight = stepFight(fight, dragon, s).fight;
  assertEqual(Math.round(livePace(fight, 120000)), 300);
});
