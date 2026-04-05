import { useRef, useEffect } from 'react'
import styles from './UserProfileDropdown.module.css'

interface Props {
  open: boolean
  onToggle: () => void
  userName: string
  userEmail: string
  isDarkMode: boolean
  onDarkModeToggle: () => void
  onAction: (action: string) => void
}

export default function UserProfileDropdown({ open, onToggle, userName, userEmail, isDarkMode, onDarkModeToggle, onAction }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onToggle])

  return (
    <div className={styles.userMenu} ref={ref}>
      <button className={styles.avatarBtn} onClick={onToggle}>
        {(userName || 'U')[0].toUpperCase()}
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <div className={styles.name}>{userName}</div>
            <div className={styles.email}>{userEmail}</div>
          </div>
          <div className={styles.darkRow} onClick={onDarkModeToggle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            Dark Mode
            <div className={styles.spacer} />
            <div className={`${styles.toggle} ${isDarkMode ? styles.toggleOn : ''}`} />
          </div>
          <div className={styles.divider} />
          <button className={styles.item} onClick={() => onAction('settings')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </button>
          <button className={styles.item} onClick={() => onAction('shortcuts')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>
            Keyboard Shortcuts
            <span className={styles.hint}>?</span>
          </button>
          <div className={styles.divider} />
          <button className={styles.item} onClick={() => onAction('signout')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
