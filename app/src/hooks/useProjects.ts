import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export interface Project {
  id: string
  name: string
  status: 'draft' | 'editing' | 'exported'
  rule_template: string | null
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

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [files, setFiles] = useState({ hasTranscript: false, hasEdl: false, hasSuggestions: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(data => {
        setProject(data.project)
        setFiles(data.files)
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false))
  }, [id])

  async function importMedia(file: File) {
    const res = await fetch(`/api/projects/${id}/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('sulla_token')}`,
        'Content-Type': 'application/octet-stream',
        'X-Filename': file.name,
      },
      body: file,
    })
    if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
    const data = await res.json()
    setProject(p => p ? { ...p, duration_ms: data.duration_ms, resolution: data.resolution, file_size: data.file_size, status: 'editing' } : p)
    return data
  }

  async function transcribe() {
    const data = await api.post(`/projects/${id}/transcribe`, {})
    setFiles(f => ({ ...f, hasTranscript: true }))
    return data
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

  return { project, files, loading, importMedia, transcribe, getTranscript, getEdl, saveEdl }
}
