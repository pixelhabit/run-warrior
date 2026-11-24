import { test, assertEqual } from './runner.js';
import { haversineKm, newTrack, addPoint, createTracker } from '../js/gps.js';

const near = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
// 0.001° of latitude ≈ 111.2 m
const fix = (lat, t, acc = 5) => ({ lat, lon: 0, acc, t });

test('haversineKm: one degree of latitude is about 111 km', () => {
  assertEqual(near(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111.19, 0.01), true);
});

test('addPoint: the first fix anchors the track without distance', () => {
  const t = addPoint(newTrack(), fix(0, 0));
  assertEqual([t.points, t.distanceKm], [1, 0]);
});

test('addPoint: running adds distance', () => {
  let t = newTrack();
  for (let i = 0; i <= 10; i++) t = addPoint(t, fix(i * 0.0001, i * 4000)); // ~11 m every 4 s
  assertEqual(near(t.distanceKm, 0.1112, 0.001), true);
  assertEqual(t.points, 11);
});

test('addPoint: skips inaccurate fixes', () => {
  const t = addPoint(addPoint(newTrack(), fix(0, 0)), fix(0.001, 30000, 80));
  assertEqual([t.points, t.skipped, t.distanceKm], [1, 1, 0]);
});

test('addPoint: standing still jitter adds no distance', () => {
  let t = addPoint(newTrack(), fix(0, 0));
  for (let i = 1; i <= 20; i++) t = addPoint(t, fix(i % 2 ? 0.00002 : 0, i * 1000)); // ±2 m wobble
  assertEqual(t.distanceKm, 0);
});

test('addPoint: slow progress below the jitter step still adds up', () => {
  let t = addPoint(newTrack(), fix(0, 0));
  for (let i = 1; i <= 10; i++) t = addPoint(t, fix(i * 0.00003, i * 1000)); // 3.3 m per second
  assertEqual(near(t.distanceKm, 0.0333, 0.007), true);
});

test('addPoint: an impossible jump adds no distance', () => {
  const t = addPoint(addPoint(newTrack(), fix(0, 0)), fix(0.01, 10000)); // 1.1 km in 10 s
  assertEqual([t.distanceKm, t.skipped], [0, 1]);
});

test('createTracker: paused time and distance do not count', () => {
  let clock = 0;
  let emit;
  const source = { watch: (ok) => { emit = ok; return 1; }, clear: () => {} };
  const at = (lat) => emit({ coords: { latitude: lat, longitude: 0, accuracy: 5 }, timestamp: clock });
  const tr = createTracker({ source, now: () => clock });

  tr.start();
  at(0);
  clock = 60000; at(0.001); // ~111 m in 60 s
  tr.pause();
  clock = 120000; at(0.005); // moved while paused: ignored
  tr.start();
  at(0.005); // first fix after resuming re-anchors
  clock = 180000; at(0.006); // ~111 m in 60 s
  const s = tr.stop();

  assertEqual(s.elapsedMs, 120000);
  assertEqual(near(s.distanceKm, 0.2224, 0.002), true);
});
