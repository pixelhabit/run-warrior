import { test, assertEqual } from './runner.js';
import { formatDuration, formatPace, formatKm, goalText, toDateString } from '../js/format.js';
import { slime, dragon } from './fixtures.js';

test('formatDuration shows m:ss under an hour and h:mm:ss above', () => {
  assertEqual(formatDuration(1234), '20:34');
  assertEqual(formatDuration(65), '1:05');
  assertEqual(formatDuration(3725), '1:02:05');
});

test('formatPace and formatKm', () => {
  assertEqual(formatPace(360), '6:00/km');
  assertEqual(formatKm(5), '5 km');
  assertEqual(formatKm(4.256), '4.26 km');
});

test('goalText names the distance and the pace target for the level', () => {
  assertEqual(goalText(slime, 1), 'Run 3 km at 8:15/km or faster');
  assertEqual(goalText(dragon, 5), 'Run 21 km at 5:30/km or faster');
});

test('toDateString gives a local YYYY-MM-DD', () => {
  assertEqual(toDateString(new Date(2026, 10, 4)), '2026-11-04');
});
