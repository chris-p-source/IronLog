const test = require('node:test');
const assert = require('node:assert');
const levels = require('../services/levels');

test('a new lifter starts at level 1', () => {
  const p = levels.levelProgress(0);
  assert.strictEqual(p.level, 1);
  assert.strictEqual(p.title, 'Newcomer');
  assert.strictEqual(p.xpIntoLevel, 0);
  assert.strictEqual(p.percent, 0);
});

test('the curve matches the published thresholds', () => {
  // 300 + 70*level per level, accumulated.
  assert.strictEqual(levels.xpForLevel(1), 0);
  assert.strictEqual(levels.xpForLevel(2), 370);
  assert.strictEqual(levels.xpForLevel(5), 1900);
  assert.strictEqual(levels.xpForLevel(10), 5850);
  assert.strictEqual(levels.xpForLevel(25), 28200);
  assert.strictEqual(levels.xpForLevel(50), 100450);
});

// The curve is pitched at a year of training reaching the Veteran band. Four
// sessions a week plus some tracking is about 480 XP a week.
test('a year of training lands in the Veteran band', () => {
  const perWeek = 480;
  const oneYear = levels.levelProgress(perWeek * 52);
  assert.ok(oneYear.level >= 21 && oneYear.level <= 26, `one year reached level ${oneYear.level}`);
  assert.ok(['Veteran', 'Relentless'].includes(oneYear.title), `one year title was ${oneYear.title}`);

  // And there is still a long way to go after that.
  const twoYears = levels.levelProgress(perWeek * 104);
  assert.ok(twoYears.level > oneYear.level + 8, 'two years is well clear of one');
  assert.ok(levels.xpForLevel(60) > perWeek * 52 * 4, 'the top of the ladder is years away');
});

test('levelForXp inverts xpForLevel exactly at every boundary', () => {
  for (let level = 1; level <= 80; level++) {
    const at = levels.xpForLevel(level);
    assert.strictEqual(levels.levelForXp(at), level, `exactly at level ${level}`);
    assert.strictEqual(levels.levelForXp(at + 1), level, `just past level ${level}`);
    if (level > 1) {
      assert.strictEqual(levels.levelForXp(at - 1), level - 1, `just short of level ${level}`);
    }
  }
});

test('progress within a level is reported for the bar', () => {
  // Level 5 starts at 1900 and level 6 at 2550, so the step is 300 + 70*5.
  assert.strictEqual(levels.xpForLevel(6) - levels.xpForLevel(5), 650);

  const p = levels.levelProgress(2225);
  assert.strictEqual(p.level, 5);
  assert.strictEqual(p.xpIntoLevel, 325);
  assert.strictEqual(p.xpForNextLevel, 650);
  assert.strictEqual(p.xpToNextLevel, 325);
  assert.strictEqual(p.percent, 50);
});

test('titles are held until the next band is reached', () => {
  assert.strictEqual(levels.titleForLevel(1), 'Newcomer');
  assert.strictEqual(levels.titleForLevel(2), 'Newcomer');
  assert.strictEqual(levels.titleForLevel(3), 'Rookie');
  assert.strictEqual(levels.titleForLevel(5), 'Regular');
  assert.strictEqual(levels.titleForLevel(17), 'Seasoned');
  assert.strictEqual(levels.titleForLevel(21), 'Veteran');
  assert.strictEqual(levels.titleForLevel(50), 'Legend');
  assert.strictEqual(levels.titleForLevel(500), 'Mythic', 'the last band holds forever');
});

// Every band should be reachable and the rank should keep moving through the
// first couple of years, which is roughly levels 10-30.
test('title bands are ordered and never leave a long gap early on', () => {
  const froms = levels.TITLES.map(t => t.from);
  assert.deepStrictEqual(froms, [...froms].sort((a, b) => a - b), 'bands are in order');
  assert.strictEqual(new Set(froms).size, froms.length, 'no duplicate bands');
  assert.strictEqual(froms[0], 1, 'a level 1 lifter has a title');

  const early = froms.filter(f => f <= 30);
  for (let i = 1; i < early.length; i++) {
    assert.ok(early[i] - early[i - 1] <= 4, `gap at level ${early[i - 1]} is too long`);
  }
});

test('junk XP values do not produce a broken level', () => {
  for (const bad of [null, undefined, NaN, -50, 'abc']) {
    const p = levels.levelProgress(bad);
    assert.strictEqual(p.level, 1, `level for ${String(bad)}`);
    assert.strictEqual(p.xp, 0);
    assert.ok(p.percent >= 0 && p.percent <= 100);
  }
});

test('levels keep rising for an extreme lifetime total', () => {
  const p = levels.levelProgress(5000000);
  assert.ok(p.level > 100, `expected a high level, got ${p.level}`);
  assert.ok(p.percent >= 0 && p.percent <= 100);
  assert.ok(p.xpToNextLevel > 0);
});
