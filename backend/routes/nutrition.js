const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const fetch = require('node-fetch');

router.use(auth);

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,product_quantity';
const OFF_TIMEOUT_MS = 6000;

function offFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Try each URL in order, return the first successful JSON response
async function offFetchWithFallback(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const response = await offFetch(url);
      if (!response.ok) { lastErr = new Error(`HTTP ${response.status}`); continue; }
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── USDA FoodData Central (final fallback) ─────────────────────────────────
const USDA_KEY = 'DEMO_KEY'; // free, no signup — upgrade at https://fdc.nal.usda.gov/api-guide.html

function getNutrient(nutrients, id) {
  const n = (nutrients || []).find(n => n.nutrientId === id);
  return n ? parseFloat(parseFloat(n.value).toFixed(1)) : 0;
}

async function searchUSDA(q) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&api_key=${USDA_KEY}&pageSize=15`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!response.ok) throw new Error(`USDA HTTP ${response.status}`);
  const data = await response.json();
  return (data.foods || [])
    .filter(f => f.description)
    .map(f => ({
      food_name: f.description.trim(),
      brand: f.brandOwner || f.brandName || null,
      barcode: f.gtinUpc || null,
      serving_size_g: f.servingSize || 100,
      calories_per100: getNutrient(f.foodNutrients, 1008),
      protein_per100:  getNutrient(f.foodNutrients, 1003),
      carbs_per100:    getNutrient(f.foodNutrients, 1005),
      fat_per100:      getNutrient(f.foodNutrients, 1004),
      fibre_per100:    getNutrient(f.foodNutrients, 1079),
      nutriments: {},
    }));
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

// ── Food search: OFF world → OFF uk → USDA ────────────────────────────────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  // Try Open Food Facts first (UK-filtered results)
  const qs = `search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}&lc=en&cc=gb`;
  try {
    const data = await offFetchWithFallback([
      `https://world.openfoodfacts.org/cgi/search.pl?${qs}`,
      `https://uk.openfoodfacts.org/cgi/search.pl?${qs}`,
    ]);
    const products = (data.products || [])
      .filter(p => p.product_name && p.product_name.trim())
      .map(mapProduct);
    if (products.length > 0) return res.json(products);
    // OFF returned no results — fall through to USDA
  } catch (err) {
    console.log('OFF search unavailable, trying USDA:', err.message);
  }

  // Fallback: USDA FoodData Central
  try {
    const products = await searchUSDA(q);
    return res.json(products);
  } catch (err) {
    console.error('USDA search also failed:', err.message);
    return res.status(502).json({ error: 'Food database unavailable — please try again shortly' });
  }
});

// ── Barcode lookup proxy — tries world then uk as fallback ─────────────────
router.get('/barcode/:code', async (req, res) => {
  const code = encodeURIComponent(req.params.code);
  const qs = `fields=${OFF_FIELDS}`;
  const urls = [
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?${qs}`,
    `https://uk.openfoodfacts.org/api/v2/product/${code}.json?${qs}`,
  ];
  try {
    const data = await offFetchWithFallback(urls);
    if (data.status !== 1 || !data.product?.product_name) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(mapProduct(data.product));
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Food database timed out' });
    console.error('OFF barcode failed:', err.message);
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
