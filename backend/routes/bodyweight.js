const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, weight_kg, logged_at FROM user_bodyweights
       WHERE user_id = $1 ORDER BY logged_at ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const { weight_kg, logged_at } = req.body;
  if (!weight_kg) return res.status(400).json({ error: 'weight_kg required' });
  try {
    const result = await db.query(
      `INSERT INTO user_bodyweights (user_id, weight_kg, logged_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE))
       ON CONFLICT (user_id, logged_at) DO UPDATE SET weight_kg = $2
       RETURNING id, weight_kg, logged_at`,
      [req.user.id, weight_kg, logged_at || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM user_bodyweights WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
