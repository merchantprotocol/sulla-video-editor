const express = require('express');
const { requireAuth } = require('../middleware/auth');
const UserController = require('../controllers/user.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', UserController.list);
router.get('/:id', UserController.get);
router.put('/:id', UserController.update);
router.put('/:id/password', UserController.updatePassword);
router.delete('/:id', UserController.delete);

module.exports = router;
