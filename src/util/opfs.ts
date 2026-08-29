export async function isOpfsAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return false
  }
  try {
    await navigator.storage.getDirectory()
    return true
  } catch {
    return false
  }
}

export async function getDirectorySize(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ size: number, count: number }> {
  let totalBytes = 0
  let totalFiles = 0

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      totalBytes += file.size
      totalFiles++
    } else if (entry.kind === 'directory') {
      const dirSize = await getDirectorySize(entry as FileSystemDirectoryHandle)
      totalBytes += dirSize.size
      totalFiles += dirSize.count
    }
  }

  return {
    size: totalBytes,
    count: totalFiles,
  }
}

interface MemoryFile {
  name: string
  data: Uint8Array
  type: string
  lastModified: number
}

async function toUint8Array(data: Blob | BufferSource | string): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer())
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

class MemoryWritable {
  private chunks: Uint8Array[] = []

  constructor(private file: MemoryFile) {}

  async write(data: Blob | BufferSource | string): Promise<void> {
    this.chunks.push(await toUint8Array(data))
  }

  async close(): Promise<void> {
    const size = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Uint8Array(size)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.file.data = merged
    this.file.lastModified = Date.now()
  }
}

class MemoryFileHandle {
  readonly kind = 'file' as const

  constructor(public name: string, private file: MemoryFile) {}

  async getFile(): Promise<File> {
    return new File([this.file.data.slice()], this.file.name, {
      type: this.file.type,
      lastModified: this.file.lastModified,
    })
  }

  async createWritable(): Promise<MemoryWritable> {
    return new MemoryWritable(this.file)
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const
  private files = new Map<string, MemoryFile>()

  constructor(public name: string) {}

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    let file = this.files.get(name)
    if (!file) {
      if (!options?.create) {
        throw new DOMException(`File not found: ${name}`, 'NotFoundError')
      }
      file = { name, data: new Uint8Array(0), type: '', lastModified: Date.now() }
      this.files.set(name, file)
    }
    return new MemoryFileHandle(name, file)
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name)) {
      throw new DOMException(`File not found: ${name}`, 'NotFoundError')
    }
  }

  async *values(): AsyncGenerator<MemoryFileHandle> {
    for (const [name, file] of this.files) {
      yield new MemoryFileHandle(name, file)
    }
  }
}

const memoryDirs = new Map<string, MemoryDirectoryHandle>()

function getMemoryDirectory(name: string): MemoryDirectoryHandle {
  let dir = memoryDirs.get(name)
  if (!dir) {
    dir = new MemoryDirectoryHandle(name)
    memoryDirs.set(name, dir)
  }
  return dir
}

const dirHandleCache = new Map<string, Promise<FileSystemDirectoryHandle>>()

export async function getDirectory(name: string): Promise<FileSystemDirectoryHandle> {
  let promise = dirHandleCache.get(name)
  if (!promise) {
    promise = resolveDirectory(name)
    dirHandleCache.set(name, promise)
    promise.catch(() => dirHandleCache.delete(name)) // don't cache a failed lookup
  }
  return promise
}

async function resolveDirectory(name: string): Promise<FileSystemDirectoryHandle> {
  if (await isOpfsAvailable()) {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle(name, { create: true })
  }
  return getMemoryDirectory(name) as unknown as FileSystemDirectoryHandle
}

export async function clearDirectory(name: string): Promise<void> {
  memoryDirs.delete(name)
  dirHandleCache.delete(name)

  if (!(await isOpfsAvailable())) return

  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(name, { recursive: true })
  } catch {
    // Directory didn't exist or failed to remove
  }
}
