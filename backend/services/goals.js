const db = require('../db');
const { epley, forecast } = require('./goalForecast');

// XP for a goal you set and then went and earned. Roughly a week of training,
// which is the right weight for something that usually takes months.
//
// Only goals achieved *after* they were set pay out, and that rule is the whole
// anti-farm: setting a target you have already beaten stamps as achieved (which
// is what you want to see on the card) but earns nothing, so nobody can mine XP
// by declaring goals for lifts already in their history.
//
// Earned goals are recorded in goal_achievements and stay there. The goal row
// itself only ever holds your *current* target, so raising it after a win would
// otherwise hand back the XP you had already earned.
const XP_PER_GOAL = 500;

// Per-session best estimated 1RM for one exercise, oldest first — the series
// the forecast is fitted to.
async function sessionSeries(userId, exerciseName) {
  const result = await db.query(
    `SELECT ws.completed_at::date AS workout_date,
            MAX(ss.weight_kg * (1 + ss.reps_completed / 30.0)) AS best_e1rm
     FROM workout_sessions ws
     JOIN session_exercises se ON se.session_id = ws.id
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE ws.user_id = $1
       AND se.exercise_name = $2
       AND ws.completed_at IS NOT NULL
       AND ss.weight_kg > 0
       AND ss.reps_completed > 0
     GROUP BY ws.id, ws.completed_at
     ORDER BY ws.completed_at ASC`,
    [userId, exerciseName]
  );
  return result.rows.map(r => ({
    date: new Date(r.workout_date),
    e1rm: parseFloat(r.best_e1rm),
  }));
}

// The best single set actually performed, which is what the goal is ticked off
// against — a goal of 100 kg x 5 wants a real 100 kg x 5, not an equivalent.
async function bestAgainstTarget(userId, goal) {
  const result = await db.query(
    `SELECT MAX(ss.weight_kg) AS best_weight,
            MAX(ss.reps_completed) FILTER (WHERE ss.weight_kg >= $3) AS best_reps_at_weight,
            MIN(ws.completed_at) FILTER (
              WHERE ss.weight_kg >= $3 AND ss.reps_completed >= $4
            ) AS first_met
     FROM workout_sessions ws
     JOIN session_exercises se ON se.session_id = ws.id
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE ws.user_id = $1
       AND se.exercise_name = $2
       AND ws.completed_at IS NOT NULL
       AND ss.weight_kg > 0`,
    [userId, goal.exercise_name, goal.target_weight_kg, goal.target_reps]
  );
  const row = result.rows[0] || {};
  return {
    bestWeight: row.best_weight ? parseFloat(row.best_weight) : 0,
    bestRepsAtTargetWeight: row.best_reps_at_weight ? parseInt(row.best_reps_at_weight) : 0,
    firstMet: row.first_met || null,
  };
}

// Stamps every goal the history now says has been met, and returns the ones
// that were still open. Idempotent, so it is safe on any read or after any
// workout — which is what keeps XP and the card in step.
async function syncAchievements(userId) {
  const stamped = await db.query(
    `UPDATE exercise_goals g
     SET achieved_at = met.first_met
     FROM (
       SELECT g2.id,
              MIN(ws.completed_at) AS first_met
       FROM exercise_goals g2
       JOIN session_exercises se ON se.exercise_name = g2.exercise_name
       JOIN workout_sessions ws ON ws.id = se.session_id AND ws.user_id = g2.user_id
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE g2.user_id = $1
         AND g2.achieved_at IS NULL
         AND ws.completed_at IS NOT NULL
         AND ss.weight_kg >= g2.target_weight_kg
         AND ss.reps_completed >= g2.target_reps
       GROUP BY g2.id
     ) met
     WHERE g.id = met.id AND g.achieved_at IS NULL
     RETURNING g.id, g.exercise_name, g.target_weight_kg, g.target_reps,
               g.achieved_at, g.created_at`,
    [userId]
  );

  const hit = stamped.rows.map(g => ({
    id: g.id,
    exercise_name: g.exercise_name,
    target_weight_kg: parseFloat(g.target_weight_kg),
    target_reps: parseInt(g.target_reps),
    achieved_at: g.achieved_at,
    // Only a goal earned after it was set is worth XP.
    earned: new Date(g.achieved_at) > new Date(g.created_at),
  }));

  // Record the earned ones permanently, so the XP survives a new target.
  const earned = hit.filter(g => g.earned);
  if (earned.length > 0) {
    await db.query(
      `INSERT INTO goal_achievements (user_id, exercise_name, target_weight_kg, target_reps, achieved_at)
       SELECT $1, * FROM UNNEST($2::text[], $3::numeric[], $4::int[], $5::timestamptz[])
       ON CONFLICT (user_id, exercise_name, target_weight_kg, target_reps) DO NOTHING`,
      [
        userId,
        earned.map(g => g.exercise_name),
        earned.map(g => g.target_weight_kg),
        earned.map(g => g.target_reps),
        earned.map(g => g.achieved_at),
      ]
    );
  }

  return hit;
}

