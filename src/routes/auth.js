const express = require('express');
const { requireAuth } = require('../middleware/auth');
const AuthController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', requireAuth, AuthController.me);

module.exports = router;
