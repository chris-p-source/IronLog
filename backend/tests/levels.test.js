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
  // 400 + 100*level per level, accumulated.
  assert.strictEqual(levels.xpForLevel(1), 0);
  assert.strictEqual(levels.xpForLevel(2), 500);
  assert.strictEqual(levels.xpForLevel(5), 2600);
  assert.strictEqual(levels.xpForLevel(10), 8100);
  assert.strictEqual(levels.xpForLevel(25), 39600);
  assert.strictEqual(levels.xpForLevel(50), 142100);
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
  // Level 5 starts at 2600 and level 6 at 3500, so the step is 400 + 100*5.
  assert.strictEqual(levels.xpForLevel(6) - levels.xpForLevel(5), 900);

  const p = levels.levelProgress(3050);
  assert.strictEqual(p.level, 5);
  assert.strictEqual(p.xpIntoLevel, 450);
  assert.strictEqual(p.xpForNextLevel, 900);
  assert.strictEqual(p.xpToNextLevel, 450);
  assert.strictEqual(p.percent, 50);
});

test('titles are held until the next band is reached', () => {
  assert.strictEqual(levels.titleForLevel(1), 'Newcomer');
  assert.strictEqual(levels.titleForLevel(4), 'Newcomer');
  assert.strictEqual(levels.titleForLevel(5), 'Regular');
  assert.strictEqual(levels.titleForLevel(19), 'Seasoned');
  assert.strictEqual(levels.titleForLevel(20), 'Veteran');
  assert.strictEqual(levels.titleForLevel(50), 'Legend');
  assert.strictEqual(levels.titleForLevel(500), 'Legend');
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
