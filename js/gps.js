// GPS run tracking with the browser Geolocation API.
// The track math (addPoint) is pure so it can be tested without a GPS.

export const MAX_ACCURACY_M = 35; // ignore fixes less accurate than this
export const MIN_STEP_M = 5; // ignore smaller moves (GPS jitter while standing)
export const MAX_SEGMENT_KMH = 30; // a jump faster than this is a GPS glitch

/** Great-circle distance between two { lat, lon } points, in km. */
export function haversineKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @typedef {{ lat: number, lon: number, acc: number, t: number }} Fix  acc in m, t in ms
 * @typedef {{ distanceKm: number, points: number, skipped: number, last: Fix|null }} Track
 */

/** @returns {Track} */
export const newTrack = () => ({ distanceKm: 0, points: 0, skipped: 0, last: null });

/**
 * Adds one GPS fix to a track and returns the new track.
 * - Inaccurate fixes are skipped.
 * - Moves smaller than the jitter threshold count as a point but add no distance,
 *   and keep the old anchor so slow progress still adds up.
 * - Impossible jumps (faster than MAX_SEGMENT_KMH) re-anchor without adding distance.
 * @param {Track} track
 * @param {Fix} fix
 * @returns {Track}
 */
export function addPoint(track, fix) {
  if (!(fix.acc <= MAX_ACCURACY_M)) return { ...track, skipped: track.skipped + 1 };
  if (!track.last) return { ...track, points: track.points + 1, last: fix };

  const km = haversineKm(track.last, fix);
  if (km * 1000 < Math.max(MIN_STEP_M, fix.acc / 2)) {
    return { ...track, points: track.points + 1 };
  }
  const hours = (fix.t - track.last.t) / 3.6e6;
  if (hours <= 0 || km / hours > MAX_SEGMENT_KMH) {
    return { ...track, skipped: track.skipped + 1, last: fix };
  }
  return { ...track, distanceKm: track.distanceKm + km, points: track.points + 1, last: fix };
}

/** Whether this page can use GPS, and why not. */
export function gpsSupport() {
  if (!('geolocation' in navigator)) return { ok: false, reason: 'This browser has no GPS access.' };
  if (!window.isSecureContext) {
    return { ok: false, reason: 'GPS only works on a secure page (https). Open the published game, or localhost on this computer.' };
  }
  return { ok: true };
}

/** The real device GPS. */
export function deviceSource() {
  return {
    watch: (ok, err) => navigator.geolocation.watchPosition(ok, err, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 30000,
    }),
    clear: (id) => navigator.geolocation.clearWatch(id),
  };
}

/**
 * A fake GPS for testing on a desk: runs north at `pace` sec/km,
 * with time sped up `speedup` times. Use with its own `now` clock.
 */
export function simulatedGps({ pace = 360, speedup = 20 } = {}) {
  const t0 = Date.now();
  const now = () => t0 + (Date.now() - t0) * speedup;
  let lat = 0;
  return {
    now,
    source: {
      watch(ok) {
        let lastT = now();
        return setInterval(() => {
          const t = now();
          lat += ((t - lastT) / 1000 / pace) / 111.32; // km → degrees of latitude
          lastT = t;
          ok({ coords: { latitude: lat, longitude: 0, accuracy: 5 }, timestamp: t });
        }, 1000 / speedup);
      },
      clear: (id) => clearInterval(id),
    },
  };
}

/**
 * Live run tracker. Counts distance and moving time; paused time doesn't count.
 * @param {{ source: object, now?: () => number, onUpdate?: Function, onError?: Function,
 *           restore?: { distanceKm: number, points: number, elapsedMs: number } }} opts
 */
export function createTracker({ source, now = () => Date.now(), onUpdate = () => {}, onError = () => {}, restore } = {}) {
  let track = { ...newTrack(), distanceKm: restore?.distanceKm ?? 0, points: restore?.points ?? 0 };
  let elapsed = restore?.elapsedMs ?? 0;
  let runningSince = null;
  let watchId = null;
  let lastFix = null;

  const snapshot = () => ({
    distanceKm: track.distanceKm,
    points: track.points,
    elapsedMs: elapsed + (runningSince === null ? 0 : now() - runningSince),
    running: runningSince !== null,
    accuracy: lastFix ? lastFix.acc : null,
  });

  function onPosition(pos) {
    const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: pos.timestamp || now() };
    lastFix = fix;
    if (runningSince !== null) track = addPoint(track, fix);
    onUpdate(snapshot());
  }

  return {
    snapshot,
    start() {
      if (watchId === null) watchId = source.watch(onPosition, onError);
      track = { ...track, last: null }; // don't count distance covered while paused
      runningSince = now();
      onUpdate(snapshot());
    },
    pause() {
      if (runningSince !== null) {
        elapsed += now() - runningSince;
        runningSince = null;
      }
      onUpdate(snapshot());
    },
    stop() {
      this.pause();
      if (watchId !== null) source.clear(watchId);
      watchId = null;
      return snapshot();
    },
  };
}
