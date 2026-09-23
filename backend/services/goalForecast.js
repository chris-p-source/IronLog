// Forecasting when a strength goal will be hit.
//
// Progress is measured in estimated 1RM (Epley, the same formula the workout
// runner and personal bests already use), so that a goal of 100 kg x 5 and a
// session of 110 kg x 2 sit on one scale and reps count towards a weight goal.
//
// Note what this does and does not claim: it projects when your strength
// reaches the level the goal implies, not the day you will literally perform
// that exact set. Actually ticking the goal off needs a real set at or above
// both numbers — see routes/goals.js.
//
// The method is a least-squares line through recent session bests. That is a
// deliberately simple model and it is optimistic over long horizons, because
// strength gains flatten out rather than continuing in a straight line. Hence
// the horizon cap below, and the refusal to guess from thin or flat data — a
// confident-looking date from four noisy points would be worse than none.

const MIN_SESSIONS = 4;
// Enough time for a trend to mean anything rather than reflecting one good day.
const MIN_SPAN_DAYS = 21;
// "Current rate" means recent rate: a lifter two years in should not be judged
// on the fast newbie gains at the start of their history.
const WINDOW_DAYS = 120;
// Past this, a projection is arithmetic rather than a forecast.
const HORIZON_WEEKS = 104;

const DAY_MS = 24 * 60 * 60 * 1000;

function epley(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!(w > 0) || !(r > 0)) return 0;
  return w * (1 + r / 30);
}

// Least squares fit of y = intercept + slope*x, plus the r² that says how much
// of the movement the line actually explains.
function regress(points) {
  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    ssRes += (p.y - (intercept + slope * p.x)) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// Recent sessions, falling back to the last few when the window is too sparse —
// someone training fortnightly still deserves a forecast.
function windowed(sessions) {
  if (sessions.length === 0) return [];
  const latest = sessions[sessions.length - 1].date.getTime();
  const recent = sessions.filter(s => latest - s.date.getTime() <= WINDOW_DAYS * DAY_MS);
  return recent.length >= MIN_SESSIONS ? recent : sessions.slice(-MIN_SESSIONS);
}

function confidenceFrom(r2, sessionCount) {
  if (r2 >= 0.6 && sessionCount >= 6) return 'high';
  if (r2 >= 0.3 && sessionCount >= 4) return 'medium';
  return 'low';
}

// sessions: [{ date: Date, e1rm: number }] oldest first, one entry per session.
function forecast({ sessions = [], targetE1rm, now = new Date() }) {
  const usable = sessions
    .filter(s => s.e1rm > 0 && s.date instanceof Date && !isNaN(s.date))
    .sort((a, b) => a.date - b.date);

  const currentBest = usable.reduce((max, s) => Math.max(max, s.e1rm), 0);
  const base = { currentE1rm: currentBest, targetE1rm, sessionsUsed: 0 };

  if (usable.length < MIN_SESSIONS) {
    return { ...base, status: 'not_enough_data', sessionsNeeded: MIN_SESSIONS - usable.length };
  }

  const points = windowed(usable);
  const spanDays = (points[points.length - 1].date - points[0].date) / DAY_MS;
  if (spanDays < MIN_SPAN_DAYS) {
    return { ...base, status: 'not_enough_data', sessionsUsed: points.length };
  }

  const start = points[0].date.getTime();
  const fit = regress(points.map(s => ({ x: (s.date.getTime() - start) / DAY_MS, y: s.e1rm })));
  if (!fit) return { ...base, status: 'not_enough_data', sessionsUsed: points.length };

  const ratePerWeek = fit.slope * 7;
  const confidence = confidenceFrom(fit.r2, points.length);
  const trend = {
    ...base,
    sessionsUsed: points.length,
    ratePerWeek,
    r2: fit.r2,
    confidence,
  };

  // A flat or falling trend cannot reach anything above it. Saying so is more
  // use than a date somewhere in the next century.
  if (ratePerWeek <= 0) return { ...trend, status: 'no_upward_trend' };

  const daysSinceStart = (now.getTime() - start) / DAY_MS;
  const fittedNow = fit.intercept + fit.slope * daysSinceStart;

  // The trend already sits at the target: the strength is there, it just needs
  // a session that actually puts the numbers on the bar.
  if (fittedNow >= targetE1rm) return { ...trend, status: 'within_reach', weeksRemaining: 0 };

  const daysRemaining = (targetE1rm - fittedNow) / fit.slope;
  const weeksRemaining = daysRemaining / 7;
  if (weeksRemaining > HORIZON_WEEKS) {
    return { ...trend, status: 'beyond_horizon', horizonWeeks: HORIZON_WEEKS };
  }

  return {
    ...trend,
    status: 'ready',
    weeksRemaining,
    projectedDate: new Date(now.getTime() + daysRemaining * DAY_MS),
  };
}

module.exports = {
  epley, regress, forecast, windowed, confidenceFrom,
  MIN_SESSIONS, MIN_SPAN_DAYS, WINDOW_DAYS, HORIZON_WEEKS,
};
