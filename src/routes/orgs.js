const express = require('express');
const { requireAuth } = require('../middleware/auth');
const OrgController = require('../controllers/org.controller');

const router = express.Router();

router.use(requireAuth);

// Org
router.get('/:orgId', OrgController.get);
router.put('/:orgId', OrgController.update);

// Members
router.get('/:orgId/members', OrgController.listMembers);
router.post('/:orgId/members', OrgController.addMember);
router.get('/:orgId/members/:userId', OrgController.getMember);
router.put('/:orgId/members/:userId', OrgController.updateMemberRole);
router.delete('/:orgId/members/:userId', OrgController.removeMember);

// Invites
router.get('/:orgId/invites', OrgController.listInvites);
router.post('/:orgId/invites', OrgController.createInvite);
router.delete('/:orgId/invites/:inviteId', OrgController.deleteInvite);

module.exports = router;
