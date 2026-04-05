import { Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Nav from './components/Nav'
import Onboarding from './components/Onboarding'
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
  const { user, loading } = useAuth()

  return (
    <>
      {/* The app is always visible — onboarding overlays on top */}
      <Routes>
        <Route path="/editor/:id" element={<Editor />} />
        <Route element={<Layout />}>
          <Route index element={<Welcome />} />
          <Route path="new" element={<NewProject />} />
          <Route path="templates" element={<Templates />} />
        </Route>
      </Routes>

      {/* Onboarding overlay — shown until user completes setup */}
      {!loading && !user && <Onboarding />}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
