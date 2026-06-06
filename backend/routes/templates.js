const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const templates = await db.query(
      'SELECT * FROM workout_templates WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    const result = [];
    for (const t of templates.rows) {
      const exercises = await db.query(
        'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
        [t.id]
      );
      result.push({ ...t, exercises: exercises.rows });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await db.query(
      'SELECT * FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const exercises = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [req.params.id]
    );
    res.json({ ...t.rows[0], exercises: exercises.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function upsertExercises(client, templateId, exercises, templateType) {
  await client.query('DELETE FROM template_exercises WHERE template_id = $1', [templateId]);
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const isCardio = templateType === 'cardio';
    await client.query(
      `INSERT INTO template_exercises
         (template_id, name, exercise_type, sets, reps, planned_duration_minutes, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        templateId,
        ex.name,
        isCardio ? 'cardio' : 'strength',
        isCardio ? 0 : (parseInt(ex.sets) || 3),
        isCardio ? 0 : (parseInt(ex.reps) || 10),
        isCardio ? (parseInt(ex.planned_duration_minutes) || 30) : null,
        i,
      ]
    );
  }
}

router.post('/', async (req, res) => {
  const { name, template_type, exercises } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const type = template_type === 'cardio' ? 'cardio' : 'strength';
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(
      'INSERT INTO workout_templates (user_id, name, template_type) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name, type]
    );
    if (exercises?.length) await upsertExercises(client, t.rows[0].id, exercises, type);
    await client.query('COMMIT');
    const exResult = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [t.rows[0].id]
    );
    res.json({ ...t.rows[0], exercises: exResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { name, exercises } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      'SELECT * FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    const templateType = check.rows[0].template_type || 'strength';
    if (name) {
      await client.query(
        'UPDATE workout_templates SET name = $1, updated_at = NOW() WHERE id = $2',
        [name, req.params.id]
      );
    }
    if (exercises) await upsertExercises(client, req.params.id, exercises, templateType);
    await client.query('COMMIT');
    const t = await db.query('SELECT * FROM workout_templates WHERE id = $1', [req.params.id]);
    const exResult = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [req.params.id]
    );
    res.json({ ...t.rows[0], exercises: exResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const check = await db.query(
      'SELECT id FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM workout_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
