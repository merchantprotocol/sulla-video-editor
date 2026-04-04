import { type Env, json } from './index'
import { authenticateRequest } from './auth'

export async function handleOrgs(request: Request, env: Env, path: string): Promise<Response | null> {
  const payload = await authenticateRequest(request, env)
  if (!payload) return json({ error: 'Unauthorized' }, 401)

  const userId = payload.sub

  // GET /api/orgs/ — list user's orgs
  if (path === '/api/orgs/' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT o.id, o.name, o.slug, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?'
    ).bind(userId).all()
    return json({ orgs: results })
  }

  // GET /api/orgs/:id/members — list org members
  const membersMatch = path.match(/^\/api\/orgs\/([^/]+)\/members\/?$/)
  if (membersMatch && request.method === 'GET') {
    const orgId = membersMatch[1]
    await requireOrgAccess(env, userId, orgId)
    const { results } = await env.DB.prepare(
      'SELECT u.id, u.name, u.email, u.avatar_url, m.role, m.created_at FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ?'
    ).bind(orgId).all()
    return json({ members: results })
  }

  // POST /api/orgs/:id/invite — invite a member
  if (membersMatch && request.method === 'POST') {
    // Reuse the match for invite path
  }
  const inviteMatch = path.match(/^\/api\/orgs\/([^/]+)\/invite\/?$/)
  if (inviteMatch && request.method === 'POST') {
    const orgId = inviteMatch[1]
    await requireOrgRole(env, userId, orgId, ['owner', 'admin'])
    const { email, role } = await request.json() as any

    if (!email) return json({ error: 'Email is required' }, 400)
    const inviteRole = role === 'admin' ? 'admin' : 'member'

    // Check if already a member
    const existing = await env.DB.prepare(
      'SELECT id FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.email = ?'
    ).bind(orgId, email).first()
    if (existing) return json({ error: 'User is already a member' }, 409)

    // Check if already invited
    const existingInvite = await env.DB.prepare(
      'SELECT id FROM org_invites WHERE org_id = ? AND email = ? AND accepted_at IS NULL'
    ).bind(orgId, email).first()
    if (existingInvite) return json({ error: 'Already invited' }, 409)

    const inviteId = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO org_invites (id, org_id, email, role, invited_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(inviteId, orgId, email, inviteRole, userId).run()

    // In production: send invite email
    return json({ invite: { id: inviteId, email, role: inviteRole } })
  }

  // DELETE /api/orgs/:id/members/:userId — remove member
  const removeMemberMatch = path.match(/^\/api\/orgs\/([^/]+)\/members\/([^/]+)\/?$/)
  if (removeMemberMatch && request.method === 'DELETE') {
    const [, orgId, targetUserId] = removeMemberMatch
    await requireOrgRole(env, userId, orgId, ['owner', 'admin'])

    if (targetUserId === userId) return json({ error: 'Cannot remove yourself' }, 400)

    await env.DB.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, targetUserId).run()
    return json({ removed: true })
  }

  return null
}

async function requireOrgAccess(env: Env, userId: string, orgId: string) {
  const member = await env.DB.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?').bind(orgId, userId).first()
  if (!member) throw new Error('Not a member of this organization')
  return member
}

async function requireOrgRole(env: Env, userId: string, orgId: string, roles: string[]) {
  const member = await requireOrgAccess(env, userId, orgId) as any
  if (!roles.includes(member.role)) throw new Error('Insufficient permissions')
  return member
}
