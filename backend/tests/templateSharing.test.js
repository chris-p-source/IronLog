// Template sharing against a real Postgres: what lands in the library, what a
// copy actually contains, and who gets the credit. Skipped when no database.
const test = require('node:test');
const assert = require('node:assert');

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://ironlog:ironlog@127.0.0.1:5432/ironlog_test';
process.env.DATABASE_URL = TEST_DB_URL;

const db = require('../db');
const sharing = require('../services/templateSharing');
const badges = require('../services/badges');
const gamification = require('../services/gamification');

async function bootstrap() {
  const name = TEST_DB_URL.slice(TEST_DB_URL.lastIndexOf('/') + 1);
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`unsafe test database name: ${name}`);
  const { Client } = require('pg');
  const admin = new Client({ connectionString: TEST_DB_URL.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rows.length === 0) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  await require('../migrate')();
}

let available = null;
async function dbReady() {
  if (available === null) available = await bootstrap().then(() => true, () => false);
  return available;
}

const COACH = `coach_${process.pid}`;
const ATHLETE = `athlete_${process.pid}`;
let coachId, athleteId;

async function freshUsers() {
  await db.query('DELETE FROM users WHERE username = ANY($1::text[])', [[COACH, ATHLETE]]);
  const ids = [];
  for (const name of [COACH, ATHLETE]) {
    const u = await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id`,
      [name]
    );
    ids.push(u.rows[0].id);
  }
  [coachId, athleteId] = ids;
}

// A template with exercises, which is what the library requires.
async function makeTemplate(userId, name, exercises = [['Barbell Bench Press', 3, 5, 80]], type = 'strength') {
  const t = await db.query(
    'INSERT INTO workout_templates (user_id, name, template_type) VALUES ($1, $2, $3) RETURNING *',
    [userId, name, type]
  );
  let i = 0;
  for (const [exName, sets, reps, weight] of exercises) {
    await db.query(
      `INSERT INTO template_exercises
         (template_id, name, exercise_type, sets, reps, rest_seconds, base_weight_kg, order_index)
       VALUES ($1, $2, $3, $4, $5, 120, $6, $7)`,
      [t.rows[0].id, exName, type, sets, reps, weight, i++]
    );
  }
  return t.rows[0];
}

test('template sharing', async (t) => {
  if (!await dbReady()) {
    t.skip('no database available');
    return;
  }
  await freshUsers();

  await t.test('an unshared template is not in the library', async () => {
    const tpl = await makeTemplate(coachId, 'Private Day');
    const library = await sharing.browse(athleteId);
    assert.equal(library.find(x => x.id === tpl.id), undefined);
  });

  await t.test('sharing puts it in the library with its author and size', async () => {
    const tpl = await makeTemplate(coachId, 'Push Day', [
      ['Barbell Bench Press', 3, 5, 80],
      ['Overhead Press', 3, 8, 40],
    ]);
    await sharing.setShared(coachId, tpl.id, { shared: true, description: 'Beginner push' });

    const entry = (await sharing.browse(athleteId)).find(x => x.id === tpl.id);
    assert.ok(entry, 'shared template should appear');
    assert.equal(entry.author, COACH);
    assert.equal(entry.description, 'Beginner push');
    assert.equal(entry.exercise_count, 2);
    assert.equal(entry.add_count, 0);
    assert.equal(entry.already_added, false);
    assert.equal(entry.is_own, false);
  });

  await t.test('an empty template cannot be shared', async () => {
    const empty = await db.query(
      `INSERT INTO workout_templates (user_id, name) VALUES ($1, 'Empty') RETURNING *`,
      [coachId]
    );
    const result = await sharing.setShared(coachId, empty.rows[0].id, { shared: true });
    assert.equal(result.error, 'empty');
  });

  await t.test('you cannot share a template that is not yours', async () => {
    const tpl = await makeTemplate(coachId, 'Not Yours');
    const result = await sharing.setShared(athleteId, tpl.id, { shared: true });
    assert.equal(result.error, 'not_found');
  });

  await t.test('adding copies every exercise, with its own id', async () => {
    const tpl = await makeTemplate(coachId, 'Copy Me', [
      ['Barbell Back Squat', 5, 5, 100],
      ['Romanian Deadlift', 3, 10, 60],
    ]);
    await sharing.setShared(coachId, tpl.id, { shared: true });

    const { template: copy } = await sharing.addToMyTemplates(athleteId, tpl.id);
    assert.notEqual(copy.id, tpl.id);
    assert.equal(copy.user_id, athleteId);
    assert.equal(copy.name, 'Copy Me');
    assert.deepEqual(
      copy.exercises.map(e => [e.name, e.sets, e.reps, parseFloat(e.base_weight_kg)]),
      [['Barbell Back Squat', 5, 5, 100], ['Romanian Deadlift', 3, 10, 60]]
    );
    // The credit line, and nothing else, ties it to the original.
    assert.equal(copy.source_template_id, tpl.id);
    assert.equal(copy.source_author_id, coachId);
  });

  // The whole point of a one-time copy: the author cannot change it afterwards.
  await t.test('editing the original never touches a copy already taken', async () => {
    const tpl = await makeTemplate(coachId, 'Stable', [['Barbell Bench Press', 3, 5, 80]]);
    await sharing.setShared(coachId, tpl.id, { shared: true });
    const { template: copy } = await sharing.addToMyTemplates(athleteId, tpl.id);

    await db.query('UPDATE workout_templates SET name = $2 WHERE id = $1', [tpl.id, 'Renamed']);
    await db.query('DELETE FROM template_exercises WHERE template_id = $1', [tpl.id]);

    const after = await db.query('SELECT * FROM workout_templates WHERE id = $1', [copy.id]);
    const exercises = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1', [copy.id]
    );
    assert.equal(after.rows[0].name, 'Stable');
    assert.equal(exercises.rows.length, 1);
  });

  await t.test('un-sharing removes it from the library but leaves copies alone', async () => {
    const tpl = await makeTemplate(coachId, 'Withdrawn');
    await sharing.setShared(coachId, tpl.id, { shared: true });
    const { template: copy } = await sharing.addToMyTemplates(athleteId, tpl.id);

    await sharing.setShared(coachId, tpl.id, { shared: false });
    const library = await sharing.browse(athleteId);
    assert.equal(library.find(x => x.id === tpl.id), undefined);

    const stillThere = await db.query('SELECT id FROM workout_templates WHERE id = $1', [copy.id]);
    assert.equal(stillThere.rows.length, 1);
  });

  await t.test('adding your own template is refused', async () => {
    const tpl = await makeTemplate(coachId, 'Mine');
    await sharing.setShared(coachId, tpl.id, { shared: true });
    const result = await sharing.addToMyTemplates(coachId, tpl.id);
    assert.equal(result.error, 'own_template');
  });

  await t.test('an unshared template cannot be added', async () => {
    const tpl = await makeTemplate(coachId, 'Not Published');
    const result = await sharing.addToMyTemplates(athleteId, tpl.id);
    assert.equal(result.error, 'not_found');
  });

  // The count is people, not taps — otherwise the badges could be farmed by one
  // person adding and deleting repeatedly.
  await t.test('taking the same template twice counts as one person', async () => {
    const tpl = await makeTemplate(coachId, 'Counted');
    await sharing.setShared(coachId, tpl.id, { shared: true });

    await sharing.addToMyTemplates(athleteId, tpl.id);
    await sharing.addToMyTemplates(athleteId, tpl.id);

    const entry = (await sharing.browse(athleteId)).find(x => x.id === tpl.id);
    assert.equal(entry.add_count, 1);
    assert.equal(entry.already_added, true);
  });

  await t.test('search matches the name, the author or an exercise inside it', async () => {
    const tpl = await makeTemplate(coachId, 'Zercher Session', [['Zercher Squat', 3, 5, 60]]);
    await sharing.setShared(coachId, tpl.id, { shared: true });

    const byName = await sharing.browse(athleteId, { search: 'zercher session' });
    const byExercise = await sharing.browse(athleteId, { search: 'Zercher Squat' });
    const byAuthor = await sharing.browse(athleteId, { search: COACH });
    const noMatch = await sharing.browse(athleteId, { search: 'nothing like this' });

    assert.ok(byName.some(x => x.id === tpl.id));
    assert.ok(byExercise.some(x => x.id === tpl.id));
    assert.ok(byAuthor.some(x => x.id === tpl.id));
    assert.equal(noMatch.length, 0);
  });

  await t.test('the type filter separates strength from cardio', async () => {
    const run = await makeTemplate(coachId, 'Easy Run', [['Treadmill Run', 0, 0, null]], 'cardio');
    await sharing.setShared(coachId, run.id, { shared: true });

    const cardio = await sharing.browse(athleteId, { type: 'cardio' });
    const strength = await sharing.browse(athleteId, { type: 'strength' });
    assert.ok(cardio.some(x => x.id === run.id));
    assert.ok(!strength.some(x => x.id === run.id));
  });

  await t.test('re-sharing a copy keeps the original author credited', async () => {
    const tpl = await makeTemplate(coachId, 'Passed On');
    await sharing.setShared(coachId, tpl.id, { shared: true });
    const { template: copy } = await sharing.addToMyTemplates(athleteId, tpl.id);
    await sharing.setShared(athleteId, copy.id, { shared: true });

    const entry = (await sharing.browse(coachId)).find(x => x.id === copy.id);
    assert.equal(entry.author, ATHLETE);
    assert.equal(entry.source_author, COACH);
  });

  await t.test("a profile lists only that author's shared templates", async () => {
    const mine = await makeTemplate(athleteId, 'Athlete Own');
    await sharing.setShared(athleteId, mine.id, { shared: true });

    const coachTemplates = await sharing.byAuthor(athleteId, coachId);
    assert.ok(coachTemplates.length > 0);
    assert.ok(coachTemplates.every(x => x.author === COACH));
    assert.ok(!coachTemplates.some(x => x.id === mine.id));
  });

  await t.test('popular sorts by how many people took it, not by date', async () => {
    // Newer but untaken, versus older with a taker.
    const older = await makeTemplate(coachId, 'Older Popular');
    await sharing.setShared(coachId, older.id, { shared: true });
    await sharing.addToMyTemplates(athleteId, older.id);
    const newer = await makeTemplate(coachId, 'Newer Unloved');
    await sharing.setShared(coachId, newer.id, { shared: true });

    const byNew = await sharing.browse(athleteId, { sort: 'new' });
    const byPopular = await sharing.browse(athleteId, { sort: 'popular' });

    assert.equal(byNew[0].id, newer.id, 'newest first by default');
    const popularIds = byPopular.map(x => x.id);
    assert.ok(
      popularIds.indexOf(older.id) < popularIds.indexOf(newer.id),
      'a template people actually took should outrank a newer one nobody has'
    );
  });

  await t.test('an unknown sort falls back to newest rather than failing', async () => {
    const rows = await sharing.browse(athleteId, { sort: "'; DROP TABLE users; --" });
    assert.ok(Array.isArray(rows));
  });

  await t.test('the feed shows templates shared by people you follow', async () => {
    await db.query('DELETE FROM followers WHERE follower_id = $1', [athleteId]);
    const tpl = await makeTemplate(coachId, 'Followed Share');
    await sharing.setShared(coachId, tpl.id, { shared: true });

    const before = await sharing.sharedByFollowed(athleteId);
    assert.ok(!before.some(x => x.id === tpl.id), 'not following yet');

    await db.query(
      'INSERT INTO followers (follower_id, following_id) VALUES ($1, $2)',
      [athleteId, coachId]
    );
    const after = await sharing.sharedByFollowed(athleteId);
    assert.ok(after.some(x => x.id === tpl.id), 'following, so it shows');
  });

  // The feed is for things you have not seen.
  await t.test('the feed drops a template once you have taken it', async () => {
    const tpl = await makeTemplate(coachId, 'Feed Then Taken');
    await sharing.setShared(coachId, tpl.id, { shared: true });
    assert.ok((await sharing.sharedByFollowed(athleteId)).some(x => x.id === tpl.id));

    await sharing.addToMyTemplates(athleteId, tpl.id);
    assert.ok(!(await sharing.sharedByFollowed(athleteId)).some(x => x.id === tpl.id));
  });

  await t.test('the coaching badge counts people who took your templates', async () => {
    const stats = await gamification.collectStats(coachId);
    const adds = await sharing.addsReceived(coachId);
    assert.equal(stats.template_adds, adds);
    assert.ok(adds > 0, 'the athlete took several of the coach templates');

    const earned = badges.evaluate(stats).filter(b => b.category === 'Coaching' && b.earned);
    assert.ok(earned.some(b => b.id === 'template_shared'), 'Programme Writer should be earned');
  });

  // Nobody earns a coaching badge for their own copies.
  await t.test('taking templates earns the taker no coaching credit', async () => {
    const stats = await gamification.collectStats(athleteId);
    assert.equal(stats.template_adds, 0);
  });
});
