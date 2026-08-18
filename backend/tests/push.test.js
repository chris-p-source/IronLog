const test = require('node:test');
const assert = require('node:assert');
const { serveRoute, fakeDb, fakeWebPush, wait } = require('./helpers');

const SUBSCRIPTION = { rows: [{ subscription_json: JSON.stringify({ endpoint: 'https://push.example/abc' }) }] };
const VAPID = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

async function pushServer(responses) {
  const webpush = fakeWebPush();
  const srv = await serveRoute('routes/push.js', { db: fakeDb(responses), webpush, config: VAPID });
  return { ...srv, webpush };
}

test('rest-timer sends one notification once the rest period elapses', async () => {
  const srv = await pushServer([SUBSCRIPTION]);
  try {
    const res = await srv.request('POST', '/rest-timer', { duration_seconds: 1, exercise_name: 'Bench Press' });
    assert.deepStrictEqual(res.body, { scheduled: true });

    assert.strictEqual(srv.webpush.sent.length, 0, 'must not fire before the rest is over');
    await wait(1300);
    assert.strictEqual(srv.webpush.sent.length, 1);
    assert.match(srv.webpush.sent[0].payload, /Bench Press/);
  } finally {
    await srv.close();
  }
});

// Regression: completing a second set mid-rest used to leave the first
// notification queued, so "Rest Complete" fired partway through the new rest.
test('starting a new rest cancels the notification queued for the old one', async () => {
  const srv = await pushServer([SUBSCRIPTION, SUBSCRIPTION]);
  try {
    await srv.request('POST', '/rest-timer', { duration_seconds: 1, exercise_name: 'Bench Press' });
    await srv.request('POST', '/rest-timer', { duration_seconds: 3, exercise_name: 'Bench Press' });

    await wait(1600);
    assert.strictEqual(srv.webpush.sent.length, 0, 'superseded timer must not fire mid-rest');

    await wait(1800);
    assert.strictEqual(srv.webpush.sent.length, 1, 'the current rest still notifies exactly once');
  } finally {
    await srv.close();
  }
});

// Ticking five sets off in quick succession must notify once, for the last
// set — not five times, and not early.
test('a run of quick set completions produces exactly one notification', async () => {
  const srv = await pushServer(Array(5).fill(SUBSCRIPTION));
  try {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      const res = await srv.request('POST', '/rest-timer', {
        duration_seconds: 2,
        exercise_name: `Set ${i + 1}`,
        rest_started_at: t0 + i * 10,
      });
      assert.strictEqual(res.body.scheduled, true);
    }

    await wait(1200);
    assert.strictEqual(srv.webpush.sent.length, 0, 'none of the first four may fire');

    await wait(1400);
    assert.strictEqual(srv.webpush.sent.length, 1, 'exactly one notification');
    assert.match(srv.webpush.sent[0].payload, /Set 5/, 'and it is for the last set');
  } finally {
    await srv.close();
  }
});

test('an out-of-order request cannot displace a newer rest', async () => {
  const srv = await pushServer([SUBSCRIPTION, SUBSCRIPTION]);
  try {
    const now = Date.now();
    await srv.request('POST', '/rest-timer', {
      duration_seconds: 3, exercise_name: 'Newer', rest_started_at: now,
    });
    // A request for an earlier rest, delayed in flight, lands afterwards.
    const late = await srv.request('POST', '/rest-timer', {
      duration_seconds: 1, exercise_name: 'Older', rest_started_at: now - 500,
    });
    assert.deepStrictEqual(late.body, { scheduled: false, reason: 'superseded' });

    await wait(1500);
    assert.strictEqual(srv.webpush.sent.length, 0, 'the stale rest must not fire');

    await wait(2000);
    assert.strictEqual(srv.webpush.sent.length, 1);
    assert.match(srv.webpush.sent[0].payload, /Newer/);
  } finally {
    await srv.close();
  }
});

test('skipping rest cancels the queued notification', async () => {
  const srv = await pushServer([SUBSCRIPTION]);
  try {
    await srv.request('POST', '/rest-timer', { duration_seconds: 1, exercise_name: 'Bench Press' });

    const cancel = await srv.request('DELETE', '/rest-timer');
    assert.deepStrictEqual(cancel.body, { cancelled: true });

    await wait(1300);
    assert.strictEqual(srv.webpush.sent.length, 0);
  } finally {
    await srv.close();
  }
});

test('cancelling with nothing queued is a no-op', async () => {
  const srv = await pushServer([]);
  try {
    const res = await srv.request('DELETE', '/rest-timer');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { cancelled: false });
  } finally {
    await srv.close();
  }
});

test('rest-timer rejects a missing or zero duration', async () => {
  const srv = await pushServer([]);
  try {
    assert.strictEqual((await srv.request('POST', '/rest-timer', { duration_seconds: 0 })).status, 400);
    assert.strictEqual((await srv.request('POST', '/rest-timer', {})).status, 400);
  } finally {
    await srv.close();
  }
});

test('rest-timer requires authentication', async () => {
  const srv = await pushServer([]);
  try {
    const res = await fetch(`${srv.base}/rest-timer`, { method: 'DELETE' });
    assert.strictEqual(res.status, 401);
  } finally {
    await srv.close();
  }
});
