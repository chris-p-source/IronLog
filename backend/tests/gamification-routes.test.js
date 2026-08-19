const test = require('node:test');
const assert = require('node:assert');
const { serveRoute, fakeDb } = require('./helpers');

function fakeService({ earned = [] } = {}) {
  const calls = [];
  return {
    calls,
    getProfile: async (userId) => { calls.push(['profile', userId]); return { level: 3, xp: 1500, badges: [] }; },
    earnedIds: async (userId) => { calls.push(['earned', userId]); return earned; },
  };
}

async function server(opts = {}, responses = []) {
  const service = fakeService(opts);
  const srv = await serveRoute('routes/gamification.js', {
    db: fakeDb(responses),
    stubs: { '../services/gamification': service },
  });
  return { ...srv, service };
}

test('me returns the caller\'s gamification profile', async () => {
  const srv = await server();
  try {
    const res = await srv.request('GET', '/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.level, 3);
    assert.deepStrictEqual(srv.service.calls[0], ['profile', 1]);
  } finally {
    await srv.close();
  }
});

test('the level table exposes the curve and the badge catalogue', async () => {
  const srv = await server();
  try {
    const { body } = await srv.request('GET', '/levels');
    assert.strictEqual(body.levels[0].level, 1);
    assert.strictEqual(body.levels[0].xp, 0);
    assert.strictEqual(body.levels[4].xp, 2600, 'level 5 threshold');
    assert.ok(body.badges.length > 0);
    assert.ok(body.badges.every(b => b.id && b.threshold > 0));
  } finally {
    await srv.close();
  }
});

test('a title the user has earned can be equipped', async () => {
  const srv = await server({ earned: ['century_workouts'] });
  try {
    const res = await srv.request('PUT', '/title', { title: 'Century Club' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { equippedTitle: 'Century Club' });
  } finally {
    await srv.close();
  }
});

// Titles are visible to other users, so this is the one place that needs a check.
test('a title the user has not earned is refused', async () => {
  const srv = await server({ earned: ['first_workout'] });
  try {
    const res = await srv.request('PUT', '/title', { title: 'Century Club' });
    assert.strictEqual(res.status, 403);
  } finally {
    await srv.close();
  }
});

test('a title that does not exist at all is refused', async () => {
  const srv = await server({ earned: ['century_workouts'] });
  try {
    const res = await srv.request('PUT', '/title', { title: 'Supreme Overlord' });
    assert.strictEqual(res.status, 403);
  } finally {
    await srv.close();
  }
});

test('a title can be cleared', async () => {
  const srv = await server();
  try {
    const res = await srv.request('PUT', '/title', { title: null });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { equippedTitle: null });
  } finally {
    await srv.close();
  }
});

test('a non-string title is rejected', async () => {
  const srv = await server();
  try {
    assert.strictEqual((await srv.request('PUT', '/title', { title: 42 })).status, 400);
  } finally {
    await srv.close();
  }
});

test('another user\'s profile shows their level and earned badges', async () => {
  const srv = await server(
    { earned: ['first_workout', 'century_workouts'] },
    [{ rows: [{ id: 7, equipped_title: 'Century Club' }] }, { rows: [{ xp: 9000 }] }]
  );
  try {
    const { status, body } = await srv.request('GET', '/user/someone');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.level, 10, '9000 XP is level 10');
    assert.strictEqual(body.equippedTitle, 'Century Club');
    assert.strictEqual(body.earnedCount, 2);
    assert.ok(body.earnedBadges.some(b => b.id === 'century_workouts'));
  } finally {
    await srv.close();
  }
});

test('an unknown user is a 404', async () => {
  const srv = await server({}, [{ rows: [] }]);
  try {
    assert.strictEqual((await srv.request('GET', '/user/nobody')).status, 404);
  } finally {
    await srv.close();
  }
});

test('gamification requires authentication', async () => {
  const srv = await server();
  try {
    const res = await fetch(`${srv.base}/me`);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(srv.service.calls.length, 0);
  } finally {
    await srv.close();
  }
});
