const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { getGoldMedalsMap, lifetimeXpMap } = require('../services/points');
const { levelProgress } = require('../services/levels');
const { rarityOf } = require('../services/badges');

router.use(auth);

async function getStrengthPoints(whereClause) {
  const result = await db.query(`
    WITH s AS (
      SELECT ws.user_id, COALESCE(SUM(ss.reps_completed), 0) AS pts
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'strength'
      JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.completed_at IS NOT NULL ${whereClause}
      GROUP BY ws.user_id
    )
    SELECT u.id, u.username, u.avatar_data, u.equipped_title, ROUND(s.pts) AS total_points
    FROM s JOIN users u ON u.id = s.user_id
    WHERE s.pts > 0
    ORDER BY total_points DESC LIMIT 50
  `);
  return result.rows;
}

async function getCardioMinutes(whereClause) {
  const result = await db.query(`
    SELECT u.id, u.username, u.avatar_data, u.equipped_title,
      ROUND(SUM(se.actual_duration_minutes)) AS total_minutes
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id AND se.exercise_type = 'cardio'
    JOIN users u ON u.id = ws.user_id
    WHERE ws.completed_at IS NOT NULL AND se.actual_duration_minutes IS NOT NULL ${whereClause}
    GROUP BY u.id, u.username, u.avatar_data, u.equipped_title
    HAVING SUM(se.actual_duration_minutes) > 0
    ORDER BY total_minutes DESC LIMIT 50
  `);
  return result.rows;
}

const THIS_WEEK = `AND DATE_TRUNC('week', ws.completed_at) = DATE_TRUNC('week', NOW())`;

// Levels come from lifetime XP, which the weekly totals above do not carry. One
// batched query covers every row on the board rather than one query per row.
async function withLevels(rows) {
  const xpMap = await lifetimeXpMap(rows.map(r => r.id));
  return rows.map(r => {
    const { level, title } = levelProgress(xpMap[r.id] || 0);
    return { ...r, level, rank_title: title, title_rarity: rarityOf(r.equipped_title) };
  });
}

// Strength leaderboards
router.get('/strength/weekly', async (req, res) => {
  try {
    const [rows, goldMap] = await Promise.all([getStrengthPoints(THIS_WEEK), getGoldMedalsMap()]);
    res.json(await withLevels(rows.map(r => ({ ...r, gold_medals: goldMap[r.id] || 0 }))));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/strength/alltime', async (req, res) => {
  try {
    const [rows, goldMap] = await Promise.all([getStrengthPoints(''), getGoldMedalsMap()]);
    res.json(await withLevels(rows.map(r => ({ ...r, gold_medals: goldMap[r.id] || 0 }))));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Cardio leaderboards
router.get('/cardio/weekly', async (req, res) => {
  try {
    res.json(await withLevels(await getCardioMinutes(THIS_WEEK)));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/cardio/alltime', async (req, res) => {
  try {
    res.json(await withLevels(await getCardioMinutes('')));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
