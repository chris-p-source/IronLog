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

test('a plate is 20kg a side on a 20kg bar', () => {
  assert.strictEqual(badges.plates(1), 60);
  assert.strictEqual(badges.plates(2), 100, 'two plates is the 100kg bench');
  assert.strictEqual(badges.plates(3), 140);
  assert.strictEqual(badges.plates(4), 180);
  assert.strictEqual(badges.plates(5), 220);
});

test('the plate clubs sit at the weights they are named after', () => {
  const at = (id) => badges.BADGES_BY_ID.get(id).threshold;
  assert.strictEqual(at('bench_2_plate'), 100);
  assert.strictEqual(at('bench_3_plate'), 140);
  assert.strictEqual(at('squat_2_plate'), 100);
  assert.strictEqual(at('squat_4_plate'), 180);
  assert.strictEqual(at('deadlift_3_plate'), 140);
  assert.strictEqual(at('deadlift_5_plate'), 220);

  // A 99kg bench is not the club.
  assert.ok(!badges.qualifyingIds({ bench_kg: 99 }).includes('bench_2_plate'));
  assert.ok(badges.qualifyingIds({ bench_kg: 100 }).includes('bench_2_plate'));
});

test('the pound clubs convert to the right kilo totals', () => {
  assert.strictEqual(badges.lb(1000), 453.6);
  assert.strictEqual(badges.BADGES_BY_ID.get('total_1000').threshold, 453.6);
  assert.strictEqual(badges.BADGES_BY_ID.get('total_1200').threshold, 544.3);
  assert.strictEqual(badges.BADGES_BY_ID.get('total_1500').threshold, 680.4);

  assert.ok(!badges.qualifyingIds({ powerlifting_total_kg: 450 }).includes('total_1000'));
  const earned = badges.qualifyingIds({ powerlifting_total_kg: 500 });
  assert.ok(earned.includes('total_1000'));
  assert.ok(!earned.includes('total_1200'));
});

test('the ladder keeps going for a couple of years of training', () => {
  const top = (metric) => Math.max(...badges.BADGES.filter(b => b.metric === metric).map(b => b.threshold));
  // At four sessions a week, two years is about 400 workouts and 100 weeks.
  assert.ok(top('workouts_total') >= 500, 'workout tiers outlast two years');
  assert.ok(top('weeks_trained') >= 104, 'week tiers reach two years');
  assert.ok(top('tonnage_kg') >= 2000000);
  assert.ok(top('pr_count') >= 150);

  // Nothing should be a lone tier with no step up from it.
  const counts = {};
  for (const b of badges.BADGES) counts[b.metric] = (counts[b.metric] || 0) + 1;
  const singles = Object.entries(counts).filter(([, n]) => n === 1).map(([m]) => m);
  assert.deepStrictEqual(singles, [], 'every metric has more than one tier to chase');
});

test('titles come only from badges that grant one', () => {
  assert.deepStrictEqual(badges.titlesFor([]), []);
  assert.deepStrictEqual(badges.titlesFor(['habit_26']), [], 'no title on that badge');
  assert.deepStrictEqual(badges.titlesFor(['century_workouts']), ['Century Club']);

  const many = badges.titlesFor(['century_workouts', 'early_bird', 'unknown_badge']);
  assert.deepStrictEqual(many, ['Century Club', 'Early Bird']);
});

// Someone who has just finished their first session should have something to
// put next to their name, rather than waiting weeks for a silver badge.
test('a first workout already grants a title', () => {
  const titles = badges.titlesFor(badges.qualifyingIds({ workouts_total: 1 }));
  assert.deepStrictEqual(titles, ['Day One']);
  assert.strictEqual(badges.rarityOf('Day One'), 'common');
});

test('the common tier is the fullest, not the emptiest', () => {
  const counts = {};
  for (const rarity of badges.TITLE_RARITY.values()) counts[rarity] = (counts[rarity] || 0) + 1;

  assert.ok(counts.common >= 12, `common has only ${counts.common} titles`);
  assert.ok(counts.common > counts.rare, 'more common titles than rare');
  assert.ok(counts.common > counts.legendary * 1.5, 'commons comfortably outnumber legendaries');
});

// The early ladder is what a new user actually walks up.
test('the first month of training offers several titles', () => {
  // Ten sessions across four weeks, a few PRs, nothing remarkable.
  const month = { workouts_total: 10, weeks_with_two_plus: 4, pr_count: 10 };
  const titles = badges.titlesFor(badges.qualifyingIds(month));
  assert.ok(titles.length >= 3, `a first month earned only ${titles.length} titles`);
  assert.ok(titles.every(t => badges.rarityOf(t) === 'common'));
});

test('rarity follows the tier of the badge that granted the title', () => {
  assert.strictEqual(badges.rarityOf('Early Bird'), 'common', 'bronze badge');
  assert.strictEqual(badges.rarityOf('Century Club'), 'rare', 'silver badge');
  assert.strictEqual(badges.rarityOf('Year of Iron'), 'epic', 'gold badge');
  assert.strictEqual(badges.rarityOf('Not A Title'), null);
});

test('the hardest titles are legendary rather than merely gold', () => {
  for (const title of ['Mountain Mover', 'Elite Total', 'Dynasty', 'Triple Pull', 'Five Plate Puller', 'Marathon']) {
    assert.strictEqual(badges.rarityOf(title), 'legendary', title);
  }
  // Legendary is meant to stay scarce.
  const all = [...badges.TITLE_RARITY.values()];
  const legendary = all.filter(r => r === 'legendary').length;
  assert.ok(legendary / all.length < 0.3, 'legendary should be a minority of titles');
});

test('every flair title has a rarity, and only known rarities are used', () => {
  const valid = new Set(badges.RARITY_ORDER);
  for (const badge of badges.BADGES.filter(b => b.title)) {
    const rarity = badges.rarityOf(badge.title);
    assert.ok(valid.has(rarity), `${badge.title} has rarity ${rarity}`);
  }
});

test('the title picker lists the rarest first', () => {
  const earned = ['early_bird', 'tonnage_2000', 'century_workouts', 'year_of_iron'];
  const listed = badges.titlesWithRarity(earned);
  assert.deepStrictEqual(listed.map(t => t.rarity), ['legendary', 'epic', 'rare', 'common']);
  assert.strictEqual(listed[0].title, 'Mountain Mover');
});

test('missing stats are treated as zero rather than crashing', () => {
  for (const stats of [null, undefined, {}, { workouts_total: null }, { workouts_total: 'abc' }]) {
    const evaluated = badges.evaluate(stats, []);
    assert.strictEqual(evaluated.filter(b => b.earned).length, 0);
    assert.ok(evaluated.every(b => Number.isFinite(b.percent)));
  }
});
