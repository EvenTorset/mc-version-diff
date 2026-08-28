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

const dirHandleCache = new Map<string, Promise<FileSystemDirectoryHandle>>()

export async function getDirectory(name: string): Promise<FileSystemDirectoryHandle> {
  let promise = dirHandleCache.get(name)
  if (!promise) {
    promise = navigator.storage.getDirectory().then(root => root.getDirectoryHandle(name, { create: true }))
    dirHandleCache.set(name, promise)
    promise.catch(() => dirHandleCache.delete(name)) // don't cache a failed lookup
  }
  return promise
}

export async function clearDirectory(name: string): Promise<void> {
  if (!(await isOpfsAvailable())) return

  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(name, { recursive: true })
  } catch {
    // Directory didn't exist or failed to remove
  } finally {
    dirHandleCache.delete(name)
  }
}
