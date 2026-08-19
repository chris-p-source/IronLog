const db = require('../db');

// The app's scoring, in one place: a point per strength rep, two per cardio
// minute, plus a per-day amount for weighing in and tracking food.
//
// The leaderboards rank on weekly strength reps and weekly cardio minutes
// separately, never on this combined lifetime total, so tracking XP moves
// levels and the profile total without touching anyone's ranking.

// Weekly totals per user, ranked, for completed weeks only — a week still in
// progress has not been won yet. Shared by the gold-medal counts below, which
// previously carried a copy of this each.
const RANKED_WEEKS = `
  WITH weekly_pts AS (
    SELECT ws.user_id,
      DATE_TRUNC('week', ws.completed_at) AS wk,
      COALESCE(SUM(ss.reps_completed), 0) AS str_pts
    FROM workout_sessions ws
    LEFT JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'strength'
    LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
    WHERE ws.completed_at IS NOT NULL
      AND DATE_TRUNC('week', ws.completed_at) < DATE_TRUNC('week', NOW())
    GROUP BY ws.user_id, DATE_TRUNC('week', ws.completed_at)
  ),
  weekly_cardio AS (
    SELECT ws.user_id,
      DATE_TRUNC('week', ws.completed_at) AS wk,
      COALESCE(SUM(se.actual_duration_minutes * 2), 0) AS crd_pts
    FROM workout_sessions ws
    LEFT JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'cardio'
    WHERE ws.completed_at IS NOT NULL
      AND DATE_TRUNC('week', ws.completed_at) < DATE_TRUNC('week', NOW())
    GROUP BY ws.user_id, DATE_TRUNC('week', ws.completed_at)
  ),
  combined AS (
    SELECT COALESCE(s.user_id, c.user_id) AS user_id,
           COALESCE(s.wk, c.wk) AS wk,
           COALESCE(s.str_pts, 0) + COALESCE(c.crd_pts, 0) AS total_pts
    FROM weekly_pts s
    FULL OUTER JOIN weekly_cardio c ON c.user_id = s.user_id AND c.wk = s.wk
  ),
  ranked AS (
    SELECT user_id, RANK() OVER (PARTITION BY wk ORDER BY total_pts DESC) AS rnk
    FROM combined WHERE total_pts > 0
  )
`;

async function getGoldMedals(userId) {
  try {
    const result = await db.query(
      `${RANKED_WEEKS} SELECT COUNT(*) AS gold_medals FROM ranked WHERE user_id = $1 AND rnk = 1`,
      [userId]
    );
    return parseInt(result.rows[0].gold_medals);
  } catch { return 0; }
}

async function getGoldMedalsMap() {
  try {
    const result = await db.query(
      `${RANKED_WEEKS} SELECT user_id, COUNT(*) AS medals FROM ranked WHERE rnk = 1 GROUP BY user_id`
    );
    const map = {};
    result.rows.forEach(r => { map[parseInt(r.user_id)] = parseInt(r.medals); });
    return map;
  } catch { return {}; }
}

// Tracking earns XP too, per day rather than per entry: XP for each meal logged
// would reward splitting lunch into six entries, and rewards the logging rather
// than the habit. Deliberately a fraction of a training week — both habits every
// day is ~245 XP a week against ~800 from training four times.
const XP_PER_WEIGH_IN = 10;
const XP_PER_NUTRITION_DAY = 25;

// One weigh-in per day is already enforced by the table's unique constraint, so
// there is nothing here to farm.
const WEIGH_IN_DAYS = (user) => `(
  SELECT COUNT(*) FROM user_bodyweights bw WHERE bw.user_id = ${user} AND bw.weight_kg > 0
)`;

// A day counts once it looks like a real day's eating rather than a single
// logged apple.
const NUTRITION_DAYS = (user) => `(
  SELECT COUNT(*) FROM (
    SELECT fl.logged_date
    FROM food_logs fl
    WHERE fl.user_id = ${user}
    GROUP BY fl.logged_date
    HAVING COUNT(*) >= 2 OR COALESCE(SUM(fl.calories), 0) >= 500
  ) tracked_days
)`;

const TRAINING_XP = `(
  COALESCE((
    SELECT SUM(ss.reps_completed)
    FROM session_sets ss
    JOIN session_exercises se ON se.id = ss.session_exercise_id
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = u.id AND ws.completed_at IS NOT NULL
  ), 0)
  + COALESCE((
    SELECT SUM(se.actual_duration_minutes * 2)
    FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = u.id AND ws.completed_at IS NOT NULL AND se.exercise_type = 'cardio'
  ), 0)
)`;

const TRACKING_XP = `(
  ${WEIGH_IN_DAYS('u.id')} * ${XP_PER_WEIGH_IN}
  + ${NUTRITION_DAYS('u.id')} * ${XP_PER_NUTRITION_DAY}
)`;

const LIFETIME_XP = `ROUND(${TRAINING_XP} + ${TRACKING_XP})`;

async function lifetimeXp(userId) {
  const result = await db.query(`SELECT ${LIFETIME_XP} AS xp FROM users u WHERE u.id = $1`, [userId]);
  return parseInt(result.rows[0]?.xp) || 0;
}

// Batched, so putting a level on every leaderboard row costs one query rather
// than one per row.
async function lifetimeXpMap(userIds = []) {
  if (userIds.length === 0) return {};
  const result = await db.query(
    `SELECT u.id, ${LIFETIME_XP} AS xp FROM users u WHERE u.id = ANY($1::int[])`,
    [userIds]
  );
  const map = {};
  result.rows.forEach(r => { map[parseInt(r.id)] = parseInt(r.xp) || 0; });
  return map;
}

// Where the XP came from, so the app can show that logging counts too.
async function xpBreakdown(userId) {
  const result = await db.query(
    `SELECT ROUND(${TRAINING_XP}) AS training, ROUND(${TRACKING_XP}) AS tracking
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return { training: parseInt(row.training) || 0, tracking: parseInt(row.tracking) || 0 };
}

module.exports = {
  getGoldMedals, getGoldMedalsMap, lifetimeXp, lifetimeXpMap, xpBreakdown, RANKED_WEEKS,
  WEIGH_IN_DAYS, NUTRITION_DAYS, XP_PER_WEIGH_IN, XP_PER_NUTRITION_DAY,
};
