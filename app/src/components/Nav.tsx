import { NavLink } from 'react-router-dom'
import styles from './Nav.module.css'

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.logo}>sulla</NavLink>
      <div className={styles.spacer} />
      <NavLink to="/" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`} end>Home</NavLink>
      <NavLink to="/new" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>New Project</NavLink>
      <NavLink to="/templates" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>Templates</NavLink>
      <button className={styles.avatar}>J</button>
    </nav>
  )
}
