import type { ProgressHandler } from '@/util/progress'
import { Settings } from '@/settings'
import { getDirectorySize, getDirectory, clearDirectory, isOpfsAvailable } from '@/util/opfs'

export interface CacheManifestEntry {
  id: string
  filename: string
  lastAccessed: number
  size: number
}

export interface GetFileOptions {
  progHandler?: ProgressHandler
  dirName?: string
  extension?: string
}

type Manifest = Record<string, CacheManifestEntry>

export const CORS = import.meta.env.PROD ? 'https://cors.dokucraft.co.uk:2096/' : ''

const DEFAULT_DIR_NAME = 'opfs_file_cache'

export async function download(
  url: string,
  progHandler?: ProgressHandler,
  init?: RequestInit
): Promise<Response> {
  progHandler?.setUnit('byte')
  progHandler?.update(0, 0, 0)

  const response = await fetch(url, init)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const contentLength = Number(response.headers.get('Content-Length')) || 0
  let received = 0

  const progressStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.length
      const ratio = contentLength > 0 ? received / contentLength : 0
      progHandler?.update(ratio, received, contentLength)
      controller.enqueue(chunk)
    },
    flush() {
      progHandler?.update(1, received, contentLength || received)
    },
  })

  const monitoredStream = response.body.pipeThrough(progressStream)

  return new Response(monitoredStream, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export async function getCachedFile(
  id: string,
  url: string,
  options: GetFileOptions = {}
): Promise<File> {
  const {
    dirName = DEFAULT_DIR_NAME,
    extension = '',
    progHandler,
  } = options

  const filename = buildFilename(id, extension)

  if (!(await isOpfsAvailable())) {
    return fetchFileWithoutCache(url, filename, progHandler)
  }

  try {
    const dir = await getDirectory(dirName)
    const manifest = await readManifest(dir)

    if (manifest[id]) {
      try {
        const fileHandle = await dir.getFileHandle(filename)
        const file = await fileHandle.getFile()

        manifest[id].lastAccessed = Date.now()
        await writeManifest(dir, manifest)

        progHandler?.setUnit('byte')
        progHandler?.update(1, file.size, file.size)
        return file
      } catch {
        delete manifest[id]
      }
    }

    const response = await download(url, progHandler)
    if (!response.body) throw new Error('Response body missing')

    const fileHandle = await dir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()

    await response.body.pipeTo(writable)

    const file = await fileHandle.getFile()
    manifest[id] = {
      id,
      filename,
      lastAccessed: Date.now(),
      size: file.size,
    }

    await evictUntilUnderSize(dir, manifest, Settings.cacheSizeMax)
    await writeManifest(dir, manifest)

    return file
  } catch {
    return fetchFileWithoutCache(url, filename, progHandler)
  }
}

export async function clearCache(dirName = DEFAULT_DIR_NAME): Promise<void> {
  await clearDirectory(dirName)
}

export async function getCacheSize(
  dirName = DEFAULT_DIR_NAME
): Promise<{ size: number, count: number }> {
  const dir = await getDirectory(dirName)
  return await getDirectorySize(dir)
}

async function fetchFileWithoutCache(
  url: string,
  filename: string,
  progHandler?: ProgressHandler
): Promise<File> {
  const response = await download(url, progHandler)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type })
}

async function readManifest(dir: FileSystemDirectoryHandle): Promise<Manifest> {
  try {
    const handle = await dir.getFileHandle('manifest.json')
    const file = await handle.getFile()
    const text = await file.text()
    return JSON.parse(text) as Manifest
  } catch {
    return {}
  }
}

async function writeManifest(
  dir: FileSystemDirectoryHandle,
  manifest: Manifest
): Promise<void> {
  const handle = await dir.getFileHandle('manifest.json', { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(manifest, null, 2))
  await writable.close()
}

async function evictUntilUnderSize(
  dir: FileSystemDirectoryHandle,
  manifest: Manifest,
  maxSize: number
): Promise<void> {
  const { size: totalSize } = await getDirectorySize(dir)
  let excess = totalSize - maxSize
  if (excess <= 0) return

  const entries = Object.values(manifest).sort((a, b) => a.lastAccessed - b.lastAccessed)

  for (const item of entries) {
    if (excess <= 0) break
    try {
      await dir.removeEntry(item.filename)
    } catch {
      // File already missing
    }
    delete manifest[item.id]
    excess -= item.size
  }
}

function buildFilename(id: string, extension: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!extension) return safeId
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return `${safeId}${ext}`
}
