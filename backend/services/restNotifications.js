const webpush = require('web-push');
const db = require('../db');
const config = require('../config');

// Sending lives here, so this is where web-push is configured.
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${config.VAPID_EMAIL || 'admin@ironlog.app'}`,
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY
  );
}

// A pending rest notification lives in the database rather than in process
// memory: one row per user, so a run of quickly ticked sets leaves only the
// newest, and neither a server restart nor a second server process can lose it
// or deliver it twice.

const POLL_MS = 1000;
// If no worker was up when a notification came due (server restarting, say),
// deliver it only if it is still roughly on time — a "rest complete" buzz that
// arrives ten minutes late is worse than none at all.
const MAX_LATENESS_MS = 120 * 1000;

// Returns false when a newer rest is already queued, which happens when the
// per-set requests race each other.
async function scheduleRest({ userId, durationSeconds, exerciseName, restStartedAt }) {
  const result = await db.query(
    `INSERT INTO pending_rest_notifications (user_id, rest_started_at, fire_at, exercise_name)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET rest_started_at = EXCLUDED.rest_started_at,
           fire_at = EXCLUDED.fire_at,
           exercise_name = EXCLUDED.exercise_name
       WHERE pending_rest_notifications.rest_started_at <= EXCLUDED.rest_started_at
     RETURNING user_id`,
    [userId, restStartedAt, String(durationSeconds), exerciseName || null]
  );
  return result.rows.length > 0;
}

async function cancelRest(userId) {
  const result = await db.query(
    'DELETE FROM pending_rest_notifications WHERE user_id = $1 RETURNING user_id',
    [userId]
  );
  return result.rows.length > 0;
}

// Deleting as we select is what makes this safe to run in several processes at
// once: each due row is claimed by exactly one of them.
async function claimDue() {
  const result = await db.query(
    `DELETE FROM pending_rest_notifications
     WHERE user_id IN (
       SELECT user_id FROM pending_rest_notifications
       WHERE fire_at <= NOW()
       FOR UPDATE SKIP LOCKED
     )
     RETURNING user_id, exercise_name, fire_at`
  );
  return result.rows;
}

async function deliver(row) {
  if (Date.now() - new Date(row.fire_at).getTime() > MAX_LATENESS_MS) return 0;

  const subs = await db.query(
    'SELECT subscription_json FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 3',
    [row.user_id]
  );
  const payload = JSON.stringify({
    title: 'Rest Complete',
    body: `Time to hit your next set${row.exercise_name ? ` — ${row.exercise_name}` : ''}!`,
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    tag: 'rest-timer',
  });

  let sent = 0;
  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification(JSON.parse(sub.subscription_json), payload);
      sent++;
    } catch (err) {
      // Subscription expired — clean it up
      if (err.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription_json = $2',
          [row.user_id, sub.subscription_json]);
      }
    }
  }
  return sent;
}

async function runOnce() {
  const due = await claimDue();
  for (const row of due) await deliver(row);
  return due.length;
}

function startWorker({ intervalMs = POLL_MS } = {}) {
  const timer = setInterval(() => {
    runOnce().catch(err => console.error('Rest notification worker:', err));
  }, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { scheduleRest, cancelRest, claimDue, deliver, runOnce, startWorker, MAX_LATENESS_MS };
