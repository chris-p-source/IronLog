require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const migrate = require('./migrate');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/users', require('./routes/users'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/bodyweight', require('./routes/bodyweight'));
app.use('/api/push', require('./routes/push'));
app.use('/api/nutrition', require('./routes/nutrition'));
app.use('/api/gamification', require('./routes/gamification'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', registerEnabled: config.REGISTER_ENABLED }));

if (config.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
  });
}

migrate().then(() => {
  // Safe to run in every process — due notifications are claimed, not shared.
  require('./services/restNotifications').startWorker();
  app.listen(config.PORT, () => {
    console.log(`IronLog server running on port ${config.PORT}`);
    console.log(`Registration: ${config.REGISTER_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  });
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
