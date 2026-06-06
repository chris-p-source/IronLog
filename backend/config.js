require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: process.env.JWT_SECRET || 'ironlog-secret-change-in-production',
  JWT_EXPIRES_IN: '30d',
  // Set REGISTER_ENABLED=false in env to disable new registrations
  REGISTER_ENABLED: process.env.REGISTER_ENABLED !== 'false',
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV || 'development',
};
