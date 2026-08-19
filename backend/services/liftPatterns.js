// Which logged exercises count as the three competition lifts.
//
// Loose matching gets this badly wrong: "%squat%" catches a Hack Squat and a
// Bulgarian Split Squat, "%bench press%" catches a Dumbbell Bench Press whose
// weight is per hand, and "%deadlift%" catches a Romanian Deadlift. Any of
// those would hand out a plate club that was never earned.
//
// Patterns rather than an exact name list, so a user who types "Back Squat"
// instead of picking "Barbell Back Squat" from the catalogue still counts.

const NOT = (column, words) => words.map(w => `${column} NOT ILIKE '%${w}%'`).join(' AND ');

const BENCH = (column) =>
  `(${column} ILIKE '%bench press%' AND ${NOT(column, ['dumbbell', 'incline', 'decline', 'machine', 'close-grip', 'smith'])})`;

const SQUAT = (column) =>
  `(${column} ILIKE '%squat%' AND ${NOT(column, ['hack', 'split', 'goblet', 'front', 'pistol', 'machine', 'smith', 'bulgarian', 'jump'])})`;

const DEADLIFT = (column) =>
  `(${column} ILIKE '%deadlift%' AND ${NOT(column, ['romanian', 'stiff', 'trap bar', 'single', 'dumbbell'])})`;

module.exports = { BENCH, SQUAT, DEADLIFT };
