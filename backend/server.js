require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // allow base64 avatar uploads

app.use('/api/auth', require('./routes/auth'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/users', require('./routes/users'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', registerEnabled: config.REGISTER_ENABLED }));

if (config.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
  });
}

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

  // Non-destructive column additions for existing installs
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS exercise_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE template_exercises ADD COLUMN IF NOT EXISTS planned_duration_minutes INTEGER;
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS exercise_type VARCHAR(20) DEFAULT 'strength';
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS planned_duration_minutes INTEGER;
    ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS actual_duration_minutes DECIMAL(6,2);
  `);

  console.log('Database migrated successfully');
}

migrate().then(() => {
  app.listen(config.PORT, () => {
    console.log(`IronLog server running on port ${config.PORT}`);
    console.log(`Registration: ${config.REGISTER_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  });
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
