const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ProjectController = require('../controllers/project.controller');
const UploadController = require('../controllers/upload.controller');

const router = express.Router();

// Media serving — no auth required (video/img tags can't send Authorization headers)
router.get('/:id/media/thumbnails/:filename', ProjectController.serveThumbnail);
router.get('/:id/media/:filename', ProjectController.serveMedia);

router.use(requireAuth);

router.get('/', ProjectController.list);
router.post('/', validate({ name: 'string' }), ProjectController.create);
router.post('/ingest', validate({ filePath: 'string' }), ProjectController.ingest);
router.get('/:id', ProjectController.get);
router.put('/:id', ProjectController.update);
router.delete('/:id', ProjectController.delete);

router.post('/:id/import', ProjectController.importMedia);
router.post('/:id/extract-audio', ProjectController.extractAudioTrack);
router.post('/:id/transcribe', ProjectController.transcribe);
router.get('/:id/transcript', ProjectController.getTranscript);
router.put('/:id/transcript', ProjectController.saveTranscript);
router.get('/:id/edl', ProjectController.getEdl);
router.put('/:id/edl', ProjectController.saveEdl);
router.get('/:id/waveform', ProjectController.getWaveform);
router.get('/:id/suggestions', ProjectController.getSuggestions);
router.post('/:id/captions', ProjectController.generateCaptions);
router.post('/:id/realign', ProjectController.realignWords);
router.post('/:id/analyze', ProjectController.analyze);
router.put('/:id/tracks', ProjectController.saveTracks);
router.get('/:id/overlays', ProjectController.getOverlays);
router.put('/:id/overlays', ProjectController.saveOverlays);
router.get('/:id/exports', ProjectController.getExports);

// Chunked upload
router.post('/:id/upload/init', UploadController.init);
router.post('/:id/upload/chunk', UploadController.chunk);
router.get('/:id/upload/status', UploadController.status);
router.post('/:id/upload/complete', UploadController.complete);

module.exports = router;