// Has this exact target already been earned? Drives the card's XP line.
async function isEarnedGoal(userId, goal) {
  const result = await db.query(
    `SELECT 1 FROM goal_achievements
     WHERE user_id = $1 AND exercise_name = $2
       AND target_weight_kg = $3 AND target_reps = $4`,
    [userId, goal.exercise_name, goal.target_weight_kg, goal.target_reps]
  );
  return result.rows.length > 0;
}

// How many goals the user has genuinely earned — the metric behind goal XP and
// the goal badges.
async function earnedGoalCount(userId) {
  const result = await db.query(
    'SELECT COUNT(*) AS earned FROM goal_achievements WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].earned) || 0;
}

// Everything the goals card needs for one goal.
async function describe(userId, goal, now = new Date()) {
  const target = {
    weight: parseFloat(goal.target_weight_kg),
    reps: parseInt(goal.target_reps),
  };
  const targetE1rm = epley(target.weight, target.reps);

  const [series, best, earnedXp] = await Promise.all([
    sessionSeries(userId, goal.exercise_name),
    bestAgainstTarget(userId, goal),
    isEarnedGoal(userId, { ...goal, target_weight_kg: target.weight, target_reps: target.reps }),
  ]);

  const achievedAt = goal.achieved_at;
  const currentE1rm = series.reduce((max, s) => Math.max(max, s.e1rm), 0);

  return {
    id: goal.id,
    exercise_name: goal.exercise_name,
    target_weight_kg: target.weight,
    target_reps: target.reps,
    created_at: goal.created_at,
    achieved_at: achievedAt,
    // Whether this one paid XP, so the card can say why it did not.
    earned_xp: !!earnedXp,
    xp_awarded: earnedXp ? XP_PER_GOAL : 0,
    current_best_weight_kg: best.bestWeight,
    best_reps_at_target_weight: best.bestRepsAtTargetWeight,
    current_e1rm: Math.round(currentE1rm * 10) / 10,
    target_e1rm: Math.round(targetE1rm * 10) / 10,
    // How close the strength is, capped so an achieved goal reads as 100.
    percent: targetE1rm > 0 ? Math.min(100, Math.round((currentE1rm / targetE1rm) * 100)) : 0,
    forecast: achievedAt ? { status: 'achieved' } : forecast({ sessions: series, targetE1rm, now }),
  };
}

// Sync first so the row reflects any goal the latest sessions just met.
async function describeById(userId, goalId, now = new Date()) {
  await syncAchievements(userId);
  const row = await db.query('SELECT * FROM exercise_goals WHERE id = $1 AND user_id = $2', [goalId, userId]);
  return row.rows[0] ? describe(userId, row.rows[0], now) : null;
}

module.exports = {
  sessionSeries, bestAgainstTarget, syncAchievements, earnedGoalCount,
  isEarnedGoal, describe, describeById, XP_PER_GOAL,
};
