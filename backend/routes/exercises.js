const router = require('express').Router();
const auth = require('../middleware/auth');
const { STRENGTH_EXERCISES, CARDIO_EXERCISES } = require('../data/exercises');

router.use(auth);

router.get('/strength', (req, res) => {
  res.json(STRENGTH_EXERCISES);
});

router.get('/cardio', (req, res) => {
  res.json(CARDIO_EXERCISES);
});

module.exports = router;
