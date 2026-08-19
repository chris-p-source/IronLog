const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const gamification = require('../services/gamification');
const points = require('../services/points');
const levels = require('../services/levels');
const badges = require('../services/badges');

router.use(auth);

// The signed-in user's level, badges and titles. Syncing awards on read is what
// backfills users who trained long before badges existed.
router.get('/me', async (req, res) => {
  try {
    res.json(await gamification.getProfile(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// The level curve itself, so the UI can show what is coming next.
router.get('/levels', (req, res) => {
  const table = [];
  for (let level = 1; level <= 60; level++) {
    table.push({ level, xp: levels.xpForLevel(level), title: levels.titleForLevel(level) });
  }
  res.json({ levels: table, badges: badges.BADGES });
});

// Choose which earned title to display. null clears it.
router.put('/title', async (req, res) => {
  const { title } = req.body;
  try {
    if (title !== null && typeof title !== 'string') {
      return res.status(400).json({ error: 'Title must be a string or null' });
    }
    if (title !== null) {
      const earned = await gamification.earnedIds(req.user.id);
      if (!badges.titlesFor(earned).includes(title)) {
        return res.status(403).json({ error: 'Title not unlocked' });
      }
    }
    await db.query('UPDATE users SET equipped_title = $1 WHERE id = $2', [title, req.user.id]);
    res.json({ equippedTitle: title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Another user's level and badge count, for their profile page.
router.get('/user/:username', async (req, res) => {
  try {
    const user = await db.query(
      'SELECT id, equipped_title FROM users WHERE username = $1',
      [req.params.username.toLowerCase()]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const { id, equipped_title } = user.rows[0];
    const [xp, earned] = await Promise.all([points.lifetimeXp(id), gamification.earnedIds(id)]);
    const availableTitles = badges.titlesFor(earned);

    res.json({
      ...levels.levelProgress(xp),
      earnedCount: earned.length,
      totalBadges: badges.BADGES.length,
      earnedBadges: earned
        .map(badgeId => badges.BADGES_BY_ID.get(badgeId))
        .filter(Boolean)
        .map(b => ({ id: b.id, name: b.name, description: b.description, tier: b.tier, category: b.category })),
      equippedTitle: availableTitles.includes(equipped_title) ? equipped_title : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
