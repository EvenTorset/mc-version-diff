import PackWorker from './pack.worker?worker'
import type { PackWorkerFile, PackWorkerInput, PackWorkerMessage } from './pack.worker'

const POST_CHUNK = 1000

function nextTask() {
  return new Promise<void>(resolve => setTimeout(resolve))
}

export interface PickedFolder {
  name: string
  files: PackWorkerFile[]
}

export function folderFromInput(list: FileList | File[]): PickedFolder | null {
  const files = Array.from(list)
  const root = files[0]?.webkitRelativePath.split('/')[0]
  if (!root) return null
  return {
    name: root,
    files: files.map(file => ({ path: file.webkitRelativePath.split('/').slice(1).join('/'), file })),
  }
}

function readEntries(dir: FileSystemDirectoryEntry) {
  const reader = dir.createReader()
  const all: FileSystemEntry[] = []
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const next = () => reader.readEntries(batch => {
      if (!batch.length) return resolve(all)
      all.push(...batch)
      next()
    }, reject)
    next()
  })
}

async function walk(entry: FileSystemEntry, path: string): Promise<PackWorkerFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [{ path, file }]
  }
  const children = await readEntries(entry as FileSystemDirectoryEntry)
  const nested = await Promise.all(children.map(child => walk(child, path ? `${path}/${child.name}` : child.name)))
  return nested.flat()
}

export function droppedFolder(dt: DataTransfer | null): FileSystemDirectoryEntry | null {
  for (const item of Array.from(dt?.items ?? [])) {
    const entry = item.webkitGetAsEntry?.()
    if (entry?.isDirectory) return entry as FileSystemDirectoryEntry
  }
  return null
}

export async function folderFromEntry(dir: FileSystemDirectoryEntry): Promise<PickedFolder> {
  return { name: dir.name, files: await walk(dir, '') }
}

export async function packFolder(folder: PickedFolder, onProgress?: (done: number, total: number) => void): Promise<File> {
  const worker = new PackWorker()
  const post = (input: PackWorkerInput) => worker.postMessage(input)
  const done = new Promise<File>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<PackWorkerMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total)
      } else {
        worker.terminate()
        resolve(new File([msg.bytes], folder.name, { type: 'application/zip' }))
      }
    }
    worker.onerror = err => {
      worker.terminate()
      reject(err)
    }
  })
  await nextTask()
  for (let i = 0; i < folder.files.length; i += POST_CHUNK) {
    post({ type: 'files', files: folder.files.slice(i, i + POST_CHUNK) })
    await nextTask()
  }
  post({ type: 'pack' })
  return done
}
