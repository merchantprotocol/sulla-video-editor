import { Routes, Route, Outlet } from 'react-router-dom'
import Nav from './components/Nav'
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

export default function App() {
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
