const express = require('express');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const AuthController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', validate({ name: 'string', email: 'email', password: 'string', orgName: 'string' }), AuthController.register);
router.post('/login', validate({ email: 'email', password: 'string' }), AuthController.login);
router.get('/me', requireAuth, AuthController.me);

module.exports = router;
