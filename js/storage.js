// Saves player data in localStorage: progress, warrior profile, fight in progress.
// Every read and write is wrapped: storage can be blocked (private mode etc.),
// and the game still runs for the session without it.

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable.
  }
};

// --- Progress ---

const STATE_KEY = 'run-warrior:v2';

/** runs: finished fights; beaten: { monsterId: true }; best: { monsterId: 0..1 progress }. */
export const emptyState = () => ({ runs: [], beaten: {}, best: {} });

export function loadState() {
  return { ...emptyState(), ...read(STATE_KEY, {}) };
}

export function saveState(state) {
  write(STATE_KEY, state);
}

// --- Warrior profile (kept when progress resets) ---

const PROFILE_KEY = 'run-warrior:profile';
export const DEFAULT_NAME = 'Warrior';
export const NAME_MAX = 12;

/** Whether the player has set up a warrior yet. */
export const hasProfile = () => read(PROFILE_KEY, null) !== null;

export function loadProfile() {
  const p = read(PROFILE_KEY, {}) ?? {};
  const level = Math.round(Number(p.level));
  return {
    name: typeof p.name === 'string' ? p.name : '',
    character: p.character === 'heroine' ? 'heroine' : 'hero',
    level: level >= 1 && level <= 5 ? level : 1,
  };
}

export function saveProfile(profile) {
  write(PROFILE_KEY, profile);
}

/** The name shown in the game: the player's name, or "Warrior" if blank. */
export function displayName(profile) {
  return profile.name.trim().slice(0, NAME_MAX) || DEFAULT_NAME;
}

// --- Fight in progress (survives a reload) ---

const ACTIVE_KEY = 'run-warrior:active-fight';

export const loadActiveFight = () => read(ACTIVE_KEY, null);
export const saveActiveFight = (fight) => write(ACTIVE_KEY, fight ?? null);
