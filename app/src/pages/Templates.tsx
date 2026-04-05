import { useState, useEffect, useRef, useCallback } from 'react'
import { useTemplates, type TemplateConfig } from '../hooks/useTemplates'
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
  const { templates, loading, createTemplate, updateTemplate } = useTemplates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedScene, setSelectedScene] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('podcast')

  const systemTemplates = templates.filter(t => t.is_system)
  const userTemplates = templates.filter(t => !t.is_system)

  const [playing, setPlaying] = useState(false)
  const [sceneElapsed, setSceneElapsed] = useState(0)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const selected = templates.find(t => t.id === selectedId) || templates[0] || null
  const config = selected?.config as TemplateConfig | undefined
  const isSystem = selected?.is_system === true

  const DEFAULT_SCENE_DURATION = 4

  const sceneDuration = useCallback((idx: number) => {
    if (!config) return DEFAULT_SCENE_DURATION
    return config.scenes[idx]?.duration || DEFAULT_SCENE_DURATION
  }, [config])

  const totalDuration = config ? config.scenes.reduce((sum, s) => sum + (s.duration || DEFAULT_SCENE_DURATION), 0) : 0

  // Compute global elapsed time from scene index + sceneElapsed
  const globalElapsed = config ? config.scenes.slice(0, selectedScene).reduce((sum, s) => sum + (s.duration || DEFAULT_SCENE_DURATION), 0) + sceneElapsed : 0
  const progressPercent = totalDuration > 0 ? (globalElapsed / totalDuration) * 100 : 0

  // Playback tick
  useEffect(() => {
    if (!playing || !config) return
    const TICK = 50
    playTimer.current = setInterval(() => {
      setSceneElapsed(prev => {
        const dur = sceneDuration(selectedScene)
        const next = prev + TICK / 1000
        if (next >= dur) {
          // Advance to next scene
          setSelectedScene(si => {
            const nextScene = si + 1
            if (nextScene >= config.scenes.length) {
              // Loop back to start
              setPlaying(false)
              return 0
            }
            return nextScene
          })
          return 0
        }
        return next
      })
    }, TICK)
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [playing, config, selectedScene, sceneDuration])

  // Stop playback when template changes
  useEffect(() => {
    setPlaying(false)
    setSelectedScene(0)
    setSceneElapsed(0)
  }, [selected?.id])

  function togglePlay() {
    if (!config) return
    if (playing) {
      setPlaying(false)
    } else {
      setSceneElapsed(0)
      setPlaying(true)
    }
  }

  function handleSceneClick(idx: number) {
    setPlaying(false)
    setSelectedScene(idx)
    setSceneElapsed(0)
  }

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
              <>
                {systemTemplates.length > 0 && (
                  <>
                    <div className={styles.sbGroupLabel}>System</div>
                    {systemTemplates.map(t => (
                      <div key={t.id} className={`${styles.sbItem} ${selected?.id === t.id ? styles.selected : ''}`} onClick={() => { setSelectedId(t.id); setSelectedScene(0); setPlaying(false); setSceneElapsed(0); }}>
                        <div className={styles.sbDot} style={{ background: (t.config as TemplateConfig)?.theme?.accentColor || '#3a7f9e' }} />
                        <span>{t.name}</span>
                        <span className={styles.sbBadge}>system</span>
                        <span className={styles.sbCount}>{(t.config as TemplateConfig)?.scenes?.length || 0}</span>
                      </div>
                    ))}
                  </>
                )}
                {userTemplates.length > 0 && (
                  <>
                    {systemTemplates.length > 0 && <div className={styles.sbGroupLabel}>Custom</div>}
                    {userTemplates.map(t => (
                      <div key={t.id} className={`${styles.sbItem} ${selected?.id === t.id ? styles.selected : ''}`} onClick={() => { setSelectedId(t.id); setSelectedScene(0); setPlaying(false); setSceneElapsed(0); }}>
                        <div className={styles.sbDot} style={{ background: (t.config as TemplateConfig)?.theme?.accentColor || '#3a7f9e' }} />
                        <span>{t.name}</span>
                        <span className={styles.sbCount}>{(t.config as TemplateConfig)?.scenes?.length || 0}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
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
                <div key={i} className={`${styles.sceneItem} ${selectedScene === i ? styles.selected : ''}`} onClick={() => handleSceneClick(i)}>
                  <div className={`${styles.sceneNum} ${selectedScene === i ? styles.activeNum : ''}`} style={selectedScene === i ? { background: sceneTypeColors[s.type] || '#3a7f9e' } : {}}>{i + 1}</div>
                  <div className={styles.sceneInfo}>
                    <div className={styles.sceneName}>{s.type}</div>
                    <div className={styles.sceneType}>{s.duration ? `${s.duration}s` : ''} {s.pipPosition || ''}</div>
                  </div>
                  {!isSystem && config.scenes.length > 1 && (
                    <button className={styles.sceneRemove} onClick={e => { e.stopPropagation(); handleRemoveScene(i); }}>×</button>
                  )}
                </div>
              ))}
              {!isSystem && (
                <div className={styles.addSceneRow}>
                  {['TitleCard', 'FullFrame', 'PiP', 'BRoll'].map(type => (
                    <button key={type} className={styles.addSceneBtn} onClick={() => handleAddScene(type)} style={{ borderColor: sceneTypeColors[type] + '40', color: sceneTypeColors[type] }}>
                      + {type}
                    </button>
                  ))}
                </div>
              )}
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
                {config.scenes[selectedScene]?.type === 'SideBySide' && (
                  <div className={styles.sideBySidePreview}>
                    <div className={styles.sbsPanel} style={{ borderColor: config.theme.accentColor + '60' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28" opacity={0.3}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span style={{ fontSize: 9, color: config.theme.background === 'dark' ? '#6e7681' : '#8b949e', marginTop: 4 }}>Speaker A</span>
                    </div>
                    <div className={styles.sbsDivider} style={{ background: config.theme.accentColor }} />
                    <div className={styles.sbsPanel} style={{ borderColor: config.theme.accentColor + '60' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28" opacity={0.3}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      <span style={{ fontSize: 9, color: config.theme.background === 'dark' ? '#6e7681' : '#8b949e', marginTop: 4 }}>Speaker B</span>
                    </div>
                  </div>
                )}
                {config.scenes[selectedScene]?.type === 'CaptionFocus' && (
                  <div className={styles.captionFocusPreview}>
                    <div className={styles.cfVideo}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="40" height="40" opacity={0.12}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                    <div className={styles.cfCaptions} style={{ background: config.theme.accentColor + '20', borderColor: config.theme.accentColor }}>
                      <div className={styles.cfLine} style={{ background: config.theme.background === 'dark' ? '#e6edf3' : '#1f2328', width: '80%' }} />
                      <div className={styles.cfLine} style={{ background: config.theme.background === 'dark' ? '#e6edf3' : '#1f2328', width: '60%', opacity: 0.5 }} />
                    </div>
                  </div>
                )}

                {/* Scene label overlay */}
                <div className={styles.sceneLabel} style={{ color: sceneTypeColors[config.scenes[selectedScene]?.type] || '#6e7681' }}>
                  {config.scenes[selectedScene]?.type}
                  {config.scenes[selectedScene]?.duration && <span> / {config.scenes[selectedScene].duration}s</span>}
                </div>
              </div>
            </div>

            {/* Transport controls */}
            <div className={styles.transport}>
              <button className={styles.playBtn} onClick={togglePlay}>
                {playing ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
              </button>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%`, background: config.theme.accentColor }} />
                {/* Scene markers */}
                {(() => {
                  const markers: React.ReactNode[] = []
                  let offset = 0
                  config.scenes.forEach((s, i) => {
                    if (i > 0) {
                      const pct = (offset / totalDuration) * 100
                      markers.push(<div key={i} className={styles.progressMarker} style={{ left: `${pct}%` }} />)
                    }
                    offset += s.duration || DEFAULT_SCENE_DURATION
                  })
                  return markers
                })()}
              </div>
              <span className={styles.transportTime}>{Math.floor(globalElapsed)}s / {totalDuration}s</span>
            </div>

            <div className={styles.formatBadge}>
              {config.export.defaultFormat === '9:16' ? '1080 x 1920' : '1920 x 1080'}
            </div>
          </>
        ) : (
          <div className={styles.canvasEmpty}>Select or create a template to start</div>
        )}
      </div>

      {/* Properties bar */}
      <div className={styles.propsBar}>
        {selected && config && config.scenes[selectedScene] ? (
          <>
            {isSystem && selected.description && (
              <div className={styles.pbGroup}>
                <span className={styles.pbDesc}>{selected.description}</span>
              </div>
            )}

            <div className={styles.pbGroup}>
              <span className={styles.pbLabel}>Scene</span>
              <span className={styles.pbValue}>{config.scenes[selectedScene].type}</span>
            </div>

            {config.scenes[selectedScene].duration !== undefined && (
              <div className={styles.pbGroup}>
                <span className={styles.pbLabel}>Duration</span>
                {isSystem ? (
                  <span className={styles.pbValue}>{config.scenes[selectedScene].duration}s</span>
                ) : (
                  <>
                    <input className={styles.pbInput} value={config.scenes[selectedScene].duration} onChange={e => handleUpdateScene(selectedScene, { duration: parseInt(e.target.value) || 0 })} style={{ width: 40 }} />
                    <span className={styles.pbUnit}>s</span>
                  </>
                )}
              </div>
            )}

            {config.scenes[selectedScene].type === 'PiP' && (
              <>
                <div className={styles.pbGroup}>
                  <span className={styles.pbLabel}>Position</span>
                  {isSystem ? (
                    <span className={styles.pbValue}>{config.scenes[selectedScene].pipPosition || 'bottom-right'}</span>
                  ) : (
                    <select className={styles.pbSelect} value={config.scenes[selectedScene].pipPosition || 'bottom-right'} onChange={e => handleUpdateScene(selectedScene, { pipPosition: e.target.value })}>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-left">Top Left</option>
                    </select>
                  )}
                </div>
                <div className={styles.pbGroup}>
                  <span className={styles.pbLabel}>Shape</span>
                  {isSystem ? (
                    <span className={styles.pbValue}>{config.scenes[selectedScene].pipShape || 'circle'}</span>
                  ) : (
                    <select className={styles.pbSelect} value={config.scenes[selectedScene].pipShape || 'circle'} onChange={e => handleUpdateScene(selectedScene, { pipShape: e.target.value })}>
                      <option value="circle">Circle</option>
                      <option value="rounded">Rounded</option>
                      <option value="square">Square</option>
                    </select>
                  )}
                </div>
              </>
            )}

            {!isSystem && (
              <div className={styles.pbGroup}>
                <span className={styles.pbLabel}>Accent</span>
                {['#3a7f9e', '#cf222e', '#1a7f37', '#7c3aed', '#9a6700', '#f0883e'].map(c => (
                  <div key={c} className={`${styles.pbSwatch} ${config.theme.accentColor === c ? styles.pbSwatchActive : ''}`} style={{ background: c }} onClick={() => handleUpdateTheme({ accentColor: c })} />
                ))}
              </div>
            )}

            {isSystem && (
              <div className={styles.pbGroup}>
                <span className={styles.pbLabel}>Format</span>
                <span className={styles.pbValue}>{config.export.defaultFormat} {config.export.defaultResolution}</span>
              </div>
            )}
          </>
        ) : (
          <span className={styles.propsEmpty}>Select a scene to edit properties</span>
        )}
      </div>
    </div>
  )
}
