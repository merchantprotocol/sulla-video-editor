const API_BASE = '/api'

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('sulla_token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  return res.json()
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, data: any) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path: string, data: any) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
}
