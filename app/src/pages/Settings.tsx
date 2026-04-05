import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import styles from './Profile.module.css'

interface Member { id: string; name: string; email: string; role: string; created_at: string }

export default function Settings() {
  const { currentOrg } = useAuth()
  const [orgName, setOrgName] = useState(currentOrg?.name || '')
  const [members, setMembers] = useState<Member[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (currentOrg) {
      api.get(`/orgs/${currentOrg.id}/members`).then(d => setMembers(d.members || [])).catch(() => {})
    }
  }, [currentOrg])

  async function handleSaveOrg() {
    if (!currentOrg) return
    setSaving(true); setMsg('')
    try {
      await api.put(`/orgs/${currentOrg.id}`, { name: orgName })
      setMsg('Organization updated')
    } catch (err: any) { setMsg(err.message) }
    finally { setSaving(false) }
  }

  async function handleInvite() {
    if (!currentOrg || !inviteEmail) return
    setSaving(true); setMsg('')
    try {
      await api.post(`/orgs/${currentOrg.id}/invites`, { email: inviteEmail, role: 'member' })
      setInviteEmail(''); setMsg(`Invite sent to ${inviteEmail}`)
    } catch (err: any) { setMsg(err.message) }
    finally { setSaving(false) }
  }

  async function handleRemoveMember(userId: string) {
    if (!currentOrg || !confirm('Remove this member?')) return
    try {
      await api.delete(`/orgs/${currentOrg.id}/members/${userId}`)
      setMembers(members.filter(m => m.id !== userId))
      setMsg('Member removed')
    } catch (err: any) { setMsg(err.message) }
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>Settings</h1>

        <div className={styles.section}>
          <label className={styles.label}>Organization Name</label>
          <input className={styles.input} value={orgName} onChange={e => setOrgName(e.target.value)} />
        </div>
        <button className={styles.saveBtn} onClick={handleSaveOrg} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>

        <h2 className={styles.subtitle}>Team Members</h2>
        {members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email} · {m.role}</div>
            </div>
            {m.role !== 'owner' && (
              <button style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border-visible)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => handleRemoveMember(m.id)}>Remove</button>
            )}
          </div>
        ))}

        <h2 className={styles.subtitle}>Invite Member</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className={styles.input} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" style={{ flex: 1 }} />
          <button className={styles.saveBtn} onClick={handleInvite} disabled={saving || !inviteEmail}>Invite</button>
        </div>

        {msg && <div className={styles.msg}>{msg}</div>}
      </div>
    </div>
  )
}
