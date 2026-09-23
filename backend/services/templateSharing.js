const db = require('../db');

// A template taken from the library is a copy, not a subscription: it belongs
// to whoever took it from that moment on, and later edits by the author never
// reach it. Only the credit line is kept.

const MAX_DESCRIPTION = 500;

// Copies a template's exercises. Shared by "duplicate my own" and "add someone
// else's", so the two can never drift apart on which columns get carried over.
async function copyExercises(client, fromTemplateId, toTemplateId) {
  await client.query(
    `INSERT INTO template_exercises
       (template_id, name, exercise_type, sets, reps, planned_duration_minutes, rest_seconds, base_weight_kg, order_index)
     SELECT $2, name, exercise_type, sets, reps, planned_duration_minutes, rest_seconds, base_weight_kg, order_index
     FROM template_exercises WHERE template_id = $1
     ORDER BY order_index`,
    [fromTemplateId, toTemplateId]
  );
}

// The columns every shared-library view needs: who wrote it, how big it is and
// how many people have taken it.
const LIBRARY_SELECT = `
  SELECT t.id, t.name, t.template_type, t.description, t.shared_at,
         u.username AS author, u.id AS author_id, u.avatar_data AS author_avatar,
         u.equipped_title AS author_title,
         src.username AS source_author,
         (SELECT COUNT(*) FROM template_exercises te WHERE te.template_id = t.id) AS exercise_count,
         (SELECT COUNT(*) FROM template_adds ta WHERE ta.template_id = t.id) AS add_count
  FROM workout_templates t
  JOIN users u ON u.id = t.user_id
  LEFT JOIN users src ON src.id = t.source_author_id
  WHERE t.is_shared = true
`;

function shape(row, viewerId) {
  return {
    id: row.id,
    name: row.name,
    template_type: row.template_type,
    description: row.description,
    shared_at: row.shared_at,
    author: row.author,
    author_avatar: row.author_avatar,
    author_title: row.author_title,
    // Re-sharing a template you took from someone keeps their name on it, so
    // credit is not lost by passing it along.
    source_author: row.source_author,
    is_own: parseInt(row.author_id) === parseInt(viewerId),
    exercise_count: parseInt(row.exercise_count) || 0,
    add_count: parseInt(row.add_count) || 0,
    already_added: row.already_added === undefined ? undefined : !!row.already_added,
  };
}

