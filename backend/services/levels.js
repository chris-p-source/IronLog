// XP is the lifetime points total the app already awards — strength reps plus
// two per cardio minute — so every existing user starts at the level their
// training has already earned, with no backfill.
//
// Levelling up costs a little more each time: STEP more XP per level gained.
//   xp to go from L to L+1 = BASE + STEP * L
// which makes the lifetime XP needed to *reach* level L a closed form. Both
// constants are here so the curve can be retuned without touching anything else.
const BASE = 400;
const STEP = 100;

// Titles are the rank you hold at a level. Flair titles, which a user earns
// from badges and chooses to display, are separate — see badges.js.
const TITLES = [
  { from: 1, title: 'Newcomer' },
  { from: 5, title: 'Regular' },
  { from: 10, title: 'Committed' },
  { from: 15, title: 'Seasoned' },
  { from: 20, title: 'Veteran' },
  { from: 30, title: 'Elite' },
  { from: 40, title: 'Beast' },
  { from: 50, title: 'Legend' },
];

// Total XP needed to reach a level: sum of every step below it.
function xpForLevel(level) {
  if (level <= 1) return 0;
  const n = level - 1;
  return BASE * n + (STEP * n * (n + 1)) / 2;
}

function titleForLevel(level) {
  let title = TITLES[0].title;
  for (const band of TITLES) {
    if (level >= band.from) title = band.title;
  }
  return title;
}

// Inverted directly rather than by looping, so a very high XP total costs the
// same as a low one. Solves BASE*n + STEP*n*(n+1)/2 <= xp for the largest n.
function levelForXp(xp) {
  if (!(xp > 0)) return 1;
  const a = STEP / 2;
  const b = BASE + STEP / 2;
  const n = Math.floor((-b + Math.sqrt(b * b + 4 * a * xp)) / (2 * a));
  return Math.max(1, n + 1);
}

// Everything the UI needs to draw a level card.
function levelProgress(totalXp) {
  const xp = Math.max(0, Math.round(Number(totalXp) || 0));
  const level = levelForXp(xp);
  const levelStart = xpForLevel(level);
  const nextLevel = xpForLevel(level + 1);
  const span = nextLevel - levelStart;
  const into = xp - levelStart;

  return {
    xp,
    level,
    title: titleForLevel(level),
    xpIntoLevel: into,
    xpForNextLevel: span,
    xpToNextLevel: span - into,
    // 0–100, for a progress bar
    percent: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 0,
  };
}

module.exports = { levelProgress, levelForXp, xpForLevel, titleForLevel, BASE, STEP, TITLES };
