const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const RenderController = require('../controllers/render.controller');

const router = express.Router();

router.use(requireAuth);

const renderValidation = validate({
  format: 'enum:16:9,9:16,1:1,4:5?',
  resolution: 'enum:1080p,720p,4k?',
  quality: 'enum:high,medium,low?',
});

router.post('/:id/render', renderValidation, RenderController.render);
router.post('/:id/render/stream', renderValidation, RenderController.renderStream);
router.post('/:id/clips', RenderController.renderClip);
router.get('/:id/exports/:filename', RenderController.serveExport);
router.delete('/:id/exports/:filename', RenderController.deleteExport);

module.exports = router;
