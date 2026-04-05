import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api } from '../lib/api'

interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface Org {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

interface AuthState {
  user: User | null
  orgs: Org[]
  currentOrg: Org | null
  loading: boolean
  onboarded: boolean  // has any user ever been created?
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, orgName: string) => Promise<void>
  logout: () => void
  switchOrg: (orgId: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [currentOrg, setCurrentOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboarded, setOnboarded] = useState(false)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    try {
      // Check if the system has been set up at all
      const status = await api.get('/onboarded').catch(() => ({ onboarded: false }))
      setOnboarded(status.onboarded)

      // If onboarded, try to restore session
      if (status.onboarded) {
        const token = localStorage.getItem('sulla_token')
        if (token) {
          try {
            const data = await api.get('/auth/me')
            setUser(data.user)
            setOrgs(data.orgs || [])
            const savedOrgId = localStorage.getItem('sulla_org')
            const org = (data.orgs || []).find((o: Org) => o.id === savedOrgId) || data.orgs?.[0]
            setCurrentOrg(org || null)
          } catch {
            localStorage.removeItem('sulla_token')
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function login(email: string, password: string) {
    const data = await api.post('/auth/login', { email, password })
    localStorage.setItem('sulla_token', data.token)
    setUser(data.user)
    setOrgs(data.orgs || [])
    setCurrentOrg(data.orgs?.[0] || null)
    setOnboarded(true)
  }

  async function register(name: string, email: string, password: string, orgName: string) {
    const data = await api.post('/auth/register', { name, email, password, org_name: orgName })
    localStorage.setItem('sulla_token', data.token)
    setUser(data.user)
    setOrgs(data.orgs || [])
    setCurrentOrg(data.orgs?.[0] || null)
    setOnboarded(true)
  }

  function logout() {
    localStorage.removeItem('sulla_token')
    localStorage.removeItem('sulla_org')
    document.cookie = 'sulla_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    setUser(null)
    setOrgs([])
    setCurrentOrg(null)
  }

  function switchOrg(orgId: string) {
    const org = orgs.find(o => o.id === orgId)
    if (org) {
      setCurrentOrg(org)
      localStorage.setItem('sulla_org', orgId)
    }
  }

  return (
    <AuthContext.Provider value={{ user, orgs, currentOrg, loading, onboarded, login, register, logout, switchOrg }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
