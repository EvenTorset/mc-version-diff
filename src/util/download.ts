import type { ProgressHandler } from '@/util/progress'
import { Settings } from '@/settings'
import { getDirectorySize, getDirectory, clearDirectory } from '@/util/opfs'

export interface CacheManifestEntry {
  id: string
  filename: string
  lastAccessed: number
  size: number
}

export interface GetFileOptions {
  progHandler?: ProgressHandler
  extension?: string
}

type Manifest = Record<string, CacheManifestEntry>

export const CORS = import.meta.env.PROD ? 'https://cors.dokucraft.co.uk:2096/' : ''

const CACHE_DIR = 'download_cache'

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
    extension = '',
    progHandler,
  } = options

  const filename = buildFilename(id, extension)

  try {
    const dir = await getDirectory(CACHE_DIR)
    const manifest = await getManifest(dir)

    try {
      const fileHandle = await dir.getFileHandle(filename)
      const file = await fileHandle.getFile()

      manifest[id] = { id, filename, lastAccessed: Date.now(), size: file.size }
      queueManifestWrite(dir, manifest)

      progHandler?.setUnit('byte')
      progHandler?.update(1, file.size, file.size)
      return file
    } catch {
      delete manifest[id]
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
    await queueManifestWrite(dir, manifest)

    return file
  } catch (err) {
    console.warn(`Fetching file without cache: ${url}\n${err}`)
    return fetchFileWithoutCache(url, filename, progHandler)
  }
}

export async function readCachedBuffer(name: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await getDirectory(CACHE_DIR)
    const handle = await dir.getFileHandle(name)
    const file = await handle.getFile()
    const manifest = await getManifest(dir)
    manifest[name] = { id: name, filename: name, lastAccessed: Date.now(), size: file.size }
    queueManifestWrite(dir, manifest)
    return await file.arrayBuffer()
  } catch {
    return null
  }
}

export async function writeCachedBuffer(name: string, bytes: Uint8Array): Promise<void> {
  try {
    const dir = await getDirectory(CACHE_DIR)
    const handle = await dir.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes as BufferSource)
    await writable.close()
    const manifest = await getManifest(dir)
    const file = await handle.getFile()
    manifest[name] = { id: name, filename: name, lastAccessed: Date.now(), size: file.size }
    await evictUntilUnderSize(dir, manifest, Settings.cacheSizeMax)
    await queueManifestWrite(dir, manifest)
  } catch {
    return
  }
}

export async function clearCache(): Promise<void> {
  manifestPromise = null
  await clearDirectory(CACHE_DIR)
}

export async function getCacheSize(): Promise<{ size: number, count: number }> {
  const dir = await getDirectory(CACHE_DIR)
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

let manifestPromise: Promise<Manifest> | null = null
let writeChain: Promise<void> = Promise.resolve()
let writeQueued = false

function getManifest(dir: FileSystemDirectoryHandle): Promise<Manifest> {
  return manifestPromise ??= readManifest(dir)
}

function queueManifestWrite(dir: FileSystemDirectoryHandle, manifest: Manifest): Promise<void> {
  if (writeQueued) return writeChain
  writeQueued = true
  writeChain = writeChain.catch(() => {}).then(() => {
    writeQueued = false
    return writeManifest(dir, manifest)
  })
  return writeChain
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
