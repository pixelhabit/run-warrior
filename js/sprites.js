// Pixel-art sprites, drawn from text grids. Each letter is a palette color and
// '.' is transparent. A 1px dark outline and simple top-light / bottom-shadow
// shading are added automatically, so the grids only hold the flat colors.

const OUTLINE = '#1a1028';

const PALETTE = {
  e: '#1a1028', // eyes, mouths
  w: '#ffffff',
  y: '#ffd84d',
  r: '#ff4d6d',
  // slime
  g: '#5ee36a', G: '#2f9e57', l: '#c4ffb8',
  // goblin
  t: '#a3c939', T: '#6e8f1f',
  // leather and cloth
  b: '#9a6232', B: '#4f3220',
  // metal
  m: '#dfe5f0', M: '#7d8597',
  // troll stone
  p: '#8f84ad', P: '#5f5480', q: '#c2b8dc',
  // dragon
  d: '#e8433f', D: '#9c1f3c', o: '#ffb347', h: '#f4e9d0',
  // hero
  f: '#ffcc99', n: '#3f7be8', N: '#284fa8',
  // heroine
  c: '#e0703a', v: '#b34fd8', V: '#6e2a96',
};

// Colors that keep their exact value (no auto shading).
const FLAT = new Set(['e', 'w', 'y']);

const HERO_TOP = [
  '....mmmmm.....',
  '...mmmmmmm..m.',
  '...MMMMMMM..m.',
  '...ffffeff..m.',
  '...fffffff..m.',
  '....rrrrr...m.',
  'rr.nnnnnnn..m.',
  '.rnnnnnnnnnMMM',
  '..nnnnnnnnnff.',
  '..nnnNNNnnn...',
  '...BBBBBBB....',
];

const HERO_STAND = [
  '...NNN.NNN....',
  '...NNN.NNN....',
  '...BBB.BBB....',
  '..BBBB.BBBB...',
];

const HERO_STRIDE = [
  '..NNN..NNN....',
  '.NNN....NNN...',
  '.BBB.....BBB..',
  'BBBB......BBB.',
];

const HEROINE_TOP = [
  '....mmmmm.....',
  '..cmmmmmmm..m.',
  '.ccMMMMMMM..m.',
  'cc.cfffeff..m.',
  'c..cffffff..m.',
  'c...rrrrr...m.',
  '...vvvvvvv..m.',
  '..vvvvvvvvvMMM',
  '..vvvvvvvvvff.',
  '..vvvVVVvvv...',
  '...BBBBBBB....',
];

const legs = (rows, color) => rows.map((r) => r.replaceAll('N', color));

const SLIME = [
  '.......gggg.......',
  '.....gglggggg.....',
  '....glllgggggg....',
  '...gglggggggggg...',
  '..gggggggggggggg..',
  '.gggewgggggewgggg.',
  '.gggeegggggeegggg.',
  '.gggggggeeggggggg.',
  'gggggggggggggggggg',
  'gGggggggggggggggGg',
  'GGggggggggggggggGG',
  '.GGGGggggggggGGGG.',
  '..GGGGGGGGGGGGGG..',
];

const GOBLIN = [
  '......tttt......',
  '....tttttttt....',
  't..tttttttttt..t',
  'tttttyetteyttttt',
  '.tttttttttttttt.',
  '..tttweeeewttt..',
  '...tttttttttt..m',
  '....bbbbbbbb...m',
  '..tbbbbbbbbbbt.m',
  '.ttbbBbbbbBbbttM',
  '.t.bbbbbbbbbb...',
  '...BBBBBBBBBB...',
  '...bbbb..bbbb...',
  '...tttt..tttt...',
  '...ttt....ttt...',
  '..BBBB....BBBB..',
];

