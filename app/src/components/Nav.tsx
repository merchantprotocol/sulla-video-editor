import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Nav.module.css'

export default function Nav() {
  const { user, currentOrg, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const initial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleLogout() {
    logout()
    setOpen(false)
    navigate('/login')
  }

  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.logo}>sulla</NavLink>
      <div className={styles.spacer} />
      <NavLink to="/" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`} end>Home</NavLink>
      <NavLink to="/new" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>New Project</NavLink>
      <NavLink to="/templates" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>Templates</NavLink>
      <div className={styles.avatarWrap} ref={menuRef}>
        <button className={styles.avatar} onClick={() => setOpen(!open)}>{initial}</button>
        {open && (
          <div className={styles.menu}>
            <div className={styles.menuHeader}>
              <div className={styles.menuName}>{user?.name || 'User'}</div>
              <div className={styles.menuEmail}>{user?.email}</div>
              {currentOrg && <div className={styles.menuOrg}>{currentOrg.name}</div>}
            </div>
            <div className={styles.menuDivider} />
            <button className={styles.menuItem} onClick={() => { navigate('/profile'); setOpen(false) }}>Profile</button>
            <button className={styles.menuItem} onClick={() => { navigate('/settings'); setOpen(false) }}>Settings</button>
            <div className={styles.menuDivider} />
            <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>
    </nav>
  )
}
