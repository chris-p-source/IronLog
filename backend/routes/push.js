const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');
const restNotifications = require('../services/restNotifications');

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

// Queue a rest-complete notification for duration_seconds from now. Only the
// newest rest per user is kept, so ticking several sets off in a row notifies
// once, for the last one — see services/restNotifications.
router.post('/rest-timer', async (req, res) => {
  const { duration_seconds, exercise_name, rest_started_at } = req.body;
  if (!duration_seconds || duration_seconds < 1) return res.status(400).json({ error: 'Invalid duration' });
  if (!config.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push not configured' });

  try {
    const subs = await db.query(
      'SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (subs.rows.length === 0) return res.json({ scheduled: false, reason: 'no_subscription' });

    const scheduled = await restNotifications.scheduleRest({
      userId: req.user.id,
      durationSeconds: duration_seconds,
      exerciseName: exercise_name,
      restStartedAt: Number(rest_started_at) || Date.now(),
    });
    // Not scheduled means a newer rest is already queued: these per-set requests
    // are concurrent and can arrive out of order.
    res.json(scheduled ? { scheduled: true } : { scheduled: false, reason: 'superseded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel a queued rest-complete notification (rest skipped or workout ended)
router.delete('/rest-timer', async (req, res) => {
  try {
    res.json({ cancelled: await restNotifications.cancelRest(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
