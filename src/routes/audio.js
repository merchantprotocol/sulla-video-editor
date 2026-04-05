const express = require('express');
const { requireAuth } = require('../middleware/auth');
const AudioController = require('../controllers/audio.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/:id/studio-sound', AudioController.studioSound);
router.post('/:id/normalize', AudioController.normalize);

module.exports = router;
