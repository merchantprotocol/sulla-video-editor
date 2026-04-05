const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ProjectController = require('../controllers/project.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', ProjectController.list);
router.post('/', ProjectController.create);
router.get('/:id', ProjectController.get);
router.put('/:id', ProjectController.update);
router.delete('/:id', ProjectController.delete);

router.post('/:id/import', ProjectController.importMedia);
router.post('/:id/transcribe', ProjectController.transcribe);
router.get('/:id/transcript', ProjectController.getTranscript);
router.get('/:id/edl', ProjectController.getEdl);
router.put('/:id/edl', ProjectController.saveEdl);
router.get('/:id/suggestions', ProjectController.getSuggestions);
router.get('/:id/exports', ProjectController.getExports);

router.get('/:id/media/:filename', ProjectController.serveMedia);
router.get('/:id/media/thumbnails/:filename', ProjectController.serveThumbnail);

module.exports = router;
