const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ComposeController = require('../controllers/compose.controller');

const router = express.Router();

router.use(requireAuth);

// Compose within an existing project
router.post('/projects/:id/compose', ComposeController.compose);

// Quick compose — creates project + renders in one call
router.post('/compose/quick', ComposeController.quickCompose);

module.exports = router;
