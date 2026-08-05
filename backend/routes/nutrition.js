const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const fetch = require('node-fetch');

router.use(auth);

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,product_quantity';
const OFF_TIMEOUT_MS = 8000;

function offFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function mapProduct(p) {
  const n = p.nutriments || {};
  const get100 = (...keys) => {
    for (const k of keys) {
      const v = parseFloat(n[k]);
      if (!isNaN(v)) return v;
    }
    return 0;
  };
  return {
    food_name: (p.product_name || '').trim() || 'Unknown product',
    brand: (p.brands || '').split(',')[0].trim() || null,
    barcode: p.code || null,
    serving_size_g: parseFloat(p.serving_size) || parseFloat(p.product_quantity) || 100,
    calories_per100: parseFloat(get100('energy-kcal_100g', 'energy-kcal').toFixed(1)),
    protein_per100: parseFloat(get100('proteins_100g', 'proteins').toFixed(1)),
    carbs_per100: parseFloat(get100('carbohydrates_100g', 'carbohydrates').toFixed(1)),
    fat_per100: parseFloat(get100('fat_100g', 'fat').toFixed(1)),
    fibre_per100: parseFloat(get100('fiber_100g', 'fiber', 'fibers_100g').toFixed(1)),
    nutriments: n,
  };
}

// ── Food search proxy (Open Food Facts UK CGI — most reliable endpoint) ────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const url = `https://uk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
    const response = await offFetch(url);
    if (!response.ok) return res.status(502).json({ error: 'Food database unavailable' });
    const data = await response.json();
    const products = (data.products || [])
      .filter(p => p.product_name && p.product_name.trim())
      .map(mapProduct);
    res.json(products);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Food database timed out' });
    console.error(err);
    res.status(502).json({ error: 'Food database unavailable' });
  }
});

// ── Barcode lookup proxy ───────────────────────────────────────────────────
router.get('/barcode/:code', async (req, res) => {
  try {
    const url = `https://uk.openfoodfacts.org/api/v2/product/${encodeURIComponent(req.params.code)}.json?fields=${OFF_FIELDS}`;
    const response = await offFetch(url);
    if (!response.ok) return res.status(502).json({ error: 'Food database unavailable' });
    const data = await response.json();
    if (data.status !== 1 || !data.product?.product_name) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(mapProduct(data.product));
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Food database timed out' });
    console.error(err);
    res.status(502).json({ error: 'Food database unavailable' });
  }
});

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
