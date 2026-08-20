const db = require('./db');

// Schema is created on boot and by the test harness, so it lives on its own.
async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_data TEXT,
      is_public BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workout_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      template_type VARCHAR(20) DEFAULT 'strength',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES workout_templates(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      exercise_type VARCHAR(20) DEFAULT 'strength',
      sets INTEGER NOT NULL DEFAULT 3,
      reps INTEGER NOT NULL DEFAULT 10,
      planned_duration_minutes INTEGER,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
      template_name VARCHAR(100),
      template_type VARCHAR(20) DEFAULT 'strength',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      duration_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_name VARCHAR(100) NOT NULL,
      exercise_type VARCHAR(20) DEFAULT 'strength',
      sets_planned INTEGER NOT NULL DEFAULT 0,
      reps_planned INTEGER NOT NULL DEFAULT 0,
      planned_duration_minutes INTEGER,
      actual_duration_minutes DECIMAL(6,2),
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_sets (
      id SERIAL PRIMARY KEY,
      session_exercise_id INTEGER REFERENCES session_exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      reps_completed INTEGER,
      weight_kg DECIMAL(6,2),
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(session_exercise_id, set_number)
    );
  `);

  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
    ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS template_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS exercise_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS planned_duration_minutes INTEGER;
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS exercise_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS planned_duration_minutes INTEGER;
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS actual_duration_minutes DECIMAL(6,2);
    ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS template_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS cardio_metrics JSONB;
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS rest_seconds INTEGER DEFAULT 120;
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS rest_seconds INTEGER DEFAULT 120;
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS base_weight_kg DECIMAL(6,2);
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS base_weight_kg DECIMAL(6,2);
    ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS notes TEXT;

    CREATE TABLE IF NOT EXISTS followers (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      subscription_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    );

    -- At most one queued rest-complete notification per user, so a run of
    -- quickly completed sets notifies once and a restart doesn't lose it.
    CREATE TABLE IF NOT EXISTS pending_rest_notifications (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rest_started_at BIGINT NOT NULL,
      fire_at TIMESTAMPTZ NOT NULL,
      exercise_name VARCHAR(100)
    );

    -- Badges a user has earned. Stamped once and kept: a bodyweight gain must
    -- not take away a lift they actually made.
    CREATE TABLE IF NOT EXISTS user_awards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      badge_id VARCHAR(50) NOT NULL,
      earned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, badge_id)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_title VARCHAR(50);

    CREATE TABLE IF NOT EXISTS user_bodyweights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      weight_kg DECIMAL(5,2) NOT NULL,
      logged_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, logged_at)
    );

    CREATE TABLE IF NOT EXISTS saved_foods (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      food_name VARCHAR(255) NOT NULL,
      brand VARCHAR(255),
      barcode VARCHAR(50),
      serving_size_g NUMERIC(8,1) DEFAULT 100,
      calories_per100 NUMERIC(8,1),
      protein_per100 NUMERIC(8,1),
      carbs_per100 NUMERIC(8,1),
      fat_per100 NUMERIC(8,1),
      fibre_per100 NUMERIC(8,1),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS nutrition_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      calories INTEGER,
      protein_g INTEGER,
      carbs_g INTEGER,
      fat_g INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    );

    -- One row per supplement per day: taking creatine twice does not mean two
    -- entries, it means the dose was wrong, so logging again updates it.
    CREATE TABLE IF NOT EXISTS supplement_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      logged_date DATE NOT NULL,
      name VARCHAR(60) NOT NULL,
      dose NUMERIC(8,2),
      unit VARCHAR(12),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, logged_date, name)
    );

    CREATE TABLE IF NOT EXISTS food_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      logged_date DATE NOT NULL,
      meal_type VARCHAR(20) NOT NULL,
      food_name VARCHAR(255) NOT NULL,
      brand VARCHAR(255),
      barcode VARCHAR(50),
      serving_size_g NUMERIC(8,1),
      calories NUMERIC(8,1),
      protein_g NUMERIC(8,1),
      carbs_g NUMERIC(8,1),
      fat_g NUMERIC(8,1),
      fibre_g NUMERIC(8,1),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Database migrated successfully');
}

module.exports = migrate;
