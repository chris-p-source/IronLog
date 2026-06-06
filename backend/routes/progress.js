const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

// List exercises, optionally filtered by type
router.get('/exercises', async (req, res) => {
  try {
    const { type } = req.query; // 'strength' | 'cardio' | undefined (all)
    const typeFilter = type ? `AND se.exercise_type = '${type === 'cardio' ? 'cardio' : 'strength'}'` : '';
    const result = await db.query(
      `SELECT DISTINCT se.exercise_name, se.exercise_type
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL ${typeFilter}
       ORDER BY se.exercise_name`,
      [req.user.id]
    );
    res.json(result.rows.map(r => r.exercise_name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Last completed session data for a specific exercise (used in RunWorkout)
router.get('/last-session/:exerciseName', async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.exerciseName);
    const userId = req.query.userId ? parseInt(req.query.userId) : req.user.id;

    if (userId !== req.user.id) {
      const check = await db.query('SELECT is_public FROM users WHERE id = $1', [userId]);
      if (!check.rows[0]?.is_public) return res.json(null);
    }

    const lastSession = await db.query(
      `SELECT ws.id, ws.completed_at
       FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_name = $2
       ORDER BY ws.completed_at DESC LIMIT 1`,
      [userId, exerciseName]
    );

    if (lastSession.rows.length === 0) return res.json(null);

    const sessionId = lastSession.rows[0].id;
    const completedAt = lastSession.rows[0].completed_at;

    const exercise = await db.query(
      `SELECT id, exercise_type, sets_planned, reps_planned, actual_duration_minutes, cardio_metrics
       FROM session_exercises WHERE session_id = $1 AND exercise_name = $2`,
      [sessionId, exerciseName]
    );

    if (exercise.rows.length === 0) return res.json(null);
    const ex = exercise.rows[0];

    const sets = await db.query(
      `SELECT set_number, reps_completed, weight_kg
       FROM session_sets WHERE session_exercise_id = $1 ORDER BY set_number`,
      [ex.id]
    );

    res.json({
      completed_at: completedAt,
      exercise_type: ex.exercise_type,
      sets_planned: ex.sets_planned,
      reps_planned: ex.reps_planned,
      actual_duration_minutes: ex.actual_duration_minutes,
      cardio_metrics: ex.cardio_metrics,
      sets: sets.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Progress data for a specific exercise — handles both strength and cardio
router.get('/exercise/:name', async (req, res) => {
  try {
    const exerciseName = decodeURIComponent(req.params.name);
    const userId = req.query.userId ? parseInt(req.query.userId) : req.user.id;

    if (userId !== req.user.id) {
      const check = await db.query('SELECT is_public FROM users WHERE id = $1', [userId]);
      if (!check.rows[0]?.is_public) return res.status(403).json({ error: 'Profile is private' });
    }

    // Detect exercise type
    const typeCheck = await db.query(
      `SELECT exercise_type FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND se.exercise_name = $2 AND ws.completed_at IS NOT NULL
       LIMIT 1`,
      [userId, exerciseName]
    );
    const exerciseType = typeCheck.rows[0]?.exercise_type || 'strength';

    if (exerciseType === 'cardio') {
      // Cardio: return duration + metrics per session
      const sessions = await db.query(
        `SELECT
           ws.completed_at::date as workout_date,
           ws.id as session_id,
           ws.template_name,
           se.actual_duration_minutes,
           se.cardio_metrics
         FROM workout_sessions ws
         JOIN session_exercises se ON se.session_id = ws.id
         WHERE ws.user_id = $1
           AND ws.completed_at IS NOT NULL
           AND se.exercise_name = $2
           AND se.exercise_type = 'cardio'
         ORDER BY ws.completed_at ASC`,
        [userId, exerciseName]
      );

      const rows = sessions.rows;
      const totalMinutes = rows.reduce((a, r) => a + (parseFloat(r.actual_duration_minutes) || 0), 0);
      const bestSession = rows.reduce((best, r) =>
        (parseFloat(r.actual_duration_minutes) || 0) > (parseFloat(best?.actual_duration_minutes) || 0) ? r : best, null
      );

      res.json({
        exercise: exerciseName,
        exercise_type: 'cardio',
        sessions: rows,
        summary: {
          total_sessions: rows.length,
          total_minutes: Math.round(totalMinutes),
          best_duration: bestSession?.actual_duration_minutes ? parseFloat(bestSession.actual_duration_minutes) : null,
        },
      });
    } else {
      // Strength: return sets/weight/volume per session
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
        [userId, exerciseName]
      );

      const pr = await db.query(
        `SELECT MAX(ss.weight_kg) as pr_weight, MAX(ss.reps_completed) as pr_reps
         FROM session_exercises se
         JOIN workout_sessions ws ON ws.id = se.session_id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_name = $2`,
        [userId, exerciseName]
      );

      res.json({
        exercise: exerciseName,
        exercise_type: 'strength',
        sessions: sessions.rows,
        pr: pr.rows[0],
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
