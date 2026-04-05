const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB

interface UploadProgress {
  phase: 'uploading' | 'processing'
  percent: number        // 0-100
  chunksUploaded: number
  totalChunks: number
  bytesUploaded: number
  totalBytes: number
}

interface UploadSession {
  uploadId: string
  chunkSize: number
  totalChunks: number
  receivedChunks: number[]
}

const STORAGE_KEY = 'sulla_upload_sessions'

function saveSession(projectId: string, session: { uploadId: string; filename: string; fileSize: number }) {
  try {
    const sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    sessions[projectId] = session
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {}
}

function clearSession(projectId: string) {
  try {
    const sessions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    delete sessions[projectId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {}
}

/**
 * Upload a file in chunks with resume support.
 * Returns the import metadata on completion.
 */
export async function chunkedUpload(
  projectId: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<any> {
  const token = localStorage.getItem('sulla_token')
  const headers = (extra: Record<string, string> = {}) => ({
    'Authorization': `Bearer ${token}`,
    ...extra,
  })

  // 1. Initialize upload (or resume existing)
  const initRes = await fetch(`/api/projects/${projectId}/upload/init`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      filename: file.name,
      fileSize: file.size,
      chunkSize: CHUNK_SIZE,
    }),
    signal,
  })
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}))
    throw new Error(body.error || `Upload init failed: ${initRes.status}`)
  }

  const session: UploadSession = await initRes.json()
  saveSession(projectId, { uploadId: session.uploadId, filename: file.name, fileSize: file.size })

  const receivedSet = new Set(session.receivedChunks || [])
  const totalChunks = session.totalChunks
  const chunkSize = session.chunkSize || CHUNK_SIZE
  let chunksUploaded = receivedSet.size

  // Report initial progress (for resume)
  onProgress({
    phase: 'uploading',
    percent: Math.round((chunksUploaded / totalChunks) * 100),
    chunksUploaded,
    totalChunks,
    bytesUploaded: chunksUploaded * chunkSize,
    totalBytes: file.size,
  })

  // 2. Upload chunks (skip already received)
  for (let i = 0; i < totalChunks; i++) {
    if (receivedSet.has(i)) continue
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')

    const start = i * chunkSize
    const end = Math.min(start + chunkSize, file.size)
    const chunk = file.slice(start, end)

    const chunkRes = await fetch(`/api/projects/${projectId}/upload/chunk`, {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/octet-stream',
        'X-Upload-Id': session.uploadId,
        'X-Chunk-Index': String(i),
      }),
      body: chunk,
      signal,
    })

    if (!chunkRes.ok) {
      const body = await chunkRes.json().catch(() => ({}))
      throw new Error(body.error || `Chunk ${i} failed: ${chunkRes.status}`)
    }

    chunksUploaded++
    onProgress({
      phase: 'uploading',
      percent: Math.round((chunksUploaded / totalChunks) * 100),
      chunksUploaded,
      totalChunks,
      bytesUploaded: Math.min(chunksUploaded * chunkSize, file.size),
      totalBytes: file.size,
    })
  }

  // 3. Complete — reassemble + extract metadata
  onProgress({
    phase: 'processing',
    percent: 100,
    chunksUploaded: totalChunks,
    totalChunks,
    bytesUploaded: file.size,
    totalBytes: file.size,
  })

  const completeRes = await fetch(`/api/projects/${projectId}/upload/complete`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uploadId: session.uploadId }),
    signal,
  })

  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => ({}))
    throw new Error(body.error || `Upload complete failed: ${completeRes.status}`)
  }

  clearSession(projectId)
  return completeRes.json()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
