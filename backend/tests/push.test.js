// Route-level behaviour of /api/push. The scheduling semantics themselves
// (one notification per run of sets, restart safety, multi-process claiming)
// are covered against a real database in rest-notifications.test.js.
const test = require('node:test');
const assert = require('node:assert');
const { serveRoute, fakeDb } = require('./helpers');

const HAS_SUB = { rows: [{ '?column?': 1 }] };
const NO_SUB = { rows: [] };
const VAPID = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

function fakeService({ scheduled = true, cancelled = true } = {}) {
  const calls = [];
  return {
    calls,
    scheduleRest: async (args) => { calls.push(['schedule', args]); return scheduled; },
    cancelRest: async (userId) => { calls.push(['cancel', userId]); return cancelled; },
  };
}

async function pushServer(responses, opts) {
  const service = fakeService(opts);
  const srv = await serveRoute('routes/push.js', {
    db: fakeDb(responses),
    config: VAPID,
    stubs: { '../services/restNotifications': service },
  });
  return { ...srv, service };
}

test('rest-timer queues a notification for the requesting user', async () => {
  const srv = await pushServer([HAS_SUB]);
  try {
    const res = await srv.request('POST', '/rest-timer', {
      duration_seconds: 120, exercise_name: 'Bench Press', rest_started_at: 1700000000000,
    });
    assert.deepStrictEqual(res.body, { scheduled: true });
    assert.deepStrictEqual(srv.service.calls[0], ['schedule', {
      userId: 1, durationSeconds: 120, exerciseName: 'Bench Press', restStartedAt: 1700000000000,
    }]);
  } finally {
    await srv.close();
  }
});

test('rest-timer reports a rest that a newer one has already superseded', async () => {
  const srv = await pushServer([HAS_SUB], { scheduled: false });
  try {
    const res = await srv.request('POST', '/rest-timer', { duration_seconds: 120, rest_started_at: 1 });
    assert.deepStrictEqual(res.body, { scheduled: false, reason: 'superseded' });
  } finally {
    await srv.close();
  }
});

test('rest-timer defaults a missing start time to now', async () => {
  const srv = await pushServer([HAS_SUB]);
  try {
    const before = Date.now();
    await srv.request('POST', '/rest-timer', { duration_seconds: 120 });
    const { restStartedAt } = srv.service.calls[0][1];
    assert.ok(restStartedAt >= before && restStartedAt <= Date.now());
  } finally {
    await srv.close();
  }
});

test('rest-timer does nothing for a user with no push subscription', async () => {
  const srv = await pushServer([NO_SUB]);
  try {
    const res = await srv.request('POST', '/rest-timer', { duration_seconds: 120 });
    assert.deepStrictEqual(res.body, { scheduled: false, reason: 'no_subscription' });
    assert.strictEqual(srv.service.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('rest-timer rejects a missing or zero duration', async () => {
  const srv = await pushServer([HAS_SUB]);
  try {
    assert.strictEqual((await srv.request('POST', '/rest-timer', { duration_seconds: 0 })).status, 400);
    assert.strictEqual((await srv.request('POST', '/rest-timer', {})).status, 400);
    assert.strictEqual(srv.service.calls.length, 0);
  } finally {
    await srv.close();
  }
});

test('rest-timer is unavailable when push is not configured', async () => {
  const service = fakeService();
  const srv = await serveRoute('routes/push.js', {
    db: fakeDb([HAS_SUB]),
    config: {},
    stubs: { '../services/restNotifications': service },
  });
  try {
    assert.strictEqual((await srv.request('POST', '/rest-timer', { duration_seconds: 120 })).status, 503);
  } finally {
    await srv.close();
  }
});

test('deleting the rest timer cancels the queued notification', async () => {
  const srv = await pushServer([]);
  try {
    assert.deepStrictEqual((await srv.request('DELETE', '/rest-timer')).body, { cancelled: true });
    assert.deepStrictEqual(srv.service.calls[0], ['cancel', 1]);
  } finally {
    await srv.close();
  }
});

test('cancelling with nothing queued is a no-op', async () => {
  const srv = await pushServer([], { cancelled: false });
  try {
    assert.deepStrictEqual((await srv.request('DELETE', '/rest-timer')).body, { cancelled: false });
  } finally {
    await srv.close();
  }
});

test('rest-timer requires authentication', async () => {
  const srv = await pushServer([]);
  try {
    const res = await fetch(`${srv.base}/rest-timer`, { method: 'DELETE' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(srv.service.calls.length, 0);
  } finally {
    await srv.close();
  }
});
