const test = require('node:test');
const assert = require('node:assert');
const f = require('../services/goalForecast');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-23T12:00:00Z');

// Sessions every `everyDays` days ending today, gaining `gainPerSession` each.
function series({ start, gainPerSession, count, everyDays = 7, end = NOW }) {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end.getTime() - (count - 1 - i) * everyDays * DAY),
    e1rm: start + i * gainPerSession,
  }));
}

test('estimated 1RM follows Epley, matching the rest of the app', () => {
  assert.strictEqual(f.epley(100, 1), 100 * (1 + 1 / 30));
  assert.strictEqual(Math.round(f.epley(100, 5) * 100) / 100, 116.67);
  assert.strictEqual(f.epley(0, 5), 0);
  assert.strictEqual(f.epley(100, 0), 0);
  assert.strictEqual(f.epley(null, undefined), 0);
});

test('a clean upward trend gives back the rate that made it', () => {
  // 2 kg per weekly session is 2 kg a week.
  const fit = f.regress(series({ start: 100, gainPerSession: 2, count: 8 })
    .map((s, i) => ({ x: i * 7, y: s.e1rm })));
  assert.strictEqual(Math.round(fit.slope * 7 * 100) / 100, 2);
  assert.strictEqual(Math.round(fit.r2), 1, 'a straight line explains itself perfectly');
});

test('a forecast projects the date the trend reaches the target', () => {
  // 120 now, gaining 2 a week, target 130 -> five weeks.
  const result = f.forecast({
    sessions: series({ start: 106, gainPerSession: 2, count: 8 }),
    targetE1rm: 130,
    now: NOW,
  });

  assert.strictEqual(result.status, 'ready');
  assert.strictEqual(Math.round(result.ratePerWeek * 100) / 100, 2);
  assert.strictEqual(Math.round(result.weeksRemaining), 5);

  const days = (result.projectedDate - NOW) / DAY;
  assert.ok(Math.abs(days - 35) < 1, `projected ${days} days out`);
  assert.strictEqual(result.confidence, 'high');
});

test('thin history is refused rather than guessed at', () => {
  const result = f.forecast({ sessions: series({ start: 100, gainPerSession: 2, count: 3 }), targetE1rm: 130, now: NOW });
  assert.strictEqual(result.status, 'not_enough_data');
  assert.strictEqual(result.sessionsNeeded, 1);
  assert.strictEqual(result.currentE1rm, 104, 'it still reports where they are');
});

test('sessions crammed into a few days are not a trend', () => {
  // Four sessions, but all inside a week.
  const result = f.forecast({
    sessions: series({ start: 100, gainPerSession: 2, count: 4, everyDays: 2 }),
    targetE1rm: 130,
    now: NOW,
  });
  assert.strictEqual(result.status, 'not_enough_data');
});

test('a flat or falling trend says so instead of naming a date', () => {
  const flat = f.forecast({ sessions: series({ start: 100, gainPerSession: 0, count: 8 }), targetE1rm: 130, now: NOW });
  assert.strictEqual(flat.status, 'no_upward_trend');

  const falling = f.forecast({ sessions: series({ start: 120, gainPerSession: -1, count: 8 }), targetE1rm: 130, now: NOW });
  assert.strictEqual(falling.status, 'no_upward_trend');
  assert.ok(falling.ratePerWeek < 0, 'and reports the rate so they can see why');
});

test('a target already within the trend is flagged as within reach', () => {
  const result = f.forecast({ sessions: series({ start: 110, gainPerSession: 2, count: 8 }), targetE1rm: 120, now: NOW });
  assert.strictEqual(result.status, 'within_reach');
  assert.strictEqual(result.weeksRemaining, 0);
});

// A date decades out is arithmetic, not a forecast.
test('a target years away is reported as beyond the horizon', () => {
  const result = f.forecast({
    sessions: series({ start: 100, gainPerSession: 0.05, count: 10 }),
    targetE1rm: 300,
    now: NOW,
  });
  assert.strictEqual(result.status, 'beyond_horizon');
  assert.strictEqual(result.horizonWeeks, f.HORIZON_WEEKS);
  assert.ok(result.ratePerWeek > 0, 'the rate is still shown');
});

// "Current rate" has to mean recent rate, or fast early gains flatter a lifter
// who has since stalled.
test('the rate comes from recent sessions, not the whole history', () => {
  const old = series({ start: 60, gainPerSession: 5, count: 10, everyDays: 7, end: new Date(NOW.getTime() - 200 * DAY) });
  const recent = series({ start: 110, gainPerSession: 0.5, count: 10 });
  const result = f.forecast({ sessions: [...old, ...recent], targetE1rm: 130, now: NOW });

  assert.strictEqual(result.status, 'ready');
  assert.ok(result.ratePerWeek < 1, `recent rate was ${result.ratePerWeek}, not the early 5/week`);
  assert.strictEqual(result.sessionsUsed, 10, 'only the recent window is fitted');
});

test('a lifter training fortnightly still gets a forecast', () => {
  const result = f.forecast({
    sessions: series({ start: 110, gainPerSession: 2, count: 4, everyDays: 14 }),
    targetE1rm: 130,
    now: NOW,
  });
  assert.strictEqual(result.status, 'ready');
});

test('noisy progress lowers the confidence but still forecasts', () => {
  const noisy = series({ start: 110, gainPerSession: 1, count: 8 })
    .map((s, i) => ({ ...s, e1rm: s.e1rm + (i % 2 ? 6 : -6) }));
  const result = f.forecast({ sessions: noisy, targetE1rm: 130, now: NOW });

  assert.strictEqual(result.status, 'ready');
  assert.ok(result.r2 < 0.6, `r2 was ${result.r2}`);
  assert.ok(['low', 'medium'].includes(result.confidence));
});

test('rubbish in the series is ignored rather than breaking the fit', () => {
  const messy = [
    { date: new Date('nonsense'), e1rm: 100 },
    { date: new Date(NOW.getTime() - 60 * DAY), e1rm: 0 },
    ...series({ start: 110, gainPerSession: 2, count: 6 }),
  ];
  const result = f.forecast({ sessions: messy, targetE1rm: 130, now: NOW });
  assert.strictEqual(result.status, 'ready');
  assert.strictEqual(result.sessionsUsed, 6);
});

test('no history at all is handled', () => {
  const result = f.forecast({ sessions: [], targetE1rm: 130, now: NOW });
  assert.strictEqual(result.status, 'not_enough_data');
  assert.strictEqual(result.currentE1rm, 0);
});
