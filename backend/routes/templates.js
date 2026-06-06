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

router.post('/', async (req, res) => {
  const { name, exercises } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query(
      'INSERT INTO workout_templates (user_id, name) VALUES ($1, $2) RETURNING *',
      [req.user.id, name]
    );
    const template = t.rows[0];
    if (exercises && exercises.length > 0) {
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await client.query(
          'INSERT INTO template_exercises (template_id, name, sets, reps, order_index) VALUES ($1, $2, $3, $4, $5)',
          [template.id, ex.name, ex.sets || 3, ex.reps || 10, i]
        );
      }
    }
    await client.query('COMMIT');
    const exResult = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [template.id]
    );
    res.json({ ...template, exercises: exResult.rows });
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
      'SELECT id FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    if (name) {
      await client.query(
        'UPDATE workout_templates SET name = $1, updated_at = NOW() WHERE id = $2',
        [name, req.params.id]
      );
    }
    if (exercises) {
      await client.query('DELETE FROM template_exercises WHERE template_id = $1', [req.params.id]);
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i];
        await client.query(
          'INSERT INTO template_exercises (template_id, name, sets, reps, order_index) VALUES ($1, $2, $3, $4, $5)',
          [req.params.id, ex.name, ex.sets || 3, ex.reps || 10, i]
        );
      }
    }
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