const TROLL = [
  '........pppppp........',
  '......pppppppppp......',
  '.....ppqqpppppppp.....',
  '....pppPPppppPPppp....',
  '....ppyeppppppeypp....',
  '....ppppppPPpppppp....',
  '....ppwppeeeeppwpp....',
  '.....pppppppppppp.....',
  '...gppppppppppppppg...',
  '..ggppppppppppppppgg..',
  '.pppppppppppppppppppp.',
  'pppp.pppppppppppp.pppp',
  'ppp..pppppppppppp..ppp',
  'qpp..pppppppppppp..ppq',
  '.....BBBBBBBBBBBB.....',
  '.....bbbbbbbbbbbb.....',
  '.....pppp....pppp.....',
  '.....pppp....pppp.....',
  '....PPPPP....PPPPP....',
];

const DRAGON = [
  '...............D............',
  '..............DD.......D....',
  '.............DdD......DD....',
  '............DddD.....DdD....',
  '..hh.......DdddD....DddD....',
  '...hdd....DddddDD..DdddD....',
  '..dddddd.DdddddddDDddddD....',
  '.ddyeddddddddddddddddddD....',
  'dddddddddddddddddddddd......',
  'ewewddddoodddddddddddd......',
  '.DDDDdddoooodddddddddddd....',
  '.......ddooooodddddddddddd..',
  '......dddoooooodddddddddddd.',
  '......ddooooooddddddd..dddDD',
  '.......dddooodddddd......DD.',
  '.......ddd....ddd...........',
  '......DDDD...DDDD...........',
  '......h.h.h..h.h.h..........',
];

const GRAVE = [
  '...MMMMMM...',
  '..MmmmmmmM..',
  '.MmmmmmmmmM.',
  '.MmmmMmmmmM.',
  '.MmmMMMmmmM.',
  '.MmmmMmmmmM.',
  '.MmmmMmmmmM.',
  '.MmmmmmmmmM.',
  '.MmmmmmmmmM.',
  'gggggggggggg',
  'GgGgGGgGgGgG',
];

/**
 * Sprite definitions. `scale` is how many scene pixels one sprite pixel covers,
 * `idle` names the CSS idle animation, `colors` feed hit particles.
 */
export const SPRITES = {
  hero: { frames: [[...HERO_TOP, ...HERO_STAND], [...HERO_TOP, ...HERO_STRIDE]], scale: 2 },
  heroine: {
    frames: [[...HEROINE_TOP, ...legs(HERO_STAND, 'V')], [...HEROINE_TOP, ...legs(HERO_STRIDE, 'V')]],
    scale: 2,
  },
  slime: { frames: [SLIME], scale: 2, idle: 'squish', colors: ['#5ee36a', '#2f9e57', '#c4ffb8'] },
  goblin: { frames: [GOBLIN], scale: 2, idle: 'hop', colors: ['#a3c939', '#6e8f1f', '#9a6232'] },
  troll: { frames: [TROLL], scale: 2.1, idle: 'sway', colors: ['#8f84ad', '#c2b8dc', '#5f5480'] },
  dragon: { frames: [DRAGON], scale: 2.3, idle: 'hover', colors: ['#e8433f', '#ffb347', '#ffd84d'] },
  grave: { frames: [GRAVE], scale: 2 },
};

function mix(hex, toward, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (toward - v) * amount));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const cache = new Map();

/**
 * Renders a sprite frame to a PNG data URL (cached).
 * @returns {{ url: string, w: number, h: number }} size in sprite pixels, outline included
 */
export function sprite(name, frame = 0) {
  const key = `${name}:${frame}`;
  if (cache.has(key)) return cache.get(key);

  const def = SPRITES[name];
  if (!def) throw new Error(`Unknown sprite: ${name}`);
  const rows = def.frames[frame % def.frames.length];
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const h = rows.length + 2;
  const at = (x, y) => {
    const ch = rows[y - 1]?.[x - 1];
    return ch && ch !== '.' ? ch : null;
  };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      let color = null;
      if (ch) {
        color = PALETTE[ch] ?? '#ff00ff';
        if (!FLAT.has(ch)) {
          if (!at(x, y - 1)) color = mix(color, 255, 0.3);
          else if (!at(x, y + 1)) color = mix(color, 0, 0.3);
          else if (!at(x + 1, y)) color = mix(color, 0, 0.15);
        }
      } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
        color = OUTLINE;
      }
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const result = { url: canvas.toDataURL(), w, h };
  cache.set(key, result);
  return result;
}
