const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/me', async (req, res) => {
  try {
    const user = await db.query(
      'SELECT id, username, avatar_data, is_public, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const stats = await getUserStats(req.user.id);
    res.json({ ...user.rows[0], ...stats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/me', async (req, res) => {
  const { is_public } = req.body;
  try {
    const result = await db.query(
      'UPDATE users SET is_public = $1 WHERE id = $2 RETURNING id, username, avatar_data, is_public',
      [is_public, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/me/avatar', async (req, res) => {
  const { avatar_data } = req.body;
  if (!avatar_data) return res.status(400).json({ error: 'No image data provided' });
  if (avatar_data.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 2MB)' });
  try {
    const result = await db.query(
      'UPDATE users SET avatar_data = $1 WHERE id = $2 RETURNING id, username, avatar_data, is_public',
      [avatar_data, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/me/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, user.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export all of the current user's data as JSON
router.get('/me/export', async (req, res) => {
  try {
    const userId = req.user.id;

    const [user, templates, sessions, bodyweights, prs] = await Promise.all([
      db.query('SELECT id, username, is_public, created_at FROM users WHERE id = $1', [userId]),
      db.query('SELECT * FROM workout_templates WHERE user_id = $1 ORDER BY created_at', [userId]),
      db.query('SELECT * FROM workout_sessions WHERE user_id = $1 ORDER BY started_at', [userId]),
      db.query('SELECT weight_kg, logged_at FROM user_bodyweights WHERE user_id = $1 ORDER BY logged_at', [userId]),
      db.query(
        `SELECT se.exercise_name, MAX(ss.weight_kg) as pr_weight, MAX(ss.reps_completed) as pr_reps
         FROM session_exercises se
         JOIN workout_sessions ws ON ws.id = se.session_id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL
         GROUP BY se.exercise_name
         ORDER BY se.exercise_name`,
        [userId]
      ),
    ]);

    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const templateIds = templates.rows.map(t => t.id);
    const templateExercises = templateIds.length
      ? await db.query('SELECT * FROM template_exercises WHERE template_id = ANY($1) ORDER BY template_id, order_index', [templateIds])
      : { rows: [] };

    const sessionIds = sessions.rows.map(s => s.id);
    const [sessionExercises, sessionSets] = sessionIds.length
      ? await Promise.all([
          db.query('SELECT * FROM session_exercises WHERE session_id = ANY($1) ORDER BY session_id, order_index', [sessionIds]),
          db.query(
            `SELECT ss.* FROM session_sets ss
             JOIN session_exercises se ON se.id = ss.session_exercise_id
             WHERE se.session_id = ANY($1) ORDER BY ss.session_exercise_id, ss.set_number`,
            [sessionIds]
          ),
        ])
      : [{ rows: [] }, { rows: [] }];

    const exercisesByTemplate = {};
    for (const ex of templateExercises.rows) {
      (exercisesByTemplate[ex.template_id] ||= []).push(ex);
    }

    const setsByExercise = {};
    for (const s of sessionSets.rows) {
      (setsByExercise[s.session_exercise_id] ||= []).push(s);
    }
    const exercisesBySession = {};
    for (const ex of sessionExercises.rows) {
      (exercisesBySession[ex.session_id] ||= []).push({ ...ex, sets: setsByExercise[ex.id] || [] });
    }

    res.json({
      exported_at: new Date().toISOString(),
      user: user.rows[0],
      templates: templates.rows.map(t => ({ ...t, exercises: exercisesByTemplate[t.id] || [] })),
      workout_sessions: sessions.rows.map(s => ({ ...s, exercises: exercisesBySession[s.id] || [] })),
      bodyweight_log: bodyweights.rows,
      personal_records: prs.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// View another user's profile — own profile always accessible regardless of is_public
router.get('/:username', async (req, res) => {
  try {
    const user = await db.query(
      'SELECT id, username, avatar_data, is_public, created_at FROM users WHERE username = $1',
      [req.params.username.toLowerCase()]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const profile = user.rows[0];

    const isOwn = parseInt(profile.id) === parseInt(req.user.id);

    if (!isOwn && !profile.is_public) {
      return res.status(403).json({ error: 'This profile is private' });
    }

    const stats = await getUserStats(profile.id);

    // Exercise list only for public profiles or own
    let exercises = [];
    const exResult = await db.query(
      `SELECT DISTINCT se.exercise_name
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_type = 'strength'
       ORDER BY se.exercise_name`,
      [profile.id]
    );
    exercises = exResult.rows.map(r => r.exercise_name);

    res.json({ ...profile, ...stats, exercises, is_own: isOwn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function getUserStats(userId) {
  const [workouts, strengthPts, cardioPts, lastWorkout, goldMedals] = await Promise.all([
    db.query(
      'SELECT COUNT(*) as total FROM workout_sessions WHERE user_id = $1 AND completed_at IS NOT NULL',
      [userId]
    ),
    db.query(
      `SELECT COALESCE(SUM(ss.reps_completed), 0) as pts
       FROM session_sets ss
       JOIN session_exercises se ON se.id = ss.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL`,
      [userId]
    ),
    db.query(
      `SELECT COALESCE(SUM(se.actual_duration_minutes * 2), 0) as pts
       FROM session_exercises se
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.completed_at IS NOT NULL AND se.exercise_type = 'cardio'`,
      [userId]
    ),
    db.query(
      'SELECT completed_at FROM workout_sessions WHERE user_id = $1 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1',
      [userId]
    ),
    getGoldMedals(userId),
  ]);

  return {
    total_workouts: parseInt(workouts.rows[0].total),
    total_points: Math.round(parseFloat(strengthPts.rows[0].pts) + parseFloat(cardioPts.rows[0].pts)),
    last_workout: lastWorkout.rows[0]?.completed_at || null,
    gold_medals: goldMedals,
  };
}

async function getGoldMedals(userId) {
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
               COALESCE(s.wk, c.wk) AS wk,
               COALESCE(s.str_pts, 0) + COALESCE(c.crd_pts, 0) AS total_pts
        FROM weekly_pts s
        FULL OUTER JOIN weekly_cardio c ON c.user_id = s.user_id AND c.wk = s.wk
      ),
      ranked AS (
        SELECT user_id, RANK() OVER (PARTITION BY wk ORDER BY total_pts DESC) AS rnk
        FROM combined WHERE total_pts > 0
      )
      SELECT COUNT(*) AS gold_medals FROM ranked WHERE user_id = $1 AND rnk = 1
    `, [userId]);
    return parseInt(result.rows[0].gold_medals);
  } catch { return 0; }
}

module.exports = router;
module.exports.getGoldMedals = getGoldMedals;
