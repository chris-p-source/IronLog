const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const goals = require('../services/goals');

router.use(auth);

const MAX_NAME = 100;

router.get('/', async (req, res) => {
  try {
    await goals.syncAchievements(req.user.id);
    const rows = await db.query(
      `SELECT * FROM exercise_goals WHERE user_id = $1
       ORDER BY achieved_at IS NOT NULL, created_at DESC`,
      [req.user.id]
    );
    res.json(await Promise.all(rows.rows.map(g => goals.describe(req.user.id, g))));
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
    res.status(201).json(await goals.describeById(req.user.id, result.rows[0].id));
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
       SET target_weight_kg = $3, target_reps = $4, achieved_at = NULL, created_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id, parsed.weight, parsed.reps]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Goal not found' });
    res.json(await goals.describeById(req.user.id, result.rows[0].id));
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
