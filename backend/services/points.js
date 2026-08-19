const db = require('../db');

// The app's scoring, in one place: a point per strength rep, two per cardio
// minute. Levels read the same lifetime total the leaderboard ranks on, so
// there is only ever one number to explain.

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

const LIFETIME_XP = `
  ROUND(
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
  )
`;

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

module.exports = { getGoldMedals, getGoldMedalsMap, lifetimeXp, lifetimeXpMap, RANKED_WEEKS };
