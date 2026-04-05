import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { chunkedUpload } from '../lib/chunkedUpload'

export interface TemplateRules {
  removeFillers?: boolean
  trimSilence?: { enabled: boolean; thresholdMs: number }
  studioSound?: boolean
  normalize?: { enabled: boolean; targetLufs: number }
  autoCaptions?: boolean
  autoClips?: boolean
}

export interface ProjectTemplateConfig {
  theme?: Record<string, any>
  scenes?: Record<string, any>[]
  rules?: TemplateRules
  export?: { defaultFormat?: string; defaultResolution?: string; defaultCodec?: string }
}

export interface Project {
  id: string
  name: string
  status: 'draft' | 'editing' | 'exported'
  rule_template: string | null
  template_id: string | null
  template_config: ProjectTemplateConfig | null
  duration_ms: number | null
  resolution: string | null
  file_size: number | null
  created_at: string
  updated_at: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/projects')
      setProjects(data.projects || [])
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function createProject(name: string, ruleTemplate?: string) {
    const data = await api.post('/projects', { name, rule_template: ruleTemplate })
    await refresh()
    return data.project as Project
  }

  async function deleteProject(id: string) {
    await api.delete(`/projects/${id}`)
    await refresh()
  }

  return { projects, loading, refresh, createProject, deleteProject }
}

export interface Track {
  index: number
  type: 'video' | 'audio' | 'subtitle' | 'data'
  codec: string
  label: string | null
  duration_ms: number
  width?: number
  height?: number
  fps?: number
  channels?: number
  channel_layout?: string
  sample_rate?: number
  color?: string
}

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [files, setFiles] = useState({ hasTranscript: false, hasEdl: false, hasSuggestions: false, hasTracks: false })
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(data => {
        setProject(data.project)
        setFiles(data.files)
        setTracks(data.tracks || [])
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [id])

  async function importMedia(file: File, onProgress?: (pct: number) => void) {
    const data = await chunkedUpload(id, file, (p) => {
      if (onProgress) onProgress(p.percent)
    })
    setProject(p => p ? { ...p, duration_ms: data.duration_ms, resolution: data.resolution, file_size: data.file_size, status: 'editing' as const } : p)
    return data
  }

  async function transcribe(onProgress?: (pct: number) => void) {
    const token = localStorage.getItem('sulla_token')
    const res = await fetch(`/api/projects/${id}/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Transcription failed: ${res.status}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: any = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const msg = JSON.parse(line.slice(6))

        if (msg.type === 'progress' && onProgress) {
          onProgress(msg.progress)
        } else if (msg.type === 'done') {
          result = msg
        } else if (msg.type === 'error') {
          throw new Error(msg.error)
        }
      }
    }

    setFiles(f => ({ ...f, hasTranscript: true }))
    return result
  }

  async function getTranscript() {
    return api.get(`/projects/${id}/transcript`)
  }

  async function getEdl() {
    return api.get(`/projects/${id}/edl`)
  }

  async function saveEdl(edl: any) {
    return api.put(`/projects/${id}/edl`, edl)
  }

  async function getOverlays() {
    return api.get(`/projects/${id}/overlays`).catch(() => ({ overlays: [] }))
  }

  async function saveOverlays(overlays: any[]) {
    return api.put(`/projects/${id}/overlays`, { overlays })
  }

  async function renderVideo(options: { format?: string; resolution?: string; quality?: string } = {}) {
    return api.post(`/projects/${id}/render`, options)
  }

  async function renderClip(options: { start_ms: number; end_ms: number; format?: string; resolution?: string }) {
    return api.post(`/projects/${id}/clips`, options)
  }

  async function saveTracks(updatedTracks: Track[]) {
    setTracks(updatedTracks)
    return api.put(`/projects/${id}/tracks`, updatedTracks)
  }

  async function getExports() {
    return api.get(`/projects/${id}/exports`)
  }

  return { project, files, tracks, setTracks, loading, importMedia, transcribe, getTranscript, getEdl, saveEdl, getOverlays, saveOverlays, saveTracks, renderVideo, renderClip, getExports }
}
