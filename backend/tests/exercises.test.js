// The exercise catalogue is plain data, but several features key off it: the
// picker, the coverage badge and the muscle map. These guard the invariants
// those features assume.
const test = require('node:test');
const assert = require('node:assert');

const { STRENGTH_EXERCISES, CARDIO_EXERCISES } = require('../data/exercises');
const { GROUP_TO_COVERAGE } = require('../services/gamification');

test('exercise catalogue', async (t) => {
  await t.test('has no duplicate strength exercises', () => {
    const seen = new Map();
    const duplicates = [];
    for (const ex of STRENGTH_EXERCISES) {
      const key = ex.name.toLowerCase();
      if (seen.has(key)) duplicates.push(ex.name);
      seen.set(key, true);
    }
    assert.deepEqual(duplicates, []);
  });

  await t.test('every strength exercise has a name and a group', () => {
    for (const ex of STRENGTH_EXERCISES) {
      assert.ok(ex.name && ex.name.trim(), `missing name: ${JSON.stringify(ex)}`);
      assert.ok(ex.group && ex.group.trim(), `missing group: ${ex.name}`);
    }
  });

  // A group with no coverage mapping quietly stops counting towards the Full
  // Coverage badge, which is the kind of thing nobody notices for months.
  await t.test('every group counts towards muscle coverage', () => {
    const unmapped = [...new Set(STRENGTH_EXERCISES.map(ex => ex.group))]
      .filter(group => !GROUP_TO_COVERAGE[group]);
    // Olympic & Power and Full Body are deliberately excluded: they are whole-
    // body lifts that would satisfy every coverage slot at once.
    assert.deepEqual(unmapped.sort(), ['Full Body', 'Olympic & Power']);
  });

  await t.test('has no duplicate cardio exercises', () => {
    const names = CARDIO_EXERCISES.map(e => e.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
  });

  await t.test('covers the common machine movements', () => {
    const names = new Set(STRENGTH_EXERCISES.map(e => e.name));
    for (const expected of [
      'Glute Abduction Machine',
      'Hip Adduction Machine',
      'Machine Row',
      'Machine Lateral Raise',
      'Smith Machine Squat',
      'Back Extension',
      'Goblet Squat',
      'Rope Tricep Pushdown',
    ]) {
      assert.ok(names.has(expected), `catalogue is missing ${expected}`);
    }
  });
});
