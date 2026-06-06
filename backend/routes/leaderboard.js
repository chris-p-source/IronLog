const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

async function getGoldMedalsMap() {
  try {
    const result = await db.query(`
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
               COALESCE(s.str_pts, 0) + COALESCE(c.crd_pts, 0) AS total_pts,
               COALESCE(s.wk, c.wk) AS wk
        FROM weekly_pts s
        FULL OUTER JOIN weekly_cardio c ON c.user_id = s.user_id AND c.wk = s.wk
      ),
      ranked AS (
        SELECT user_id, RANK() OVER (PARTITION BY wk ORDER BY total_pts DESC) AS rnk
        FROM combined WHERE total_pts > 0
      )
      SELECT user_id, COUNT(*) AS medals FROM ranked WHERE rnk = 1 GROUP BY user_id
    `);
    const map = {};
    result.rows.forEach(r => { map[parseInt(r.user_id)] = parseInt(r.medals); });
    return map;
  } catch { return {}; }
}

async function getStrengthPoints(whereClause) {
  const result = await db.query(`
    WITH s AS (
      SELECT ws.user_id, COALESCE(SUM(ss.reps_completed), 0) AS pts
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'strength'
      JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.completed_at IS NOT NULL ${whereClause}
      GROUP BY ws.user_id
    )
    SELECT u.id, u.username, u.avatar_data, ROUND(s.pts) AS total_points
    FROM s JOIN users u ON u.id = s.user_id
    WHERE s.pts > 0
    ORDER BY total_points DESC LIMIT 50
  `);
  return result.rows;
}

async function getCardioMinutes(whereClause) {
  const result = await db.query(`
    SELECT u.id, u.username, u.avatar_data,
      ROUND(SUM(se.actual_duration_minutes)) AS total_minutes
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'cardio'
    JOIN users u ON u.id = ws.user_id
    WHERE ws.completed_at IS NOT NULL AND se.actual_duration_minutes IS NOT NULL ${whereClause}
    GROUP BY u.id, u.username, u.avatar_data
    HAVING SUM(se.actual_duration_minutes) > 0
    ORDER BY total_minutes DESC LIMIT 50
  `);
  return result.rows;
}

const THIS_WEEK = `AND DATE_TRUNC('week', ws.completed_at) = DATE_TRUNC('week', NOW())`;

// Strength leaderboards
router.get('/strength/weekly', async (req, res) => {
  try {
    const [rows, goldMap] = await Promise.all([getStrengthPoints(THIS_WEEK), getGoldMedalsMap()]);
    res.json(rows.map(r => ({ ...r, gold_medals: goldMap[r.id] || 0 })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/strength/alltime', async (req, res) => {
  try {
    const [rows, goldMap] = await Promise.all([getStrengthPoints(''), getGoldMedalsMap()]);
    res.json(rows.map(r => ({ ...r, gold_medals: goldMap[r.id] || 0 })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Cardio leaderboards
router.get('/cardio/weekly', async (req, res) => {
  try {
    const rows = await getCardioMinutes(THIS_WEEK);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/cardio/alltime', async (req, res) => {
  try {
    const rows = await getCardioMinutes('');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
