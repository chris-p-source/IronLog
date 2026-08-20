// Every badge is a metric plus a threshold, which means progress ("62 / 100
// workouts") falls out of the same definition that decides whether it is
// earned — there is no second place to keep the two in step.
//
// XP rewards volume, so badges are where quality gets recognised: the barbell
// clubs and the relative-strength tier cannot be farmed with light high-rep
// sets.
//
// The ladder is pitched to stay interesting for roughly two years of training —
// at four sessions a week that is around 500 workouts, a million kilos moved
// and a four plate squat, all of which sit near the top tiers here.
//
// A badge with a `title` grants a flair title the user may choose to display.

// A plate is a 20 kg disc a side on a 20 kg bar, so "two plates" is 100 kg.
const BAR_KG = 20;
const PLATE_KG = 20;
const plates = (n) => BAR_KG + n * 2 * PLATE_KG;

// Totals are quoted in pounds because that is what the clubs are called.
const LB_TO_KG = 0.45359237;
const lb = (pounds) => Math.round(pounds * LB_TO_KG * 10) / 10;

const BADGES = [
  // --- Consistency ---
  { id: 'first_workout', name: 'First Rep', description: 'Complete your first workout', category: 'Consistency', tier: 'bronze', metric: 'workouts_total', threshold: 1, title: 'Day One' },
  { id: 'ten_workouts', name: 'Getting Serious', description: 'Complete 10 workouts', category: 'Consistency', tier: 'bronze', metric: 'workouts_total', threshold: 10, title: 'Getting Serious' },
  { id: 'fifty_workouts', name: 'Regular Fixture', description: 'Complete 50 workouts', category: 'Consistency', tier: 'bronze', metric: 'workouts_total', threshold: 50, title: 'Regular Fixture' },
  { id: 'century_workouts', name: 'Century Club', description: 'Complete 100 workouts', category: 'Consistency', tier: 'silver', metric: 'workouts_total', threshold: 100, title: 'Century Club' },
  { id: 'workouts_250', name: 'Double Century', description: 'Complete 250 workouts', category: 'Consistency', tier: 'gold', metric: 'workouts_total', threshold: 250, title: 'Double Century' },
  { id: 'workouts_500', name: 'Five Hundred', description: 'Complete 500 workouts', category: 'Consistency', tier: 'gold', metric: 'workouts_total', threshold: 500, title: 'Five Hundred Club' },
  // Weeks rather than consecutive days: illness and deloads should not wipe out
  // months of consistency.
  { id: 'habit_formed', name: 'Habit Formed', description: 'Train twice or more in 4 different weeks', category: 'Consistency', tier: 'bronze', metric: 'weeks_with_two_plus', threshold: 4, title: 'Habit Formed' },
  { id: 'habit_26', name: 'Half Year Habit', description: 'Train twice or more in 26 different weeks', category: 'Consistency', tier: 'silver', metric: 'weeks_with_two_plus', threshold: 26 },
  { id: 'year_of_iron', name: 'Year of Iron', description: 'Train in 52 different weeks', category: 'Consistency', tier: 'gold', metric: 'weeks_trained', threshold: 52, title: 'Year of Iron' },
  { id: 'two_years', name: 'Two Years Deep', description: 'Train in 104 different weeks', category: 'Consistency', tier: 'gold', metric: 'weeks_trained', threshold: 104, title: 'Two Years Deep' },

  // --- Barbell clubs: the milestones lifters actually talk about ---
  { id: 'bench_1_plate', name: 'One Plate Bench', description: `Bench press ${plates(1)} kg — a plate a side`, category: 'Clubs', tier: 'bronze', metric: 'bench_kg', threshold: plates(1), unit: 'kg', title: 'One Plate Bench' },
  { id: 'bench_2_plate', name: 'Two Plate Club', description: `Bench press ${plates(2)} kg — two plates a side`, category: 'Clubs', tier: 'silver', metric: 'bench_kg', threshold: plates(2), unit: 'kg', title: 'Two Plate Club' },
  { id: 'bench_3_plate', name: 'Three Plate Bench', description: `Bench press ${plates(3)} kg`, category: 'Clubs', tier: 'gold', metric: 'bench_kg', threshold: plates(3), unit: 'kg', title: 'Three Plate Bench' },

  { id: 'squat_2_plate', name: 'Two Plate Squat', description: `Squat ${plates(2)} kg`, category: 'Clubs', tier: 'bronze', metric: 'squat_kg', threshold: plates(2), unit: 'kg' },
  { id: 'squat_3_plate', name: 'Three Plate Squat', description: `Squat ${plates(3)} kg`, category: 'Clubs', tier: 'silver', metric: 'squat_kg', threshold: plates(3), unit: 'kg', title: 'Three Plate Squat' },
  { id: 'squat_4_plate', name: 'Four Plate Squat', description: `Squat ${plates(4)} kg`, category: 'Clubs', tier: 'gold', metric: 'squat_kg', threshold: plates(4), unit: 'kg', title: 'Four Plate Squat' },

  { id: 'deadlift_3_plate', name: 'Three Plate Deadlift', description: `Deadlift ${plates(3)} kg`, category: 'Clubs', tier: 'bronze', metric: 'deadlift_kg', threshold: plates(3), unit: 'kg' },
  { id: 'deadlift_4_plate', name: 'Four Plate Deadlift', description: `Deadlift ${plates(4)} kg`, category: 'Clubs', tier: 'silver', metric: 'deadlift_kg', threshold: plates(4), unit: 'kg', title: 'Four Plate Deadlift' },
  { id: 'deadlift_5_plate', name: 'Five Plate Deadlift', description: `Deadlift ${plates(5)} kg`, category: 'Clubs', tier: 'gold', metric: 'deadlift_kg', threshold: plates(5), unit: 'kg', title: 'Five Plate Puller' },

  { id: 'total_1000', name: '1000 Pound Club', description: `Squat, bench and deadlift totalling ${lb(1000)} kg (1000 lb)`, category: 'Clubs', tier: 'silver', metric: 'powerlifting_total_kg', threshold: lb(1000), unit: 'kg', title: '1000lb Club' },
  { id: 'total_1200', name: '1200 Pound Club', description: `A total of ${lb(1200)} kg (1200 lb)`, category: 'Clubs', tier: 'gold', metric: 'powerlifting_total_kg', threshold: lb(1200), unit: 'kg', title: '1200lb Club' },
  { id: 'total_1500', name: '1500 Pound Club', description: `A total of ${lb(1500)} kg (1500 lb)`, category: 'Clubs', tier: 'gold', metric: 'powerlifting_total_kg', threshold: lb(1500), unit: 'kg', title: 'Elite Total' },

  // --- Relative strength (weight lifted against logged bodyweight) ---
  { id: 'bw_bench', name: 'Bodyweight Bench', description: 'Bench press your own bodyweight', category: 'Strength', tier: 'bronze', metric: 'bench_ratio', threshold: 1, unit: 'x' },
  { id: 'bw_bench_125', name: 'Bench and a Quarter', description: 'Bench press 1.25x your bodyweight', category: 'Strength', tier: 'silver', metric: 'bench_ratio', threshold: 1.25, unit: 'x' },
  { id: 'bw_bench_150', name: 'One and a Half Bench', description: 'Bench press 1.5x your bodyweight', category: 'Strength', tier: 'gold', metric: 'bench_ratio', threshold: 1.5, unit: 'x', title: 'Bench Beast' },
  { id: 'bw_squat_150', name: 'Squat and a Half', description: 'Squat 1.5x your bodyweight', category: 'Strength', tier: 'bronze', metric: 'squat_ratio', threshold: 1.5, unit: 'x' },
  { id: 'double_bw_squat', name: 'Double Bodyweight Squat', description: 'Squat twice your bodyweight', category: 'Strength', tier: 'silver', metric: 'squat_ratio', threshold: 2, unit: 'x', title: 'Squat Monster' },
  { id: 'bw_squat_250', name: 'Two and a Half Squat', description: 'Squat 2.5x your bodyweight', category: 'Strength', tier: 'gold', metric: 'squat_ratio', threshold: 2.5, unit: 'x', title: 'Squat Specialist' },
  { id: 'bw_deadlift_200', name: 'Double Bodyweight Pull', description: 'Deadlift twice your bodyweight', category: 'Strength', tier: 'bronze', metric: 'deadlift_ratio', threshold: 2, unit: 'x' },
  { id: 'deadlift_two_half', name: 'Two and a Half', description: 'Deadlift 2.5x your bodyweight', category: 'Strength', tier: 'silver', metric: 'deadlift_ratio', threshold: 2.5, unit: 'x', title: 'Deadlift King' },
  { id: 'bw_deadlift_300', name: 'Triple Bodyweight', description: 'Deadlift 3x your bodyweight', category: 'Strength', tier: 'gold', metric: 'deadlift_ratio', threshold: 3, unit: 'x', title: 'Triple Pull' },

  // --- Personal bests ---
  { id: 'prs_10', name: 'Climbing', description: 'Set 10 personal bests', category: 'Strength', tier: 'bronze', metric: 'pr_count', threshold: 10, title: 'Climbing' },
  { id: 'prs_50', name: 'PR Machine', description: 'Set 50 personal bests', category: 'Strength', tier: 'silver', metric: 'pr_count', threshold: 50, title: 'PR Machine' },
  { id: 'prs_150', name: 'Always Climbing', description: 'Set 150 personal bests', category: 'Strength', tier: 'gold', metric: 'pr_count', threshold: 150, title: 'Always Climbing' },

  // --- Tonnage ---
  { id: 'tonnage_100', name: '100 Tonnes', description: 'Lift 100,000 kg in total', category: 'Volume', tier: 'bronze', metric: 'tonnage_kg', threshold: 100000, unit: 'kg', title: '100 Tonnes' },
  { id: 'tonnage_250', name: '250 Tonnes', description: 'Lift 250,000 kg in total', category: 'Volume', tier: 'bronze', metric: 'tonnage_kg', threshold: 250000, unit: 'kg' },
  { id: 'tonnage_500', name: '500 Tonnes', description: 'Lift 500,000 kg in total', category: 'Volume', tier: 'silver', metric: 'tonnage_kg', threshold: 500000, unit: 'kg' },
  { id: 'tonnage_1000', name: 'Kilotonne', description: 'Lift 1,000,000 kg in total', category: 'Volume', tier: 'gold', metric: 'tonnage_kg', threshold: 1000000, unit: 'kg', title: 'Kilotonne' },
  { id: 'tonnage_2000', name: 'Mountain Mover', description: 'Lift 2,000,000 kg in total', category: 'Volume', tier: 'gold', metric: 'tonnage_kg', threshold: 2000000, unit: 'kg', title: 'Mountain Mover' },

  // --- Cardio ---
  { id: 'cardio_100km', name: 'The Long Road', description: 'Cover 100 km of cardio', category: 'Cardio', tier: 'bronze', metric: 'cardio_distance_km', threshold: 100, unit: 'km' },
  { id: 'cardio_500km', name: 'Long Hauler', description: 'Cover 500 km of cardio', category: 'Cardio', tier: 'silver', metric: 'cardio_distance_km', threshold: 500, unit: 'km' },
  { id: 'cardio_1000km', name: 'Thousand Kilometres', description: 'Cover 1,000 km of cardio', category: 'Cardio', tier: 'gold', metric: 'cardio_distance_km', threshold: 1000, unit: 'km', title: 'Endurance' },
  { id: 'cardio_10k', name: '10K', description: 'Cover 10 km in a single session', category: 'Cardio', tier: 'bronze', metric: 'cardio_best_session_km', threshold: 10, unit: 'km', title: '10K' },
  { id: 'cardio_half', name: 'Half Marathon', description: 'Cover 21.1 km in a single session', category: 'Cardio', tier: 'silver', metric: 'cardio_best_session_km', threshold: 21.1, unit: 'km', title: 'Half Marathon' },
  { id: 'cardio_marathon', name: 'Marathon', description: 'Cover 42.2 km in a single session', category: 'Cardio', tier: 'gold', metric: 'cardio_best_session_km', threshold: 42.2, unit: 'km', title: 'Marathon' },
  { id: 'cardio_hour', name: 'Hour of Power', description: 'A single 60 minute cardio session', category: 'Cardio', tier: 'bronze', metric: 'cardio_best_session_minutes', threshold: 60, unit: 'min' },
  { id: 'cardio_two_hour', name: 'Two Hour Engine', description: 'A single 120 minute cardio session', category: 'Cardio', tier: 'silver', metric: 'cardio_best_session_minutes', threshold: 120, unit: 'min' },

  // --- Variety ---
  { id: 'explorer', name: 'Explorer', description: 'Log 25 different exercises', category: 'Variety', tier: 'bronze', metric: 'distinct_exercises', threshold: 25, title: 'Explorer' },
  { id: 'explorer_50', name: 'Well Travelled', description: 'Log 50 different exercises', category: 'Variety', tier: 'silver', metric: 'distinct_exercises', threshold: 50 },
  { id: 'explorer_75', name: 'Tried Everything', description: 'Log 75 different exercises', category: 'Variety', tier: 'gold', metric: 'distinct_exercises', threshold: 75, title: 'Tried Everything' },
  { id: 'full_coverage', name: 'Full Coverage', description: 'Hit every major muscle group inside one week', category: 'Variety', tier: 'bronze', metric: 'full_coverage_weeks', threshold: 1, title: 'Well Rounded' },
  { id: 'full_coverage_26', name: 'Nothing Skipped', description: 'Cover every muscle group in 26 different weeks', category: 'Variety', tier: 'gold', metric: 'full_coverage_weeks', threshold: 26, title: 'Nothing Skipped' },

  // --- Social ---
  { id: 'weekly_champion', name: 'Weekly Champion', description: 'Top the weekly leaderboard', category: 'Social', tier: 'silver', metric: 'gold_medals', threshold: 1, title: 'Champion' },
  { id: 'champion_5', name: 'Serial Winner', description: 'Top the weekly leaderboard 5 times', category: 'Social', tier: 'gold', metric: 'gold_medals', threshold: 5, title: 'Serial Winner' },
  { id: 'champion_25', name: 'Dynasty', description: 'Top the weekly leaderboard 25 times', category: 'Social', tier: 'gold', metric: 'gold_medals', threshold: 25, title: 'Dynasty' },
  { id: 'local_legend', name: 'Local Legend', description: 'Reach 10 followers', category: 'Social', tier: 'bronze', metric: 'followers', threshold: 10, title: 'Local Legend' },
  { id: 'followers_50', name: 'Big Following', description: 'Reach 50 followers', category: 'Social', tier: 'silver', metric: 'followers', threshold: 50 },

  // --- Tracking (the habits that earn XP outside the gym) ---
  { id: 'macro_tracker', name: 'Macro Tracker', description: 'Log your food on 30 different days', category: 'Tracking', tier: 'bronze', metric: 'nutrition_days', threshold: 30, title: 'Macro Tracker' },
  { id: 'nutrition_100', name: 'Diet Dialled In', description: 'Log your food on 100 different days', category: 'Tracking', tier: 'silver', metric: 'nutrition_days', threshold: 100, title: 'Meal Prepped' },
  { id: 'nutrition_365', name: 'Year of Tracking', description: 'Log your food on 365 different days', category: 'Tracking', tier: 'gold', metric: 'nutrition_days', threshold: 365, title: 'Year of Tracking' },
  { id: 'weigh_ins_30', name: 'On the Scales', description: 'Log your bodyweight on 30 different days', category: 'Tracking', tier: 'bronze', metric: 'weigh_in_days', threshold: 30 },
  { id: 'weigh_ins_100', name: 'Watching the Trend', description: 'Log your bodyweight on 100 different days', category: 'Tracking', tier: 'silver', metric: 'weigh_in_days', threshold: 100 },
  { id: 'weigh_ins_365', name: 'Every Single Day', description: 'Log your bodyweight on 365 different days', category: 'Tracking', tier: 'gold', metric: 'weigh_in_days', threshold: 365, title: 'Every Single Day' },

  // --- Dedication ---
  { id: 'early_bird', name: 'Early Bird', description: 'Finish a workout before 6am', category: 'Dedication', tier: 'bronze', metric: 'early_workouts', threshold: 1, title: 'Early Bird' },
  { id: 'dawn_patrol', name: 'Dawn Patrol', description: 'Finish 25 workouts before 6am', category: 'Dedication', tier: 'gold', metric: 'early_workouts', threshold: 25, title: 'Dawn Patrol' },
  { id: 'night_owl', name: 'Night Owl', description: 'Finish a workout after 10pm', category: 'Dedication', tier: 'bronze', metric: 'late_workouts', threshold: 1, title: 'Night Owl' },
  { id: 'night_shift', name: 'Night Shift', description: 'Finish 25 workouts after 10pm', category: 'Dedication', tier: 'gold', metric: 'late_workouts', threshold: 25, title: 'Night Shift' },
];

