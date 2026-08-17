const test = require('node:test');
const assert = require('node:assert');
const { serveRoute, fakeDb } = require('./helpers');

const OWNED = { rows: [{ id: 1 }] };
const NOT_OWNED = { rows: [] };

async function workoutServer(responses) {
  const db = fakeDb(responses);
  const srv = await serveRoute('routes/workouts.js', { db });
  return { ...srv, db };
}

test('unlog-set deletes the set from the session', async () => {
  const srv = await workoutServer([OWNED]);
  try {
    const res = await srv.request('POST', '/1/unlog-set', { session_exercise_id: 10, set_number: 2 });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { success: true });

    const del = srv.db.calls.find(c => c.text.startsWith('DELETE FROM session_sets'));
    assert.ok(del, 'expected the set to be deleted');
    assert.deepStrictEqual(del.params, [10, 2]);
  } finally {
    await srv.close();
  }
});

test('unlog-set refuses a session that is not the caller\'s', async () => {
  const srv = await workoutServer([NOT_OWNED]);
  try {
    const res = await srv.request('POST', '/1/unlog-set', { session_exercise_id: 10, set_number: 2 });
    assert.strictEqual(res.status, 404);

    const del = srv.db.calls.find(c => c.text.startsWith('DELETE FROM session_sets'));
    assert.strictEqual(del, undefined, 'ownership check must run before any delete');
  } finally {
    await srv.close();
  }
});

test('unlog-set requires authentication', async () => {
  const srv = await workoutServer([OWNED]);
  try {
    const res = await fetch(`${srv.base}/1/unlog-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_exercise_id: 10, set_number: 2 }),
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(srv.db.calls.length, 0);
  } finally {
    await srv.close();
  }
});
