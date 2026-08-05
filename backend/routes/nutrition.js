const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

// ── Goals ──────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT calories, protein_g, carbs_g, fat_g FROM nutrition_goals WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/goals', async (req, res) => {
  const { calories, protein_g, carbs_g, fat_g } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO nutrition_goals (user_id, calories, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET calories = $2, protein_g = $3, carbs_g = $4, fat_g = $5
       RETURNING calories, protein_g, carbs_g, fat_g`,
      [req.user.id, calories, protein_g, carbs_g, fat_g]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Food logs ──────────────────────────────────────────────────────────────

// GET /nutrition/logs?date=YYYY-MM-DD
router.get('/logs', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const result = await db.query(
      `SELECT id, meal_type, food_name, brand, barcode,
              serving_size_g, calories, protein_g, carbs_g, fat_g, fibre_g
       FROM food_logs
       WHERE user_id = $1 AND logged_date = $2
       ORDER BY created_at ASC`,
      [req.user.id, date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logs', async (req, res) => {
  const {
    date, meal_type, food_name, brand, barcode,
    serving_size_g, calories, protein_g, carbs_g, fat_g, fibre_g,
  } = req.body;

  if (!meal_type || !food_name) {
    return res.status(400).json({ error: 'meal_type and food_name are required' });
  }

  const logDate = date || new Date().toISOString().slice(0, 10);

  try {
    const result = await db.query(
      `INSERT INTO food_logs
         (user_id, logged_date, meal_type, food_name, brand, barcode,
          serving_size_g, calories, protein_g, carbs_g, fat_g, fibre_g)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.user.id, logDate, meal_type, food_name, brand || null,
        barcode || null, serving_size_g || null,
        calories || null, protein_g || null, carbs_g || null,
        fat_g || null, fibre_g || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/logs/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM food_logs WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Log entry not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