const BADGES_BY_ID = new Map(BADGES.map(b => [b.id, b]));

// How rare a flair title is, which is what decides how loudly it is drawn on a
// profile. Rarity follows the tier of the badge that granted it, except for the
// handful marked below: the top rung of the hardest ladders, where someone has
// done something most lifters never will.
const LEGENDARY_TITLES = new Set([
  'Mountain Mover',     // 2,000 tonnes lifted
  'Elite Total',        // a 1500 lb total
  'Dynasty',            // 25 weekly wins
  'Triple Pull',        // 3x bodyweight deadlift
  'Five Plate Puller',  // a 220 kg deadlift
  'Marathon',           // 42.2 km in one session
  'Two Years Deep',     // 104 weeks trained
  'Five Hundred Club',  // 500 workouts
]);

const TIER_RARITY = { bronze: 'common', silver: 'rare', gold: 'epic' };

const TITLE_RARITY = new Map(
  BADGES.filter(b => b.title).map(b => [
    b.title,
    LEGENDARY_TITLES.has(b.title) ? 'legendary' : (TIER_RARITY[b.tier] || 'common'),
  ])
);

function rarityOf(title) {
  return TITLE_RARITY.get(title) || null;
}

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

// The same titles with their rarity, rarest first, for the picker.
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];
function titlesWithRarity(earnedIds = []) {
  return titlesFor(earnedIds)
    .map(title => ({ title, rarity: rarityOf(title) }))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

module.exports = {
  BADGES, BADGES_BY_ID, COVERAGE_GROUPS, evaluate, qualifyingIds, titlesFor, isEarned,
  plates, lb, BAR_KG, PLATE_KG, rarityOf, titlesWithRarity, TITLE_RARITY, RARITY_ORDER,
};