// The library, newest first. `search` matches the template name, the author or
// any exercise in it, so "someone who programs squats" is findable.
async function browse(viewerId, { search, type } = {}) {
  // viewerId is only used to shape the response, never in the SQL.
  const params = [];
  const filters = [];

  if (type === 'strength' || type === 'cardio') {
    params.push(type);
    filters.push(`AND t.template_type = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    filters.push(`AND (LOWER(t.name) LIKE ${p} OR LOWER(u.username) LIKE ${p}
      OR EXISTS (SELECT 1 FROM template_exercises te
                 WHERE te.template_id = t.id AND LOWER(te.name) LIKE ${p}))`);
  }

  const result = await db.query(
    `${LIBRARY_SELECT} ${filters.join(' ')}
     AND EXISTS (SELECT 1 FROM template_exercises te WHERE te.template_id = t.id)
     ORDER BY t.shared_at DESC NULLS LAST, t.id DESC
     LIMIT 100`,
    params
  );
  const added = await addedSet(viewerId, result.rows.map(r => r.id));
  return result.rows.map(r => shape({ ...r, already_added: added.has(r.id) }, viewerId));
}

// Which of these templates the viewer already took, so the UI can say so
// instead of offering a second copy.
async function addedSet(viewerId, templateIds) {
  if (templateIds.length === 0) return new Set();
  const result = await db.query(
    'SELECT template_id FROM template_adds WHERE user_id = $1 AND template_id = ANY($2::int[])',
    [viewerId, templateIds]
  );
  return new Set(result.rows.map(r => r.template_id));
}

// One shared template with its exercises, for the preview before adding.
async function detail(viewerId, templateId) {
  const result = await db.query(`${LIBRARY_SELECT} AND t.id = $1`, [templateId]);
  if (result.rows.length === 0) return null;
  const exercises = await db.query(
    'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
    [templateId]
  );
  const added = await addedSet(viewerId, [templateId]);
  return {
    ...shape({ ...result.rows[0], already_added: added.has(parseInt(templateId)) }, viewerId),
    exercises: exercises.rows,
  };
}

// Everything one author has published. Used on their profile.
async function byAuthor(viewerId, authorId) {
  const result = await db.query(
    `${LIBRARY_SELECT} AND t.user_id = $1
     AND EXISTS (SELECT 1 FROM template_exercises te WHERE te.template_id = t.id)
     ORDER BY t.shared_at DESC NULLS LAST, t.id DESC`,
    [authorId]
  );
  const added = await addedSet(viewerId, result.rows.map(r => r.id));
  return result.rows.map(r => shape({ ...r, already_added: added.has(r.id) }, viewerId));
}

// Publishing is a deliberate act and reversible: un-sharing takes it out of the
// library but leaves every copy already taken alone.
async function setShared(userId, templateId, { shared, description }) {
  const owned = await db.query(
    'SELECT id FROM workout_templates WHERE id = $1 AND user_id = $2',
    [templateId, userId]
  );
  if (owned.rows.length === 0) return { error: 'not_found' };

  if (shared) {
    const hasExercises = await db.query(
      'SELECT 1 FROM template_exercises WHERE template_id = $1 LIMIT 1',
      [templateId]
    );
    if (hasExercises.rows.length === 0) return { error: 'empty' };
  }

  const text = typeof description === 'string' ? description.trim().slice(0, MAX_DESCRIPTION) : null;
  const result = await db.query(
    `UPDATE workout_templates
     SET is_shared = $3,
         shared_at = CASE WHEN $3 THEN COALESCE(shared_at, NOW()) ELSE NULL END,
         description = COALESCE($4, description)
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [templateId, userId, !!shared, text]
  );
  return { template: result.rows[0] };
}

// Takes a copy of someone's shared template. Adding your own is pointless but
// harmless, so it is simply refused rather than silently duplicating.
async function addToMyTemplates(userId, templateId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const src = await client.query(
      `SELECT t.*, u.username AS author
       FROM workout_templates t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1 AND t.is_shared = true`,
      [templateId]
    );
    if (src.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'not_found' };
    }
    const source = src.rows[0];
    if (parseInt(source.user_id) === parseInt(userId)) {
      await client.query('ROLLBACK');
      return { error: 'own_template' };
    }

    const copy = await client.query(
      `INSERT INTO workout_templates
         (user_id, name, template_type, description, source_template_id, source_author_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, source.name, source.template_type, source.description, source.id, source.user_id]
    );
    await copyExercises(client, source.id, copy.rows[0].id);

    // One row per person, so re-adding after deleting your copy does not
    // inflate the author's count.
    await client.query(
      `INSERT INTO template_adds (template_id, user_id) VALUES ($1, $2)
       ON CONFLICT (template_id, user_id) DO NOTHING`,
      [source.id, userId]
    );
    await client.query('COMMIT');

    const exercises = await db.query(
      'SELECT * FROM template_exercises WHERE template_id = $1 ORDER BY order_index',
      [copy.rows[0].id]
    );
    return { template: { ...copy.rows[0], author: source.author, exercises: exercises.rows } };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// How many people have taken this author's templates — the metric behind the
// sharing badges.
async function addsReceived(userId) {
  const result = await db.query(
    `SELECT COUNT(*) AS total FROM template_adds ta
     JOIN workout_templates t ON t.id = ta.template_id
     WHERE t.user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].total) || 0;
}

module.exports = {
  copyExercises, browse, detail, byAuthor, setShared, addToMyTemplates,
  addsReceived, MAX_DESCRIPTION,
};
