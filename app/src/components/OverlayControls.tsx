import { type OverlayItem, type OverlayType, createOverlay } from './VideoOverlays'
import styles from './OverlayControls.module.css'

interface Props {
  overlays: OverlayItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: (item: OverlayItem) => void
  onUpdate: (item: OverlayItem) => void
  onRemove: (id: string) => void
}

const overlayTypes: { type: OverlayType; icon: JSX.Element; label: string }[] = [
  { type: 'pip', label: 'PiP Camera', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> },
  { type: 'caption', label: 'Caption', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg> },
  { type: 'text', label: 'Text', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
  { type: 'logo', label: 'Logo', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
]

const fonts = ['Inter', 'JetBrains Mono', 'Georgia', 'Arial', 'Helvetica Neue', 'Courier New', 'Impact', 'Comic Sans MS']

const shapes: { id: string; label: string; radius: number }[] = [
  { id: 'circle', label: 'Circle', radius: 50 },
  { id: 'rounded', label: 'Rounded', radius: 16 },
  { id: 'square', label: 'Square', radius: 0 },
]

export default function OverlayControls({ overlays, selectedId, onSelect, onAdd, onUpdate, onRemove }: Props) {
  const selected = overlays.find(o => o.id === selectedId)

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>Overlays</div>

      {/* Add buttons */}
      <div className={styles.addRow}>
        {overlayTypes.map(t => (
          <button key={t.type} className={styles.addBtn} onClick={() => { const o = createOverlay(t.type); onAdd(o); onSelect(o.id) }} title={`Add ${t.label}`}>
            {t.icon}
          </button>
        ))}
      </div>

      {/* Layer list */}
      <div className={styles.layerList}>
        {overlays.length === 0 && <div className={styles.empty}>No overlays. Add one above.</div>}
        {overlays.map(item => (
          <div
            key={item.id}
            className={`${styles.layerItem} ${selectedId === item.id ? styles.layerItemSelected : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <div className={`${styles.layerIcon} ${!item.visible ? styles.layerIconHidden : ''}`}>
              {overlayTypes.find(t => t.type === item.type)?.icon}
            </div>
            <span className={styles.layerName}>{item.label || item.type}</span>
            <button className={styles.layerToggle} onClick={(e) => { e.stopPropagation(); onUpdate({ ...item, visible: !item.visible }) }} title={item.visible ? 'Hide' : 'Show'}>
              {item.visible ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
            </button>
            <button className={styles.layerDelete} onClick={(e) => { e.stopPropagation(); onRemove(item.id) }} title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Property editor for selected overlay */}
      {selected && (
        <div className={styles.props}>
          <div className={styles.sectionTitle}>Properties</div>

          {/* PiP shape */}
          {selected.type === 'pip' && (
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Shape</span>
              <div className={styles.shapeRow}>
                {shapes.map(s => (
                  <button
                    key={s.id}
                    className={`${styles.shapeBtn} ${selected.borderRadius === s.radius ? styles.shapeBtnActive : ''}`}
                    onClick={() => onUpdate({ ...selected, borderRadius: s.radius, shape: s.id as any })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PiP border color */}
          {selected.type === 'pip' && (
            <div className={styles.propRow}>
              <span className={styles.propLabel}>Border</span>
              <input type="color" value={selected.borderColor || '#5096b3'} onChange={e => onUpdate({ ...selected, borderColor: e.target.value })} className={styles.colorInput} />
              <input type="number" min={0} max={10} value={selected.borderWidth || 3} onChange={e => onUpdate({ ...selected, borderWidth: Number(e.target.value) })} className={styles.numInput} />
            </div>
          )}

          {/* Text / Caption properties */}
          {(selected.type === 'caption' || selected.type === 'text') && (
            <>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Text</span>
                <input
                  type="text"
                  value={selected.text || ''}
                  onChange={e => onUpdate({ ...selected, text: e.target.value })}
                  className={styles.textInput}
                />
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Font</span>
                <select value={selected.fontFamily || 'Inter'} onChange={e => onUpdate({ ...selected, fontFamily: e.target.value })} className={styles.selectInput}>
                  {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Size</span>
                <input type="range" min={10} max={48} value={selected.fontSize || 16} onChange={e => onUpdate({ ...selected, fontSize: Number(e.target.value) })} className={styles.slider} />
                <span className={styles.sliderVal}>{selected.fontSize || 16}px</span>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Color</span>
                <input type="color" value={selected.fontColor || '#ffffff'} onChange={e => onUpdate({ ...selected, fontColor: e.target.value })} className={styles.colorInput} />
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Background</span>
                <input type="color" value={selected.bgColor?.startsWith('rgba') ? '#000000' : (selected.bgColor || '#000000')} onChange={e => onUpdate({ ...selected, bgColor: e.target.value })} className={styles.colorInput} />
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Radius</span>
                <input type="range" min={0} max={24} value={selected.borderRadius || 0} onChange={e => onUpdate({ ...selected, borderRadius: Number(e.target.value) })} className={styles.slider} />
                <span className={styles.sliderVal}>{selected.borderRadius || 0}px</span>
              </div>
            </>
          )}

          {/* Opacity for all types */}
          <div className={styles.propRow}>
            <span className={styles.propLabel}>Opacity</span>
            <input type="range" min={10} max={100} value={Math.round((selected.opacity ?? 1) * 100)} onChange={e => onUpdate({ ...selected, opacity: Number(e.target.value) / 100 })} className={styles.slider} />
            <span className={styles.sliderVal}>{Math.round((selected.opacity ?? 1) * 100)}%</span>
          </div>

          {/* Position readout */}
          <div className={styles.propRow}>
            <span className={styles.propLabel}>Position</span>
            <span className={styles.posVal}>{Math.round(selected.position.x)}%, {Math.round(selected.position.y)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}
