// Loads monster definitions from data/monsters.json.

/**
 * @typedef {Object} Goal
 * @property {number} distanceKm     distance to run in one fight
 * @property {number[]} paceByLevel  pace targets in sec/km for levels 1–5
 *
 * @typedef {Object} Monster
 * @property {string} id
 * @property {string} name
 * @property {string} art      sprite name
 * @property {string} scene    backdrop theme
 * @property {number} stage    order on the stage map
 * @property {boolean} boss
 * @property {number} hp
 * @property {number} attack   damage per check when well off pace
 * @property {Goal} goal
 */

/** @returns {Promise<Monster[]>} */
export async function loadMonsters(url = 'data/monsters.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load monsters: ${res.status}`);
  const data = await res.json();
  return data.monsters;
}
