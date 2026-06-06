const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

// Helper: get points per user for a given time window
async function getPointsForPeriod(whereClause) {
  const result = await db.query(`
    WITH s_pts AS (
      SELECT ws.user_id, COALESCE(SUM(ss.reps_completed), 0) as pts
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'strength'
      JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.completed_at IS NOT NULL ${whereClause}
      GROUP BY ws.user_id
    ),
    c_pts AS (
      SELECT ws.user_id, COALESCE(SUM(se.actual_duration_minutes * 2), 0) as pts
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'cardio'
      WHERE ws.completed_at IS NOT NULL AND se.actual_duration_minutes IS NOT NULL ${whereClause}
      GROUP BY ws.user_id
    ),
    combined AS (
      SELECT COALESCE(s.user_id, c.user_id) as user_id,
        COALESCE(s.pts, 0) + COALESCE(c.pts, 0) as total_points
      FROM s_pts s FULL OUTER JOIN c_pts c ON c.user_id = s.user_id
    )
    SELECT u.id, u.username, u.avatar_data,
      ROUND(combined.total_points) as total_points
    FROM combined
    JOIN users u ON u.id = combined.user_id
    WHERE combined.total_points > 0
    ORDER BY total_points DESC
    LIMIT 50
  `);
  return result.rows;
}

async function getCardioForPeriod(whereClause) {
  const result = await db.query(`
    SELECT u.id, u.username, u.avatar_data,
      ROUND(SUM(se.actual_duration_minutes)) as total_minutes,
      ROUND(SUM(se.actual_duration_minutes) * 2) as total_points
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'cardio'
    JOIN users u ON u.id = ws.user_id
    WHERE ws.completed_at IS NOT NULL AND se.actual_duration_minutes IS NOT NULL ${whereClause}
    GROUP BY u.id, u.username, u.avatar_data
    ORDER BY total_minutes DESC
    LIMIT 50
  `);
  return result.rows;
}

// Weekly leaderboard (current ISO week, Mon–now)
router.get('/weekly', async (req, res) => {
  try {
    const rows = await getPointsForPeriod(
      `AND DATE_TRUNC('week', ws.completed_at) = DATE_TRUNC('week', NOW())`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All-time leaderboard
router.get('/alltime', async (req, res) => {
  try {
    const rows = await getPointsForPeriod('');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cardio leaderboard
router.get('/cardio/weekly', async (req, res) => {
  try {
    const rows = await getCardioForPeriod(
      `AND DATE_TRUNC('week', ws.completed_at) = DATE_TRUNC('week', NOW())`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/cardio/alltime', async (req, res) => {
  try {
    const rows = await getCardioForPeriod('');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
