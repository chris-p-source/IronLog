const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/exercises', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT se.exercise_name
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL
       ORDER BY se.exercise_name`,
      [req.user.id]
    );
    res.json(result.rows.map(r => r.exercise_name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/exercise/:name', async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.name);
    const sessions = await db.query(
      `SELECT
         ws.completed_at::date as workout_date,
         ws.id as session_id,
         ws.template_name,
         COUNT(ss.id) as sets_completed,
         MAX(ss.weight_kg) as max_weight,
         SUM(ss.weight_kg * ss.reps_completed) as total_volume,
         MAX(ss.reps_completed) as max_reps,
         AVG(ss.weight_kg) as avg_weight
       FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ws.user_id = $1
         AND ws.completed_at IS NOT NULL
         AND se.exercise_name = $2
       GROUP BY ws.id, ws.completed_at, ws.template_name
       ORDER BY ws.completed_at ASC`,
      [req.user.id, exerciseName]
    );
    const pr = await db.query(
      `SELECT MAX(ss.weight_kg) as pr_weight, MAX(ss.reps_completed) as pr_reps
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_name = $2`,
      [req.user.id, exerciseName]
    );
    res.json({ exercise: exerciseName, sessions: sessions.rows, pr: pr.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
