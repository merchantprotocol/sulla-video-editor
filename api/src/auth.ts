import { type Env, json } from './index'
import { hashPassword, verifyPassword, createToken, verifyToken } from './crypto'

export async function handleAuth(request: Request, env: Env, path: string): Promise<Response | null> {
  if (request.method !== 'POST' && path !== '/api/auth/me') return null

  if (path === '/api/auth/register') return register(request, env)
  if (path === '/api/auth/login') return login(request, env)
  if (path === '/api/auth/forgot-password') return forgotPassword(request, env)
  if (path === '/api/auth/me') return me(request, env)

  return null
}

async function register(request: Request, env: Env): Promise<Response> {
  const { name, email, password, org_name } = await request.json() as any

  if (!name || !email || !password || !org_name) {
    return json({ error: 'Name, email, password, and organization name are required' }, 400)
  }

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }

  // Check existing user
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) {
    return json({ error: 'An account with this email already exists' }, 409)
  }

  const userId = crypto.randomUUID()
  const orgId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  const slug = org_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Create user, org, and membership in a batch
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').bind(userId, name, email, passwordHash),
    env.DB.prepare('INSERT INTO orgs (id, name, slug) VALUES (?, ?, ?)').bind(orgId, org_name, slug),
    env.DB.prepare('INSERT INTO org_members (id, org_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, orgId, userId, 'owner'),
  ])

  const token = await createToken({ sub: userId, email }, env.JWT_SECRET)

  return json({
    token,
    user: { id: userId, name, email },
    orgs: [{ id: orgId, name: org_name, role: 'owner' }],
  })
}

async function login(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as any

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, 400)
  }

  const user = await env.DB.prepare('SELECT id, name, email, password_hash, avatar_url FROM users WHERE email = ?').bind(email).first() as any
  if (!user) {
    return json({ error: 'Invalid email or password' }, 401)
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return json({ error: 'Invalid email or password' }, 401)
  }

  // Get orgs
  const { results: memberships } = await env.DB.prepare(
    'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?'
  ).bind(user.id).all()

  const token = await createToken({ sub: user.id, email }, env.JWT_SECRET)

  return json({
    token,
    user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url },
    orgs: memberships,
  })
}

async function me(request: Request, env: Env): Promise<Response> {
  const payload = await authenticateRequest(request, env)
  if (!payload) return json({ error: 'Unauthorized' }, 401)

  const user = await env.DB.prepare('SELECT id, name, email, avatar_url FROM users WHERE id = ?').bind(payload.sub).first() as any
  if (!user) return json({ error: 'User not found' }, 404)

  const { results: memberships } = await env.DB.prepare(
    'SELECT o.id, o.name, m.role FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ?'
  ).bind(user.id).all()

  return json({ user, orgs: memberships })
}

async function forgotPassword(_request: Request, _env: Env): Promise<Response> {
  // In production: generate reset token, send email
  return json({ message: 'If an account exists, a reset link has been sent' })
}

export async function authenticateRequest(request: Request, env: Env): Promise<Record<string, any> | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  return verifyToken(token, env.JWT_SECRET)
}
