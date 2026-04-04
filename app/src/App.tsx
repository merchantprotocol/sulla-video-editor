import { Routes, Route, Outlet, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Nav from './components/Nav'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Welcome from './pages/Welcome'
import NewProject from './pages/NewProject'
import Editor from './pages/Editor'
import Templates from './pages/Templates'

function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function AuthRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

function Layout() {
  return (
    <>
      <Nav />
      <Outlet />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public auth routes */}
        <Route element={<AuthRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/editor/:id" element={<Editor />} />
          <Route element={<Layout />}>
            <Route index element={<Welcome />} />
            <Route path="new" element={<NewProject />} />
            <Route path="templates" element={<Templates />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
