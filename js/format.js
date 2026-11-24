// Display helpers: durations, paces, distances and goal descriptions.

import { targetPace } from './rules.js';

/** 1234 → '20:34', 3725 → '1:02:05'. */
export function formatDuration(totalSec) {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 360 → '6:00/km'. */
export function formatPace(secPerKm) {
  return `${formatDuration(secPerKm)}/km`;
}

/** 5 → '5 km', 4.25 → '4.25 km'. */
export function formatKm(km) {
  return `${Number(km.toFixed(2))} km`;
}

/** Plain-language goal for a monster at a level. */
export function goalText(monster, level) {
  return `Run ${formatKm(monster.goal.distanceKm)} at ${formatPace(targetPace(monster, level))} or faster`;
}

/** Local 'YYYY-MM-DD' for a Date. */
export function toDateString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** '2026-11-24' → 'Tue 24 Nov'. */
export function formatDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
