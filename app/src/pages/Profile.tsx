import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import styles from './Profile.module.css'

export default function Profile() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      await api.put(`/users/${user?.id}`, { name, email })
      setMsg('Profile updated')
    } catch (err: any) { setMsg(err.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  async function handlePassword() {
    if (newPw.length < 8) { setMsg('Password must be at least 8 characters'); return }
    setSaving(true); setMsg('')
    try {
      await api.put(`/users/${user?.id}/password`, { currentPassword: currentPw, newPassword: newPw })
      setCurrentPw(''); setNewPw(''); setMsg('Password changed')
    } catch (err: any) { setMsg(err.message || 'Failed to change password') }
    finally { setSaving(false) }
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Profile</h1>

        <div className={styles.section}>
          <label className={styles.label}>Full Name</label>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Email</label>
          <input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>

        <h2 className={styles.subtitle}>Change Password</h2>

        <div className={styles.section}>
          <label className={styles.label}>Current Password</label>
          <input className={styles.input} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        </div>

        <div className={styles.section}>
          <label className={styles.label}>New Password</label>
          <input className={styles.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
        </div>

        <button className={styles.saveBtn} onClick={handlePassword} disabled={saving || !currentPw || !newPw}>{saving ? 'Changing...' : 'Change Password'}</button>

        {msg && <div className={styles.msg}>{msg}</div>}
      </div>
    </div>
  )
}
