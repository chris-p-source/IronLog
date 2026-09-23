const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const sharing = require('../services/templateSharing');

router.use(auth);

// The shared library. Declared before /:id so "shared" is never read as an id.
router.get('/shared', async (req, res) => {
  try {
    res.json(await sharing.browse(req.user.id, { search: req.query.search, type: req.query.type }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/shared/:id', async (req, res) => {
  try {
    const template = await sharing.detail(req.user.id, req.params.id);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/shared/:id/add', async (req, res) => {
  try {
    const result = await sharing.addToMyTemplates(req.user.id, req.params.id);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Template not found' });
    if (result.error === 'own_template') {
      return res.status(400).json({ error: 'This is already your template' });
    }
    res.status(201).json(result.template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/share', async (req, res) => {
  try {
    const result = await sharing.setShared(req.user.id, req.params.id, {
      shared: req.body.shared,
      description: req.body.description,
    });
    if (result.error === 'not_found') return res.status(404).json({ error: 'Not found' });
    if (result.error === 'empty') {
      return res.status(400).json({ error: 'Add an exercise before sharing this template' });
    }
    res.json(result.template);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const templates = await db.query(
      `SELECT t.*, src.username AS source_author,
              (SELECT COUNT(*) FROM template_adds ta WHERE ta.template_id = t.id) AS add_count
       FROM workout_templates t
       LEFT JOIN users src ON src.id = t.source_author_id
       WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    const result = [];
    for (const t of templates.rows) {
      const exercises = await db.query(
        'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
        [t.id]
      );
      result.push({ ...t, add_count: parseInt(t.add_count) || 0, exercises: exercises.rows });
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
         (template_id, name, exercise_type, sets, reps, planned_duration_minutes, rest_seconds, base_weight_kg, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        templateId,
        ex.name,
        isCardio ? 'cardio' : 'strength',
        isCardio ? 0 : (parseInt(ex.sets) || 3),
        isCardio ? 0 : (parseInt(ex.reps) || 10),
        isCardio ? (parseInt(ex.planned_duration_minutes) || 30) : null,
        isCardio ? 120 : (parseInt(ex.rest_seconds) || 120),
        isCardio ? null : (ex.base_weight_kg ? parseFloat(ex.base_weight_kg) : null),
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

router.post('/:id/duplicate', async (req, res) => {
  const client = await db.connect();
  try {
    const src = await client.query(
      'SELECT * FROM workout_templates WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (src.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const t = src.rows[0];
    const copy = await client.query(
      `INSERT INTO workout_templates (user_id, name, template_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, `${t.name} (Copy)`, t.template_type]
    );
    await sharing.copyExercises(client, t.id, copy.rows[0].id);
    const newExercises = await client.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [copy.rows[0].id]
    );
    res.json({ ...copy.rows[0], exercises: newExercises.rows });
  } catch (err) {
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
