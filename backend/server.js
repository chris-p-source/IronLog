require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/progress', require('./routes/progress'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', registerEnabled: config.REGISTER_ENABLED }));

// Serve built frontend in production
if (config.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
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
      sets INTEGER NOT NULL DEFAULT 3,
      reps INTEGER NOT NULL DEFAULT 10,
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
      sets_planned INTEGER NOT NULL,
      reps_planned INTEGER NOT NULL,
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
