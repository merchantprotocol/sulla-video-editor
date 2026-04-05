const express = require('express');
const { requireAuth } = require('../middleware/auth');
const TemplateController = require('../controllers/template.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', TemplateController.list);
router.get('/defaults', TemplateController.defaults);
router.post('/', TemplateController.create);
router.get('/:id', TemplateController.get);
router.put('/:id', TemplateController.update);
router.delete('/:id', TemplateController.delete);

module.exports = router;
