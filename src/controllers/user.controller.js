const UserRepository = require('../repositories/user.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { hashPassword } = require('../lib/auth');

const UserController = {
  async list(req, res, next) {
    try {
      const users = await UserRepository.findAll();
      res.json({ users });
    } catch (err) { next(err); }
  },

  async get(req, res, next) {
    try {
      const user = await UserRepository.findById(req.params.id);
      if (!user) throw new NotFoundError('User not found');
      const orgs = await UserRepository.getOrgsForUser(user.id);
      res.json({ user, orgs });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { name, email, avatar_url } = req.body;
      const user = await UserRepository.update(req.params.id, { name, email, avatarUrl: avatar_url });
      if (!user) throw new NotFoundError('User not found');
      res.json({ user });
    } catch (err) { next(err); }
  },

  async updatePassword(req, res, next) {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) throw new ValidationError('Password must be at least 6 characters');
      const hash = await hashPassword(password);
      await UserRepository.updatePassword(req.params.id, hash);
      res.json({ updated: true });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const user = await UserRepository.findById(req.params.id);
      if (!user) throw new NotFoundError('User not found');
      await UserRepository.delete(req.params.id);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  },
};

module.exports = UserController;
