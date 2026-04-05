import { useState } from 'react'
import { useTemplates, type Template, type TemplateConfig } from '../hooks/useTemplates'
import styles from './Templates.module.css'

const ruleTypes = [
  { id: 'podcast', name: 'Podcast', color: '#3a7f9e' },
  { id: 'youtube', name: 'YouTube', color: '#cf222e' },
  { id: 'social', name: 'Social Clips', color: '#1a7f37' },
  { id: 'tutorial', name: 'Tutorial', color: '#7c3aed' },
  { id: 'interview', name: 'Interview', color: '#9a6700' },
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
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } = useTemplates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedScene, setSelectedScene] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('podcast')

  const selected = templates.find(t => t.id === selectedId) || templates[0] || null
  const config = selected?.config as TemplateConfig | undefined

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(false)
    const t = await createTemplate(newName.trim(), newType)
    setSelectedId(t.id)
    setNewName('')
  }

  async function handleUpdateScene(sceneIdx: number, updates: Record<string, any>) {
    if (!selected || !config) return
    const newScenes = [...config.scenes]
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], ...updates }
    await updateTemplate(selected.id, { config: { ...config, scenes: newScenes } })
  }

  async function handleUpdateTheme(updates: Record<string, any>) {
    if (!selected || !config) return
    await updateTemplate(selected.id, { config: { ...config, theme: { ...config.theme, ...updates } } })
  }

  async function handleAddScene(type: string) {
    if (!selected || !config) return
    const newScene = { type, duration: type === 'TitleCard' ? 4 : undefined }
    await updateTemplate(selected.id, { config: { ...config, scenes: [...config.scenes, newScene] } })
  }

  async function handleRemoveScene(idx: number) {
    if (!selected || !config || config.scenes.length <= 1) return
    const newScenes = config.scenes.filter((_, i) => i !== idx)
    await updateTemplate(selected.id, { config: { ...config, scenes: newScenes } })
    if (selectedScene >= newScenes.length) setSelectedScene(newScenes.length - 1)
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sbSection}>
          <div className={styles.sbHeader}>
            <h3>Templates</h3>
            <div className={styles.spacer} />
            <button className={styles.sbAdd} onClick={() => setCreating(!creating)}>+</button>
          </div>

          {creating && (
            <div className={styles.createForm}>
              <input className={styles.createInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name" autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              <div className={styles.createTypes}>
                {ruleTypes.map(r => (
                  <button key={r.id} className={`${styles.createType} ${newType === r.id ? styles.createTypeActive : ''}`} onClick={() => setNewType(r.id)}>
                    <span className={styles.createDot} style={{ background: r.color }} />
                    {r.name}
                  </button>
                ))}
              </div>
              <button className={styles.createBtn} onClick={handleCreate} disabled={!newName.trim()}>Create</button>
            </div>
          )}

          <div className={styles.sbList}>
            {loading ? (
              <div className={styles.sbEmpty}>Loading...</div>
            ) : templates.length === 0 ? (
              <div className={styles.sbEmpty}>No templates yet</div>
            ) : (
              templates.map(t => (
                <div key={t.id} className={`${styles.sbItem} ${selected?.id === t.id ? styles.selected : ''}`} onClick={() => { setSelectedId(t.id); setSelectedScene(0); }}>
                  <div className={styles.sbDot} style={{ background: (t.config as TemplateConfig)?.theme?.accentColor || '#3a7f9e' }} />
                  <span>{t.name}</span>
                  <span className={styles.sbCount}>{(t.config as TemplateConfig)?.scenes?.length || 0}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Scenes for selected template */}
        {selected && config && (
          <div className={styles.sbSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.sbHeader}>
              <h3>Scenes</h3>
              <div className={styles.spacer} />
            </div>
            <div className={styles.scenesList}>
              {config.scenes.map((s, i) => (
                <div key={i} className={`${styles.sceneItem} ${selectedScene === i ? styles.selected : ''}`} onClick={() => setSelectedScene(i)}>
                  <div className={`${styles.sceneNum} ${selectedScene === i ? styles.activeNum : ''}`} style={selectedScene === i ? { background: sceneTypeColors[s.type] || '#3a7f9e' } : {}}>{i + 1}</div>
                  <div className={styles.sceneInfo}>
                    <div className={styles.sceneName}>{s.type}</div>
                    <div className={styles.sceneType}>{s.duration ? `${s.duration}s` : ''} {s.pipPosition || ''}</div>
                  </div>
                  {config.scenes.length > 1 && (
                    <button className={styles.sceneRemove} onClick={e => { e.stopPropagation(); handleRemoveScene(i); }}>×</button>
                  )}
                </div>
              ))}
              <div className={styles.addSceneRow}>
                {['TitleCard', 'FullFrame', 'PiP', 'BRoll'].map(type => (
                  <button key={type} className={styles.addSceneBtn} onClick={() => handleAddScene(type)} style={{ borderColor: sceneTypeColors[type] + '40', color: sceneTypeColors[type] }}>
                    + {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className={styles.canvas}>
        {selected && config ? (
          <>
            <div className={styles.canvasFrame}>
              <div className={styles.canvasContent} style={{ background: config.theme.background === 'dark' ? '#0d1117' : '#f6f8fa' }}>
                {config.scenes[selectedScene]?.type === 'TitleCard' && (
                  <div className={styles.titlePreview}>
                    <div className={styles.titleText} style={{ color: config.theme.background === 'dark' ? '#e6edf3' : '#1f2328' }}>{selected.name}</div>
                    <div className={styles.titleBar} style={{ background: config.theme.accentColor }} />
                  </div>
                )}
                {config.scenes[selectedScene]?.type === 'PiP' && (
                  <>
                    <div className={styles.pipMain}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="48" height="48" opacity={0.15}><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                    </div>
                    <div className={styles.pipBubble} style={{ borderColor: config.theme.accentColor }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24" opacity={0.4}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  </>
                )}
                {config.scenes[selectedScene]?.type === 'FullFrame' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="64" height="64" opacity={0.12}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
                {config.scenes[selectedScene]?.type === 'BRoll' && (
                  <div className={styles.brollPreview}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="48" height="48" opacity={0.15}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span style={{ color: config.theme.background === 'dark' ? '#6e7681' : '#8b949e', fontSize: 12, marginTop: 8 }}>B-Roll cutaway</span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.formatBadge}>1920 × 1080</div>
          </>
        ) : (
          <div className={styles.canvasEmpty}>Select or create a template to start</div>
        )}
      </div>

      {/* Properties bar */}
      <div className={styles.propsBar}>
        {selected && config && config.scenes[selectedScene] ? (
          <>
            <div className={styles.pbGroup}>
              <span className={styles.pbLabel}>Scene</span>
              <span className={styles.pbValue}>{config.scenes[selectedScene].type}</span>
            </div>

            {config.scenes[selectedScene].duration !== undefined && (
              <div className={styles.pbGroup}>
                <span className={styles.pbLabel}>Duration</span>
                <input className={styles.pbInput} value={config.scenes[selectedScene].duration} onChange={e => handleUpdateScene(selectedScene, { duration: parseInt(e.target.value) || 0 })} style={{ width: 40 }} />
                <span className={styles.pbUnit}>s</span>
              </div>
            )}

            {config.scenes[selectedScene].type === 'PiP' && (
              <>
                <div className={styles.pbGroup}>
                  <span className={styles.pbLabel}>Position</span>
                  <select className={styles.pbSelect} value={config.scenes[selectedScene].pipPosition || 'bottom-right'} onChange={e => handleUpdateScene(selectedScene, { pipPosition: e.target.value })}>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                  </select>
                </div>
                <div className={styles.pbGroup}>
                  <span className={styles.pbLabel}>Shape</span>
                  <select className={styles.pbSelect} value={config.scenes[selectedScene].pipShape || 'circle'} onChange={e => handleUpdateScene(selectedScene, { pipShape: e.target.value })}>
                    <option value="circle">Circle</option>
                    <option value="rounded">Rounded</option>
                    <option value="square">Square</option>
                  </select>
                </div>
              </>
            )}

            <div className={styles.pbGroup}>
              <span className={styles.pbLabel}>Accent</span>
              {['#3a7f9e', '#cf222e', '#1a7f37', '#7c3aed', '#9a6700', '#f0883e'].map(c => (
                <div key={c} className={`${styles.pbSwatch} ${config.theme.accentColor === c ? styles.pbSwatchActive : ''}`} style={{ background: c }} onClick={() => handleUpdateTheme({ accentColor: c })} />
              ))}
            </div>
          </>
        ) : (
          <span className={styles.propsEmpty}>Select a scene to edit properties</span>
        )}
      </div>
    </div>
  )
}
