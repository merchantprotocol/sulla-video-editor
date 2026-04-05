import { Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Nav from './components/Nav'
import Onboarding from './components/Onboarding'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import NewProject from './pages/NewProject'
import Editor from './pages/Editor'
import Templates from './pages/Templates'

function Layout() {
  return (
    <>
      <Nav />
      <Outlet />
    </>
  )
}

function AppShell() {
  const { user, loading, onboarded } = useAuth()

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        Loading...
      </div>
    )
  }

  // No users exist yet → show onboarding (registration) over blurred app
  if (!onboarded) {
    return (
      <>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<Welcome />} />
          </Route>
        </Routes>
        <Onboarding />
      </>
    )
  }

  // Users exist but not logged in → show login
  if (!user) {
    return <Login />
  }

  // Logged in → full app
  return (
    <Routes>
      <Route path="/editor/:id" element={<Editor />} />
      <Route element={<Layout />}>
        <Route index element={<Welcome />} />
        <Route path="new" element={<NewProject />} />
        <Route path="templates" element={<Templates />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
