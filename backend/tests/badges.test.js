const test = require('node:test');
const assert = require('node:assert');
const badges = require('../services/badges');

const EMPTY = {};

test('badge definitions are well formed and uniquely identified', () => {
  const ids = new Set();
  for (const badge of badges.BADGES) {
    assert.ok(badge.id && !ids.has(badge.id), `duplicate or missing id: ${badge.id}`);
    ids.add(badge.id);
    assert.ok(badge.name, `${badge.id} needs a name`);
    assert.ok(badge.description, `${badge.id} needs a description`);
    assert.ok(badge.category, `${badge.id} needs a category`);
    assert.ok(badge.metric, `${badge.id} needs a metric`);
    assert.ok(badge.threshold > 0, `${badge.id} needs a positive threshold`);
    assert.ok(['bronze', 'silver', 'gold'].includes(badge.tier), `${badge.id} tier`);
  }
});

test('a brand new account has earned nothing', () => {
  const evaluated = badges.evaluate(EMPTY, []);
  assert.strictEqual(evaluated.length, badges.BADGES.length);
  assert.strictEqual(evaluated.filter(b => b.earned).length, 0);
  assert.strictEqual(badges.qualifyingIds(EMPTY).length, 0);
});

test('a badge is earned the moment its metric reaches the threshold', () => {
  assert.deepStrictEqual(badges.qualifyingIds({ workouts_total: 0 }), []);
  assert.deepStrictEqual(badges.qualifyingIds({ workouts_total: 1 }), ['first_workout']);

  const ten = badges.qualifyingIds({ workouts_total: 10 });
  assert.ok(ten.includes('first_workout') && ten.includes('ten_workouts'));
  assert.ok(!ten.includes('century_workouts'));
});

test('progress is reported towards a badge not yet earned', () => {
  const evaluated = badges.evaluate({ workouts_total: 62 }, []);
  const century = evaluated.find(b => b.id === 'century_workouts');
  assert.strictEqual(century.earned, false);
  assert.strictEqual(century.value, 62);
  assert.strictEqual(century.percent, 62);
});

test('progress never displays above 100 percent', () => {
  const evaluated = badges.evaluate({ workouts_total: 5000 }, []);
  assert.strictEqual(evaluated.find(b => b.id === 'century_workouts').percent, 100);
});

// Relative strength is the one tier that cannot be farmed with light volume,
// so the ratios matter.
test('relative strength badges follow the bodyweight ratio', () => {
  assert.ok(!badges.qualifyingIds({ bench_ratio: 0.99 }).includes('bw_bench'));
  assert.ok(badges.qualifyingIds({ bench_ratio: 1 }).includes('bw_bench'));
  assert.ok(!badges.qualifyingIds({ squat_ratio: 1.9 }).includes('double_bw_squat'));
  assert.ok(badges.qualifyingIds({ squat_ratio: 2.4 }).includes('double_bw_squat'));
  assert.ok(!badges.qualifyingIds({ deadlift_ratio: 2.4 }).includes('deadlift_two_half'));
  assert.ok(badges.qualifyingIds({ deadlift_ratio: 2.5 }).includes('deadlift_two_half'));
});

// A bodyweight gain must not take away a lift someone actually made.
test('a badge already held stays held even if the stat drops', () => {
  const evaluated = badges.evaluate({ bench_ratio: 0.8 }, ['bw_bench']);
  assert.strictEqual(evaluated.find(b => b.id === 'bw_bench').earned, true);
});

test('titles come only from badges that grant one', () => {
  assert.deepStrictEqual(badges.titlesFor([]), []);
  assert.deepStrictEqual(badges.titlesFor(['first_workout']), [], 'no title on that badge');
  assert.deepStrictEqual(badges.titlesFor(['century_workouts']), ['Century Club']);

  const many = badges.titlesFor(['century_workouts', 'early_bird', 'unknown_badge']);
  assert.deepStrictEqual(many, ['Century Club', 'Early Bird']);
});

test('missing stats are treated as zero rather than crashing', () => {
  for (const stats of [null, undefined, {}, { workouts_total: null }, { workouts_total: 'abc' }]) {
    const evaluated = badges.evaluate(stats, []);
    assert.strictEqual(evaluated.filter(b => b.earned).length, 0);
    assert.ok(evaluated.every(b => Number.isFinite(b.percent)));
  }
});
