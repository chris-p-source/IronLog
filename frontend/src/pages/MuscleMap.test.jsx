import { describe, it, expect } from 'vitest';
import { classify, MUSCLE_GROUPS } from './MuscleMap';
// The catalogue is the backend's, deliberately: this test exists to catch the
// two drifting apart when exercises are added.
import { STRENGTH_EXERCISES } from '../../../backend/data/exercises';

describe('muscle map classification', () => {
  // An exercise the map cannot place contributes nothing to anyone's fatigue
  // scores, so it is worse than useless — it is silently missing.
  it('places every exercise in the catalogue', () => {
    const unplaced = STRENGTH_EXERCISES
      .filter(ex => classify(ex.name).length === 0)
      .map(ex => ex.name);
    expect(unplaced).toEqual([]);
  });

  it('only ever names groups it can label', () => {
    for (const ex of STRENGTH_EXERCISES) {
      for (const group of classify(ex.name)) {
        expect(MUSCLE_GROUPS[group], `${ex.name} -> ${group}`).toBeTruthy();
      }
    }
  });

  it.each([
    ['Glute Abduction Machine', 'glutes'],
    ['Hip Adduction Machine', 'glutes'],
    ['Barbell Bench Press', 'chest'],
    ['Lat Pulldown', 'back'],
    ['Lying Leg Curl', 'hamstrings'],
    ['Standing Calf Raise', 'calves'],
    ['Pallof Press', 'core'],
    ['Goblet Squat', 'quads'],
    ['Machine Lateral Raise', 'shoulders'],
    ['Rope Tricep Pushdown', 'triceps'],
    ['Spider Curl', 'biceps'],
    ['Wrist Curl', 'forearms'],
  ])('puts %s in %s', (name, group) => {
    expect(classify(name)).toContain(group);
  });

  // A wrist curl is not a biceps curl, however much the word "curl" suggests it.
  it('does not count wrist curls as biceps work', () => {
    expect(classify('Wrist Curl')).not.toContain('biceps');
    expect(classify('Reverse Wrist Curl')).not.toContain('biceps');
    // ...while a normal curl still is.
    expect(classify('Barbell Curl')).toContain('biceps');
  });

  it('still handles an exercise name nobody planned for', () => {
    expect(classify('Something Invented')).toEqual([]);
    expect(classify('')).toEqual([]);
    expect(classify(undefined)).toEqual([]);
  });
});
