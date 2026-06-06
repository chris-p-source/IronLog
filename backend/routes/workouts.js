const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.post('/start', async (req, res) => {
  const { template_id } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const tmpl = await client.query(
      'SELECT * FROM workout_templates WHERE id = $1 AND user_id = $2',
      [template_id, req.user.id]
    );
    if (tmpl.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }
    const template = tmpl.rows[0];
    const session = await client.query(
      `INSERT INTO workout_sessions
         (user_id, template_id, template_name, template_type, started_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [req.user.id, template_id, template.name, template.template_type || 'strength']
    );
    const exercises = await client.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [template_id]
    );
    const sessionId = session.rows[0].id;
    for (const ex of exercises.rows) {
      await client.query(
        `INSERT INTO session_exercises
           (session_id, exercise_name, exercise_type, sets_planned, reps_planned, planned_duration_minutes, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sessionId, ex.name, ex.exercise_type || 'strength', ex.sets || 0, ex.reps || 0, ex.planned_duration_minutes || null, ex.order_index]
      );
    }
    await client.query('COMMIT');
    const sessEx = await db.query(
      'SELECT * FROM session_exercises WHERE session_id = $1 ORDER BY order_index',
      [sessionId]
    );
    res.json({ session: session.rows[0], exercises: sessEx.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/:sessionId/log-set', async (req, res) => {
  const { session_exercise_id, set_number, reps_completed, weight_kg } = req.body;
  try {
    const sess = await db.query(
      `SELECT ws.id FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id
       WHERE ws.id = $1 AND ws.user_id = $2 AND se.id = $3`,
      [req.params.sessionId, req.user.id, session_exercise_id]
    );
    if (sess.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await db.query(
      `INSERT INTO session_sets (session_exercise_id, set_number, reps_completed, weight_kg, completed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (session_exercise_id, set_number)
       DO UPDATE SET reps_completed = $3, weight_kg = $4, completed_at = NOW()`,
      [session_exercise_id, set_number, reps_completed, weight_kg || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:sessionId/log-cardio', async (req, res) => {
  const { session_exercise_id, duration_minutes, cardio_metrics } = req.body;
  try {
    const sess = await db.query(
      `SELECT ws.id FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id
       WHERE ws.id = $1 AND ws.user_id = $2 AND se.id = $3`,
      [req.params.sessionId, req.user.id, session_exercise_id]
    );
    if (sess.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await db.query(
      'UPDATE session_exercises SET actual_duration_minutes = $1, cardio_metrics = $2 WHERE id = $3',
      [duration_minutes, cardio_metrics ? JSON.stringify(cardio_metrics) : null, session_exercise_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:sessionId/complete', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE workout_sessions
       SET completed_at = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
       WHERE id = $1 AND user_id = $2 AND completed_at IS NULL
       RETURNING *`,
      [req.params.sessionId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found or already completed' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { type } = req.query; // 'strength' | 'cardio' | undefined (all)
    const typeFilter = type ? `AND ws.template_type = '${type === 'cardio' ? 'cardio' : 'strength'}'` : '';
    const result = await db.query(
      `SELECT ws.*,
         COUNT(DISTINCT se.id) as exercise_count,
         COUNT(ss.id) as total_sets_completed
       FROM workout_sessions ws
       LEFT JOIN session_exercises se ON se.session_id = ws.id
       LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL ${typeFilter}
       GROUP BY ws.id
       ORDER BY ws.completed_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:sessionId', async (req, res) => {
  try {
    const sess = await db.query(
      'SELECT * FROM workout_sessions WHERE id = $1 AND user_id = $2',
      [req.params.sessionId, req.user.id]
    );
    if (sess.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const exercises = await db.query(
      'SELECT * FROM session_exercises WHERE session_id = $1 ORDER BY order_index',
      [req.params.sessionId]
    );
    const result = [];
    for (const ex of exercises.rows) {
      const sets = await db.query(
        'SELECT * FROM session_sets WHERE session_exercise_id = $1 ORDER BY set_number',
        [ex.id]
      );
      result.push({ ...ex, sets: sets.rows });
    }
    res.json({ session: sess.rows[0], exercises: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
