const OrgRepository = require('../repositories/org.repository');
const UserRepository = require('../repositories/user.repository');
const { NotFoundError, ValidationError } = require('../utils/errors');

const OrgController = {
  async get(req, res, next) {
    try {
      const org = await OrgRepository.findById(req.params.orgId);
      if (!org) throw new NotFoundError('Organization not found');
      res.json({ org });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { name, slug } = req.body;
      const org = await OrgRepository.update(req.params.orgId, { name, slug });
      if (!org) throw new NotFoundError('Organization not found');
      res.json({ org });
    } catch (err) { next(err); }
  },

  // ─── Members ──────────────────────────────────────────────

  async listMembers(req, res, next) {
    try {
      const members = await OrgRepository.getMembers(req.params.orgId);
      res.json({ members });
    } catch (err) { next(err); }
  },

  async getMember(req, res, next) {
    try {
      const member = await OrgRepository.getMember(req.params.orgId, req.params.userId);
      if (!member) throw new NotFoundError('Member not found');
      res.json({ member });
    } catch (err) { next(err); }
  },

  async addMember(req, res, next) {
    try {
      const { user_id, role } = req.body;
      if (!user_id) throw new ValidationError('user_id is required');
      const user = await UserRepository.findById(user_id);
      if (!user) throw new NotFoundError('User not found');

      const validRoles = ['owner', 'admin', 'member'];
      if (role && !validRoles.includes(role)) throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);

      await OrgRepository.addMember({ orgId: req.params.orgId, userId: user_id, role: role || 'member' });
      res.json({ added: true });
    } catch (err) { next(err); }
  },

  async updateMemberRole(req, res, next) {
    try {
      const { role } = req.body;
      const validRoles = ['owner', 'admin', 'member'];
      if (!role || !validRoles.includes(role)) throw new ValidationError(`Role must be one of: ${validRoles.join(', ')}`);

      const result = await OrgRepository.updateMemberRole(req.params.orgId, req.params.userId, role);
      if (!result) throw new NotFoundError('Member not found');
      res.json({ member: result });
    } catch (err) { next(err); }
  },

  async removeMember(req, res, next) {
    try {
      const member = await OrgRepository.getMember(req.params.orgId, req.params.userId);
      if (!member) throw new NotFoundError('Member not found');
      await OrgRepository.removeMember(req.params.orgId, req.params.userId);
      res.json({ removed: true });
    } catch (err) { next(err); }
  },

  // ─── Invites ──────────────────────────────────────────────

  async listInvites(req, res, next) {
    try {
      const invites = await OrgRepository.getInvites(req.params.orgId);
      res.json({ invites });
    } catch (err) { next(err); }
  },

  async createInvite(req, res, next) {
    try {
      const { email, role } = req.body;
      if (!email) throw new ValidationError('Email is required');
      const validRoles = ['admin', 'member'];
      if (role && !validRoles.includes(role)) throw new ValidationError(`Invite role must be one of: ${validRoles.join(', ')}`);

      const invite = await OrgRepository.createInvite({
        orgId: req.params.orgId,
        email,
        role: role || 'member',
        invitedBy: req.userId,
      });
      res.json({ invite });
    } catch (err) { next(err); }
  },

  async deleteInvite(req, res, next) {
    try {
      await OrgRepository.deleteInvite(req.params.inviteId);
      res.json({ deleted: true });
    } catch (err) { next(err); }
  },
};

module.exports = OrgController;
