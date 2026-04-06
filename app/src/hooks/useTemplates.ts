import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { SceneLayout } from '../types/scene-layout'

export interface TemplateConfig {
  theme: {
    accentColor: string
    background: string
    fontFamily: string
    captionStyle: string
  }
  scenes: {
    type: string
    duration?: number
    transitionIn?: string
    transitionOut?: string
    pipPosition?: string
    pipSize?: number
    pipShape?: string
  }[]
  rules: Record<string, any>
  export: {
    defaultFormat: string
    defaultResolution: string
    defaultCodec: string
  }
  layout?: SceneLayout
}

export interface Template {
  id: string
  name: string
  slug?: string
  description?: string
  is_system?: boolean
  config: TemplateConfig
  created_at: string
  updated_at: string
}

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/templates')
      setTemplates((data.templates || []).map((t: any) => ({
        ...t,
        config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
      })))
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function createTemplate(name: string, ruleType?: string) {
    const data = await api.post('/templates', { name, rule_type: ruleType })
    await refresh()
    return data.template
  }

  async function updateTemplate(id: string, updates: { name?: string; config?: TemplateConfig }) {
    const data = await api.put(`/templates/${id}`, updates)
    await refresh()
    return data.template
  }

  async function deleteTemplate(id: string) {
    await api.delete(`/templates/${id}`)
    await refresh()
  }

  return { templates, loading, refresh, createTemplate, updateTemplate, deleteTemplate }
}
