const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { epley, forecast } = require('../services/goalForecast');

router.use(auth);

const MAX_NAME = 100;

// Per-session best estimated 1RM for one exercise, oldest first — the series
// the forecast is fitted to.
async function sessionSeries(userId, exerciseName) {
  const result = await db.query(
    `SELECT ws.completed_at::date AS workout_date,
            MAX(ss.weight_kg * (1 + ss.reps_completed / 30.0)) AS best_e1rm
     FROM workout_sessions ws
     JOIN session_exercises se ON se.session_id = ws.id
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE ws.user_id = $1
       AND se.exercise_name = $2
       AND ws.completed_at IS NOT NULL
       AND ss.weight_kg > 0
       AND ss.reps_completed > 0
     GROUP BY ws.id, ws.completed_at
     ORDER BY ws.completed_at ASC`,
    [userId, exerciseName]
  );
  return result.rows.map(r => ({
    date: new Date(r.workout_date),
    e1rm: parseFloat(r.best_e1rm),
  }));
}

// The best single set actually performed, which is what the goal is ticked off
// against — a goal of 100 kg x 5 wants a real 100 kg x 5, not an equivalent.
async function bestAgainstTarget(userId, goal) {
  const result = await db.query(
    `SELECT MAX(ss.weight_kg) AS best_weight,
            MAX(ss.reps_completed) FILTER (WHERE ss.weight_kg >= $3) AS best_reps_at_weight,
            MIN(ws.completed_at) FILTER (
              WHERE ss.weight_kg >= $3 AND ss.reps_completed >= $4
            ) AS first_met
     FROM workout_sessions ws
     JOIN session_exercises se ON se.session_id = ws.id
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE ws.user_id = $1
       AND se.exercise_name = $2
       AND ws.completed_at IS NOT NULL
       AND ss.weight_kg > 0`,
    [userId, goal.exercise_name, goal.target_weight_kg, goal.target_reps]
  );
  const row = result.rows[0] || {};
  return {
    bestWeight: row.best_weight ? parseFloat(row.best_weight) : 0,
    bestRepsAtTargetWeight: row.best_reps_at_weight ? parseInt(row.best_reps_at_weight) : 0,
    firstMet: row.first_met || null,
  };
}

// Everything the goals card needs for one goal.
async function describe(userId, goal, now = new Date()) {
  const target = {
    weight: parseFloat(goal.target_weight_kg),
    reps: parseInt(goal.target_reps),
  };
  const targetE1rm = epley(target.weight, target.reps);

  const [series, best] = await Promise.all([
    sessionSeries(userId, goal.exercise_name),
    bestAgainstTarget(userId, goal),
  ]);

  // Stamp it the first time the history shows the goal was met, so a goal
  // added after the fact still reads as achieved.
  let achievedAt = goal.achieved_at;
  if (!achievedAt && best.firstMet) {
    const stamped = await db.query(
      'UPDATE exercise_goals SET achieved_at = $2 WHERE id = $1 AND achieved_at IS NULL RETURNING achieved_at',
      [goal.id, best.firstMet]
    );
    achievedAt = stamped.rows[0]?.achieved_at || best.firstMet;
  }

  const currentE1rm = series.reduce((max, s) => Math.max(max, s.e1rm), 0);

  return {
    id: goal.id,
    exercise_name: goal.exercise_name,
    target_weight_kg: target.weight,
    target_reps: target.reps,
    created_at: goal.created_at,
    achieved_at: achievedAt,
    current_best_weight_kg: best.bestWeight,
    best_reps_at_target_weight: best.bestRepsAtTargetWeight,
    current_e1rm: Math.round(currentE1rm * 10) / 10,
    target_e1rm: Math.round(targetE1rm * 10) / 10,
    // How close the strength is, capped so an achieved goal reads as 100.
    percent: targetE1rm > 0 ? Math.min(100, Math.round((currentE1rm / targetE1rm) * 100)) : 0,
    forecast: achievedAt ? { status: 'achieved' } : forecast({ sessions: series, targetE1rm, now }),
  };
}

router.get('/', async (req, res) => {
  try {
    const goals = await db.query(
      `SELECT * FROM exercise_goals WHERE user_id = $1
       ORDER BY achieved_at IS NOT NULL, created_at DESC`,
      [req.user.id]
    );
    res.json(await Promise.all(goals.rows.map(g => describe(req.user.id, g))));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function validate({ exercise_name, target_weight_kg, target_reps }) {
  const name = typeof exercise_name === 'string' ? exercise_name.trim() : '';
  if (!name) return { error: 'Exercise is required' };
  if (name.length > MAX_NAME) return { error: 'Exercise name is too long' };

  const weight = Number(target_weight_kg);
  if (!Number.isFinite(weight) || weight <= 0) return { error: 'Target weight must be a positive number' };
  if (weight > 1000) return { error: 'Target weight is not realistic' };

  const reps = Number(target_reps);
  if (!Number.isInteger(reps) || reps <= 0) return { error: 'Target reps must be a whole number' };
  if (reps > 100) return { error: 'Target reps is not realistic' };

  return { name, weight, reps };
}

router.post('/', async (req, res) => {
  const parsed = validate(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    // One goal per exercise: setting a new target replaces the old one, and
    // clears the achievement so the new target starts unmet.
    const result = await db.query(
      `INSERT INTO exercise_goals (user_id, exercise_name, target_weight_kg, target_reps)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, exercise_name)
       DO UPDATE SET target_weight_kg = EXCLUDED.target_weight_kg,
                     target_reps = EXCLUDED.target_reps,
                     achieved_at = NULL,
                     created_at = NOW()
       RETURNING *`,
      [req.user.id, parsed.name, parsed.weight, parsed.reps]
    );
    res.status(201).json(await describe(req.user.id, result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  const parsed = validate({ exercise_name: 'x', ...req.body });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const result = await db.query(
      `UPDATE exercise_goals
       SET target_weight_kg = $3, target_reps = $4, achieved_at = NULL
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id, parsed.weight, parsed.reps]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
    res.json(await describe(req.user.id, result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM exercise_goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.describe = describe;
module.exports.sessionSeries = sessionSeries;
