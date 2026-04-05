import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplates, type TemplateConfig } from '../hooks/useTemplates'
import styles from './Templates.module.css'

const ruleTypes = [
  { id: 'podcast', name: 'Podcast', color: '#3a7f9e' },
  { id: 'youtube', name: 'YouTube', color: '#cf222e' },
  { id: 'social', name: 'Social Clips', color: '#1a7f37' },
  { id: 'tutorial', name: 'Tutorial', color: '#7c3aed' },
  { id: 'interview', name: 'Interview', color: '#9a6700' },
  { id: 'screencast', name: 'Screencast', color: '#5096b3' },
]

const sceneTypeColors: Record<string, string> = {
  TitleCard: '#7c3aed',
  FullFrame: '#3a7f9e',
  PiP: '#5096b3',
  BRoll: '#1a7f37',
  SideBySide: '#9a6700',
  CaptionFocus: '#cf222e',
}

export default function Templates() {
  const navigate = useNavigate()
  const { templates, loading, createTemplate } = useTemplates()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('podcast')

  const systemTemplates = templates.filter(t => t.is_system)
  const userTemplates = templates.filter(t => !t.is_system)

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(false)
    const t = await createTemplate(newName.trim(), newType)
    setNewName('')
    navigate(`/templates/${t.id}`)
  }

  if (loading) {
    return <div className={styles.page}><div className={styles.loading}>Loading templates...</div></div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Templates</h1>
        <p className={styles.subtitle}>Choose a template to open the visual layout editor</p>
        <div className={styles.headerActions}>
          <button className={styles.createBtn} onClick={() => setCreating(!creating)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Template
          </button>
        </div>
      </div>

      {creating && (
        <div className={styles.createForm}>
          <input
            className={styles.createInput}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Template name"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className={styles.createTypes}>
            {ruleTypes.map(r => (
              <button
                key={r.id}
                className={`${styles.createType} ${newType === r.id ? styles.createTypeActive : ''}`}
                onClick={() => setNewType(r.id)}
              >
                <span className={styles.createDot} style={{ background: r.color }} />
                {r.name}
              </button>
            ))}
          </div>
          <div className={styles.createActions}>
            <button className={styles.createSubmit} onClick={handleCreate} disabled={!newName.trim()}>Create</button>
            <button className={styles.createCancel} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {systemTemplates.length > 0 && (
        <>
          <div className={styles.sectionLabel}>System Templates</div>
          <div className={styles.tileGrid}>
            {systemTemplates.map(t => {
              const cfg = t.config as TemplateConfig
              return (
                <div key={t.id} className={styles.tile} onClick={() => navigate(`/templates/${t.id}`)}>
                  <div className={styles.tilePreview} style={{ background: cfg?.theme?.background === 'dark' ? '#0d1117' : '#f6f8fa' }}>
                    {/* Scene dots */}
                    <div className={styles.tileScenes}>
                      {cfg?.scenes?.map((s, i) => (
                        <div key={i} className={styles.tileSceneDot} style={{ background: sceneTypeColors[s.type] || '#6e7681' }} title={s.type} />
                      ))}
                    </div>
                    {/* Mini PiP preview if template has PiP scene */}
                    {cfg?.scenes?.some(s => s.type === 'PiP') && (
                      <div className={styles.tilePip} style={{ borderColor: cfg?.theme?.accentColor || '#3a7f9e' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" opacity={0.4}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                    )}
                    {/* Accent bar */}
                    <div className={styles.tileAccent} style={{ background: cfg?.theme?.accentColor || '#3a7f9e' }} />
                    {/* Caption mockup */}
                    <div className={styles.tileCaptionMock}>
                      <div className={styles.tileCaptionLine} style={{ width: '60%', background: cfg?.theme?.background === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }} />
                      <div className={styles.tileCaptionLine} style={{ width: '40%', background: cfg?.theme?.accentColor || '#3a7f9e', opacity: 0.3 }} />
                    </div>
                  </div>
                  <div className={styles.tileMeta}>
                    <div className={styles.tileName}>{t.name}</div>
                    <div className={styles.tileInfo}>
                      {cfg?.scenes?.length || 0} scenes &middot; {cfg?.export?.defaultFormat || '16:9'}
                      {t.is_system && <span className={styles.tileBadge}>system</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {userTemplates.length > 0 && (
        <>
          <div className={styles.sectionLabel}>Your Templates</div>
          <div className={styles.tileGrid}>
            {userTemplates.map(t => {
              const cfg = t.config as TemplateConfig
              return (
                <div key={t.id} className={styles.tile} onClick={() => navigate(`/templates/${t.id}`)}>
                  <div className={styles.tilePreview} style={{ background: cfg?.theme?.background === 'dark' ? '#0d1117' : '#f6f8fa' }}>
                    <div className={styles.tileScenes}>
                      {cfg?.scenes?.map((s, i) => (
                        <div key={i} className={styles.tileSceneDot} style={{ background: sceneTypeColors[s.type] || '#6e7681' }} title={s.type} />
                      ))}
                    </div>
                    {cfg?.scenes?.some(s => s.type === 'PiP') && (
                      <div className={styles.tilePip} style={{ borderColor: cfg?.theme?.accentColor || '#3a7f9e' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" opacity={0.4}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                    )}
                    <div className={styles.tileAccent} style={{ background: cfg?.theme?.accentColor || '#3a7f9e' }} />
                    <div className={styles.tileCaptionMock}>
                      <div className={styles.tileCaptionLine} style={{ width: '60%', background: cfg?.theme?.background === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }} />
                      <div className={styles.tileCaptionLine} style={{ width: '40%', background: cfg?.theme?.accentColor || '#3a7f9e', opacity: 0.3 }} />
                    </div>
                  </div>
                  <div className={styles.tileMeta}>
                    <div className={styles.tileName}>{t.name}</div>
                    <div className={styles.tileInfo}>
                      {cfg?.scenes?.length || 0} scenes &middot; {cfg?.export?.defaultFormat || '16:9'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {templates.length === 0 && !creating && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <p>No templates yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
