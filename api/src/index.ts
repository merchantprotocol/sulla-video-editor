import { handleAuth } from './auth'
import { handleOrgs } from './orgs'

export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  JWT_SECRET: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    try {
      let response: Response | null = null

      if (path.startsWith('/api/auth/')) {
        response = await handleAuth(request, env, path)
      } else if (path.startsWith('/api/orgs/')) {
        response = await handleOrgs(request, env, path)
      }

      if (!response) {
        response = json({ error: 'Not found' }, 404)
      }

      // Add CORS headers
      const headers = new Headers(response.headers)
      for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v)
      return new Response(response.body, { status: response.status, headers })
    } catch (err: any) {
      return json({ error: err.message || 'Internal error' }, 500)
    }
  },
}

export function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}
