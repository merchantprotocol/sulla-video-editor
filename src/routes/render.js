const express = require('express');
const { requireAuth } = require('../middleware/auth');
const RenderController = require('../controllers/render.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/:id/render', RenderController.render);
router.post('/:id/render/stream', RenderController.renderStream);
router.post('/:id/clips', RenderController.renderClip);
router.get('/:id/exports/:filename', RenderController.serveExport);

module.exports = router;
