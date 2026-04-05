import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTemplates, type TemplateConfig } from '../hooks/useTemplates'
import { useProjects } from '../hooks/useProjects'
import styles from './TemplateEditor.module.css'

const sceneTypeColors: Record<string, string> = {
  TitleCard: '#7c3aed',
  FullFrame: '#3a7f9e',
  PiP: '#5096b3',
  BRoll: '#1a7f37',
  SideBySide: '#9a6700',
  CaptionFocus: '#cf222e',
}

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { templates, loading: templatesLoading, updateTemplate } = useTemplates()
  const { projects, loading: projectsLoading } = useProjects()

  const [leftTab, setLeftTab] = useState<'elements' | 'templates' | 'projects'>('elements')
  const [rightTab, setRightTab] = useState<'style' | 'animate' | 'layout'>('style')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const template = templates.find(t => t.id === id) || null
  const config = template?.config as TemplateConfig | undefined

  if (templatesLoading || projectsLoading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (!template || !config) {
    return <div className={styles.loading}>Template not found. <a href="/templates">Back to templates</a></div>
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId) || null

  return (
    <div className={styles.app}>
      {/* ═══ TOP BAR ═══ */}
      <div className={styles.topbar}>
        <a className={styles.logo} href="/" onClick={e => { e.preventDefault(); navigate('/') }}>sulla</a>
        <div className={styles.breadcrumb}>
          <span>/</span>
          <a href="/templates" onClick={e => { e.preventDefault(); navigate('/templates') }}>Templates</a>
          <span>/</span>
          <strong>{template.name}</strong>
        </div>
        <div className={styles.spacer} />
        <button className={styles.topBtnSecondary} onClick={() => navigate('/templates')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <button className={styles.topBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      {/* ═══ LEFT PANEL ═══ */}
      <div className={styles.leftPanel}>
        <div className={styles.tabs}>
          <div className={`${styles.tab} ${leftTab === 'elements' ? styles.tabActive : ''}`} onClick={() => setLeftTab('elements')}>Elements</div>
          <div className={`${styles.tab} ${leftTab === 'templates' ? styles.tabActive : ''}`} onClick={() => setLeftTab('templates')}>Templates</div>
          <div className={`${styles.tab} ${leftTab === 'projects' ? styles.tabActive : ''}`} onClick={() => setLeftTab('projects')}>Projects</div>
        </div>

        {/* Elements */}
        {leftTab === 'elements' && (
          <div className={styles.tabContent}>
            <div className={styles.search}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Search elements..." />
            </div>
            <div className={styles.section}><div className={styles.sectionLabel}>Video Layers</div>
              <div className={styles.grid}>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconVideo}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div><span>PiP Camera</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconVideo}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div><span>Screen</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconMedia}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div><span>Image</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconMedia}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div><span>B-Roll</span></div>
              </div>
            </div>
            <div className={styles.section}><div className={styles.sectionLabel}>Text & Titles</div>
              <div className={styles.grid}>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconText}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></div><span>Heading</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconText}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg></div><span>Caption</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconText}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2H3v16h5v4l4-4h9V2z"/></svg></div><span>Lower Third</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconText}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg></div><span>Body Text</span></div>
              </div>
            </div>
            <div className={styles.section}><div className={styles.sectionLabel}>Shapes & Graphics</div>
              <div className={styles.grid}>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconShape}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div><span>Rectangle</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconShape}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg></div><span>Circle</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconShape}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg></div><span>Divider</span></div>
                <div className={styles.card}><div className={`${styles.cardIcon} ${styles.iconShape}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><span>Badge</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Templates */}
        {leftTab === 'templates' && (
          <div className={styles.tabContent}>
            <div className={styles.search}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Search templates..." />
            </div>
            <div className={styles.templateList}>
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`${styles.templateItem} ${t.id === template.id ? styles.templateItemActive : ''}`}
                  onClick={() => navigate(`/templates/${t.id}`)}
                >
                  <div className={styles.templateThumb} style={{ background: (t.config as TemplateConfig)?.theme?.background === 'dark' ? '#0d1117' : '#f6f8fa' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="16" height="16" opacity={0.2}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                  <div className={styles.templateMeta}>
                    <div className={styles.templateName}>{t.name}</div>
                    <div className={styles.templateInfo}>{(t.config as TemplateConfig)?.scenes?.length || 0} scenes{t.is_system ? ' · system' : ''}</div>
                  </div>
                  {t.id === template.id && <span className={styles.currentBadge}>Current</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {leftTab === 'projects' && (
          <div className={styles.tabContent}>
            <div className={styles.search}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Search projects..." />
            </div>
            <div className={styles.section}><div className={styles.sectionLabel}>Your Projects</div></div>
            <div className={styles.projectList}>
              {projects.length === 0 ? (
                <div className={styles.emptyState}>No projects yet</div>
              ) : projects.map(p => (
                <div
                  key={p.id}
                  className={`${styles.projectItem} ${p.id === selectedProjectId ? styles.projectItemActive : ''}`}
                  onClick={() => setSelectedProjectId(p.id)}
                >
                  <div className={styles.projectThumb}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'rgba(255,255,255,0.4)' }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                  <div className={styles.projectMeta}>
                    <div className={styles.projectName}>{p.name}</div>
                    <div className={styles.projectInfo}>
                      {p.duration_ms ? `${Math.floor(p.duration_ms / 60000)}:${String(Math.floor((p.duration_ms % 60000) / 1000)).padStart(2, '0')}` : '—'}
                      {p.resolution ? ` · ${p.resolution}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ CANVAS ═══ */}
      <div className={styles.canvas}>
        <div className={styles.aspectPills}>
          {['16:9', '9:16', '1:1', '4:5'].map(a => (
            <button key={a} className={`${styles.aspectPill} ${config.export.defaultFormat === a ? styles.aspectPillActive : ''}`}>{a}</button>
          ))}
        </div>

        <div className={styles.canvasFrame}>
          <div className={styles.canvasVideo} style={{ background: config.theme.background === 'dark' ? '#0d1117' : '#f6f8fa' }}>
            {/* PiP scene preview */}
            {config.scenes.some(s => s.type === 'PiP') && (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="48" height="48" opacity={0.1}><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                <div className={styles.pipBubble} style={{ borderColor: config.theme.accentColor }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24" opacity={0.4}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              </>
            )}

            {/* Caption preview */}
            <div className={styles.captionPreview}>
              <span>Building </span>
              <span className={styles.captionHighlight} style={{ background: config.theme.accentColor + '30', color: config.theme.accentColor }}>amazing </span>
              <span>products</span>
            </div>

            {/* Lower third */}
            <div className={styles.lowerThird}>
              <div className={styles.ltAccent} style={{ background: config.theme.accentColor }} />
              <div className={styles.ltText}>
                <div className={styles.ltName}>{selectedProject?.name || template.name}</div>
                <div className={styles.ltRole}>{template.description || 'Template Preview'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scene strip */}
        <div className={styles.sceneStrip}>
          <div className={styles.sceneHeader}>
            <span className={styles.sceneHeaderTitle}>Scenes</span>
          </div>
          <div className={styles.sceneScroll}>
            {config.scenes.map((s, i) => (
              <div key={i} className={styles.sceneCard}>
                <div className={styles.sceneThumb} style={{ background: config.theme.background === 'dark' ? '#0d1117' : '#e8ebef' }}>
                  <span className={styles.sceneType} style={{ color: sceneTypeColors[s.type] || '#6e7681' }}>{s.type}</span>
                </div>
                <div className={styles.sceneMeta}>
                  <div className={styles.sceneName}>Scene {i + 1}</div>
                  <div className={styles.sceneInfo}>{s.duration ? `${s.duration}s` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className={styles.rightPanel}>
        <div className={styles.tabs}>
          <div className={`${styles.tab} ${rightTab === 'style' ? styles.tabActive : ''}`} onClick={() => setRightTab('style')}>Style</div>
          <div className={`${styles.tab} ${rightTab === 'animate' ? styles.tabActive : ''}`} onClick={() => setRightTab('animate')}>Animate</div>
          <div className={`${styles.tab} ${rightTab === 'layout' ? styles.tabActive : ''}`} onClick={() => setRightTab('layout')}>Layout</div>
        </div>

        {/* Style tab */}
        {rightTab === 'style' && (
          <div className={styles.tabContent}>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Theme</div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Accent</span>
                <div className={styles.swatchRow}>
                  {['#3a7f9e', '#cf222e', '#1a7f37', '#7c3aed', '#9a6700', '#f0883e'].map(c => (
                    <div key={c} className={`${styles.swatch} ${config.theme.accentColor === c ? styles.swatchActive : ''}`} style={{ background: c }} onClick={() => updateTemplate(template.id, { config: { ...config, theme: { ...config.theme, accentColor: c } } })} />
                  ))}
                </div>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Background</span>
                <select className={styles.propSelect} value={config.theme.background} onChange={e => updateTemplate(template.id, { config: { ...config, theme: { ...config.theme, background: e.target.value } } })}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Font</span>
                <select className={styles.propSelect} value={config.theme.fontFamily} onChange={e => updateTemplate(template.id, { config: { ...config, theme: { ...config.theme, fontFamily: e.target.value } } })}>
                  <option value="Inter">Inter</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Arial">Arial</option>
                </select>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Captions</span>
                <select className={styles.propSelect} value={config.theme.captionStyle} onChange={e => updateTemplate(template.id, { config: { ...config, theme: { ...config.theme, captionStyle: e.target.value } } })}>
                  <option value="pop">Pop Highlight</option>
                  <option value="underline">Underline</option>
                  <option value="karaoke">Karaoke</option>
                  <option value="box">Classic Box</option>
                </select>
              </div>
            </div>

            <div className={styles.propSection}>
              <div className={styles.propTitle}>Export</div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Format</span>
                <select className={styles.propSelect} value={config.export.defaultFormat}>
                  <option value="16:9">16:9 Landscape</option>
                  <option value="9:16">9:16 Vertical</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="4:5">4:5 Portrait</option>
                </select>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Resolution</span>
                <select className={styles.propSelect} value={config.export.defaultResolution}>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="4k">4K</option>
                </select>
              </div>
            </div>

            <div className={styles.propSection}>
              <div className={styles.propTitle}>Scenes ({config.scenes.length})</div>
              {config.scenes.map((s, i) => (
                <div key={i} className={styles.sceneRow}>
                  <div className={styles.sceneRowDot} style={{ background: sceneTypeColors[s.type] || '#6e7681' }} />
                  <span className={styles.sceneRowName}>{s.type}</span>
                  <span className={styles.sceneRowDur}>{s.duration || '—'}s</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Animate tab */}
        {rightTab === 'animate' && (
          <div className={styles.tabContent}>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Entrance</div>
              <div className={styles.animGrid}>
                {['None', 'Fade In', 'Slide Up', 'Slide Right', 'Scale In', 'Bounce', 'Spin In', 'Pop'].map(a => (
                  <div key={a} className={`${styles.animCard} ${a === 'Fade In' ? styles.animCardActive : ''}`}>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Timing</div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Duration</span>
                <input type="range" className={styles.slider} min="100" max="2000" defaultValue="300" />
                <span className={styles.sliderVal}>0.3s</span>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Delay</span>
                <input type="range" className={styles.slider} min="0" max="2000" defaultValue="0" />
                <span className={styles.sliderVal}>0s</span>
              </div>
            </div>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Easing</div>
              <div className={styles.easingRow}>
                {['Linear', 'Ease Out', 'Ease In', 'Spring'].map(e => (
                  <button key={e} className={`${styles.easingBtn} ${e === 'Ease Out' ? styles.easingBtnActive : ''}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Layout tab */}
        {rightTab === 'layout' && (
          <div className={styles.tabContent}>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Alignment</div>
              <div className={styles.alignRow}>
                {['Left', 'Center H', 'Right', 'Top', 'Center V', 'Bottom'].map(a => (
                  <button key={a} className={styles.alignBtn} title={a}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Canvas Grid</div>
              <div className={styles.gridRow}>
                {['None', 'Thirds', 'Center', 'Golden'].map(g => (
                  <button key={g} className={`${styles.gridBtn} ${g === 'Thirds' ? styles.gridBtnActive : ''}`}>{g}</button>
                ))}
              </div>
            </div>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Spacing</div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Padding</span>
                <input type="range" className={styles.slider} min="0" max="100" defaultValue="24" />
                <span className={styles.sliderVal}>24px</span>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Margin</span>
                <input type="range" className={styles.slider} min="0" max="100" defaultValue="16" />
                <span className={styles.sliderVal}>16px</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
