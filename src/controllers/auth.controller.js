const AuthService = require('../services/auth.service');

const AuthController = {
  async register(req, res, next) {
    try {
      const result = await AuthService.register(req.body);
      res.json(result);
    } catch (err) { next(err); }
  },

  async login(req, res, next) {
    try {
      const result = await AuthService.login(req.body);
      res.json(result);
    } catch (err) { next(err); }
  },

  async me(req, res, next) {
    try {
      const result = await AuthService.getMe(req.userId);
      res.json(result);
    } catch (err) { next(err); }
  },

  async onboarded(req, res) {
    const onboarded = await AuthService.isOnboarded();
    res.json({ onboarded });
  },
};

module.exports = AuthController;
