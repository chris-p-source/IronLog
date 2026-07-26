const router = require('express').Router();
const webpush = require('web-push');
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');

if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${config.VAPID_EMAIL || 'admin@ironlog.app'}`,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY
  );
}

router.use(auth);

// Return the public VAPID key so the client can subscribe
router.get('/vapid-public-key', (req, res) => {
  if (!config.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: config.VAPID_PUBLIC_KEY });
});

// Store/update push subscription for this user
router.post('/subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, subscription_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET subscription_json = $3, updated_at = NOW()`,
      [req.user.id, subscription.endpoint, JSON.stringify(subscription)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Schedule a rest-complete notification after duration_seconds
router.post('/rest-timer', async (req, res) => {
  const { duration_seconds, exercise_name } = req.body;
  if (!duration_seconds || duration_seconds < 1) return res.status(400).json({ error: 'Invalid duration' });
  if (!config.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });

  try {
    const subs = await db.query(
      'SELECT subscription_json FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 3',
      [req.user.id]
    );
    if (subs.rows.length === 0) return res.json({ scheduled: false, reason: 'no_subscription' });

    const payload = JSON.stringify({
      title: 'Rest Complete',
      body: `Time to hit your next set${exercise_name ? ` — ${exercise_name}` : ''}!`,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: 'rest-timer',
    });

    setTimeout(async () => {
      for (const row of subs.rows) {
        try {
          await webpush.sendNotification(JSON.parse(row.subscription_json), payload);
        } catch (err) {
          // Subscription expired — clean it up
          if (err.statusCode === 410) {
            await db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_json = $2',
              [req.user.id, row.subscription_json]);
          }
        }
      }
    }, duration_seconds * 1000);

    res.json({ scheduled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
