// Every badge is a metric plus a threshold, which means progress ("62 / 100
// workouts") falls out of the same definition that decides whether it is
// earned — there is no second place to keep the two in step.
//
// XP rewards volume, so badges are where quality gets recognised: the
// relative-strength tier below cannot be farmed with light high-rep sets.
//
// A badge with a `title` grants a flair title the user may choose to display.

const BADGES = [
  // --- Consistency ---
  { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', category: 'Consistency', tier: 'bronze', metric: 'workouts_total', threshold: 1 },
  { id: 'ten_workouts', name: 'Getting Serious', description: 'Complete 10 workouts', category: 'Consistency', tier: 'bronze', metric: 'workouts_total', threshold: 10 },
  { id: 'century_workouts', name: 'Century Club', description: 'Complete 100 workouts', category: 'Consistency', tier: 'gold', metric: 'workouts_total', threshold: 100, title: 'Century Club' },
  // Weeks rather than consecutive days: illness and deloads should not wipe out
  // months of consistency.
  { id: 'habit_formed', name: 'Habit Formed', description: 'Train twice or more in 4 different weeks', category: 'Consistency', tier: 'bronze', metric: 'weeks_with_two_plus', threshold: 4 },
  { id: 'year_of_iron', name: 'Year of Iron', description: 'Train in 52 different weeks', category: 'Consistency', tier: 'gold', metric: 'weeks_trained', threshold: 52, title: 'Year of Iron' },

  // --- Tonnage ---
  { id: 'tonnage_100', name: '100 Tonnes', description: 'Lift 100,000 kg in total', category: 'Volume', tier: 'bronze', metric: 'tonnage_kg', threshold: 100000, unit: 'kg' },
  { id: 'tonnage_500', name: '500 Tonnes', description: 'Lift 500,000 kg in total', category: 'Volume', tier: 'silver', metric: 'tonnage_kg', threshold: 500000, unit: 'kg' },
  { id: 'tonnage_1000', name: 'Kilotonne', description: 'Lift 1,000,000 kg in total', category: 'Volume', tier: 'gold', metric: 'tonnage_kg', threshold: 1000000, unit: 'kg', title: 'Kilotonne' },

  // --- Relative strength (weight lifted against logged bodyweight) ---
  { id: 'bw_bench', name: 'Bodyweight Bench', description: 'Bench press your own bodyweight', category: 'Strength', tier: 'silver', metric: 'bench_ratio', threshold: 1, unit: 'x' },
  { id: 'double_bw_squat', name: 'Double Bodyweight Squat', description: 'Squat twice your bodyweight', category: 'Strength', tier: 'gold', metric: 'squat_ratio', threshold: 2, unit: 'x', title: 'Squat Monster' },
  { id: 'deadlift_two_half', name: 'Two and a Half', description: 'Deadlift 2.5x your bodyweight', category: 'Strength', tier: 'gold', metric: 'deadlift_ratio', threshold: 2.5, unit: 'x', title: 'Deadlift King' },

  // --- Personal bests ---
  { id: 'prs_10', name: 'Climbing', description: 'Set 10 personal bests', category: 'Strength', tier: 'bronze', metric: 'pr_count', threshold: 10 },
  { id: 'prs_50', name: 'PR Machine', description: 'Set 50 personal bests', category: 'Strength', tier: 'silver', metric: 'pr_count', threshold: 50, title: 'PR Machine' },

  // --- Cardio ---
  { id: 'cardio_100km', name: 'The Long Road', description: 'Cover 100 km of cardio', category: 'Cardio', tier: 'silver', metric: 'cardio_distance_km', threshold: 100, unit: 'km' },
  { id: 'cardio_10k', name: '10K', description: 'Cover 10 km in a single session', category: 'Cardio', tier: 'silver', metric: 'cardio_best_session_km', threshold: 10, unit: 'km' },
  { id: 'cardio_hour', name: 'Hour of Power', description: 'A single 60 minute cardio session', category: 'Cardio', tier: 'bronze', metric: 'cardio_best_session_minutes', threshold: 60, unit: 'min' },

  // --- Variety ---
  { id: 'explorer', name: 'Explorer', description: 'Log 25 different exercises', category: 'Variety', tier: 'bronze', metric: 'distinct_exercises', threshold: 25 },
  { id: 'full_coverage', name: 'Full Coverage', description: 'Hit every major muscle group inside one week', category: 'Variety', tier: 'silver', metric: 'full_coverage_weeks', threshold: 1, title: 'Well Rounded' },

  // --- Social ---
  { id: 'weekly_champion', name: 'Weekly Champion', description: 'Top the weekly leaderboard', category: 'Social', tier: 'gold', metric: 'gold_medals', threshold: 1, title: 'Champion' },
  { id: 'local_legend', name: 'Local Legend', description: 'Reach 10 followers', category: 'Social', tier: 'silver', metric: 'followers', threshold: 10 },

  // --- Tracking (the habits that earn XP outside the gym) ---
  { id: 'macro_tracker', name: 'Macro Tracker', description: 'Log your food on 30 different days', category: 'Tracking', tier: 'silver', metric: 'nutrition_days', threshold: 30 },
  { id: 'nutrition_100', name: 'Diet Dialled In', description: 'Log your food on 100 different days', category: 'Tracking', tier: 'gold', metric: 'nutrition_days', threshold: 100, title: 'Meal Prepped' },
  { id: 'weigh_ins_30', name: 'On the Scales', description: 'Log your bodyweight on 30 different days', category: 'Tracking', tier: 'bronze', metric: 'weigh_in_days', threshold: 30 },

  // --- Timing ---
  { id: 'early_bird', name: 'Early Bird', description: 'Finish a workout before 6am', category: 'Dedication', tier: 'bronze', metric: 'early_workouts', threshold: 1, title: 'Early Bird' },
  { id: 'night_owl', name: 'Night Owl', description: 'Finish a workout after 10pm', category: 'Dedication', tier: 'bronze', metric: 'late_workouts', threshold: 1, title: 'Night Owl' },
];

const BADGES_BY_ID = new Map(BADGES.map(b => [b.id, b]));

// The muscle groups "Full Coverage" asks for. Arms and legs each count once, so
// the badge rewards a balanced week rather than a specific split.
const COVERAGE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'];

// Which stat a badge reads, with everything missing treated as zero.
function statValue(stats, metric) {
  const value = Number(stats?.[metric]);
  return Number.isFinite(value) ? value : 0;
}

function isEarned(badge, stats) {
  return statValue(stats, badge.metric) >= badge.threshold;
}

// The full catalogue, each with earned state and progress towards it.
function evaluate(stats, earnedIds = []) {
  const already = new Set(earnedIds);
  return BADGES.map(badge => {
    const value = statValue(stats, badge.metric);
    // Once earned, a badge stays earned even if the stat later drops — a
    // bodyweight gain should not take away a lift you actually made.
    const earned = already.has(badge.id) || isEarned(badge, stats);
    return {
      ...badge,
      earned,
      value,
      percent: Math.min(100, Math.round((value / badge.threshold) * 100)),
    };
  });
}

// Badge ids the stats say the user qualifies for right now.
function qualifyingIds(stats) {
  return BADGES.filter(badge => isEarned(badge, stats)).map(badge => badge.id);
}

// Flair titles unlocked by the badges a user holds.
function titlesFor(earnedIds = []) {
  return earnedIds
    .map(id => BADGES_BY_ID.get(id))
    .filter(badge => badge?.title)
    .map(badge => badge.title);
}

module.exports = { BADGES, BADGES_BY_ID, COVERAGE_GROUPS, evaluate, qualifyingIds, titlesFor, isEarned };
