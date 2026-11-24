import { test, assertEqual } from './runner.js';
import { loadMonsters } from '../js/monsters.js';
import { SPRITES } from '../js/sprites.js';
import { THEMES } from '../js/scene.js';

test('monsters.json loads and every monster has valid stats', async () => {
  const monsters = await loadMonsters('../data/monsters.json');
  assertEqual(monsters.length > 0, true, 'monster count');
  for (const m of monsters) {
    assertEqual(m.goal.distanceKm > 0, true, `${m.id} distance`);
    assertEqual(m.hp > 0, true, `${m.id} hp`);
    assertEqual(m.attack > 0, true, `${m.id} attack`);
  }
});

test('every monster has 5 pace targets, faster at each level', async () => {
  const monsters = await loadMonsters('../data/monsters.json');
  for (const m of monsters) {
    const p = m.goal.paceByLevel;
    assertEqual(p.length, 5, `${m.id} levels`);
    assertEqual(p.every((v, i) => i === 0 || v < p[i - 1]), true, `${m.id} paces get faster`);
  }
});

test('every monster has a sprite and a battle scene', async () => {
  const monsters = await loadMonsters('../data/monsters.json');
  for (const m of monsters) {
    assertEqual(m.art in SPRITES, true, `${m.id} sprite`);
    assertEqual(m.scene in THEMES, true, `${m.id} scene`);
  }
});

test('stages are numbered 1, 2, 3… with no gaps', async () => {
  const monsters = await loadMonsters('../data/monsters.json');
  const stages = monsters.map((m) => m.stage).sort((a, b) => a - b);
  assertEqual(stages, stages.map((_, i) => i + 1));
});
