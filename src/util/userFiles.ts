import { getDirectory, getDirectorySize, clearDirectory, isOpfsAvailable } from '@/util/opfs'

export { isOpfsAvailable }

const DEFAULT_DIR_NAME = 'opfs_user_files'

export interface UserFileOptions {
  dirName?: string
}

export async function writeUserFile(
  name: string,
  data: Blob | BufferSource | string,
  options: UserFileOptions = {}
): Promise<void> {
  const { dirName = DEFAULT_DIR_NAME } = options
  const dir = await getDirectory(dirName)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(data)
  } finally {
    await writable.close()
  }
}

export async function readUserFile(
  name: string,
  options: UserFileOptions = {}
): Promise<File | null> {
  const { dirName = DEFAULT_DIR_NAME } = options
  try {
    const dir = await getDirectory(dirName)
    const handle = await dir.getFileHandle(name)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function deleteUserFile(
  name: string,
  options: UserFileOptions = {}
): Promise<void> {
  const { dirName = DEFAULT_DIR_NAME } = options
  try {
    const dir = await getDirectory(dirName)
    await dir.removeEntry(name)
  } catch {
    // File already missing
  }
}

export async function listUserFiles(options: UserFileOptions = {}): Promise<string[]> {
  const { dirName = DEFAULT_DIR_NAME } = options
  const dir = await getDirectory(dirName)
  const names: string[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') names.push(entry.name)
  }
  return names
}

export async function getUserFilesSize(
  options: UserFileOptions = {}
): Promise<{ size: number, count: number }> {
  const { dirName = DEFAULT_DIR_NAME } = options
  const dir = await getDirectory(dirName)
  return await getDirectorySize(dir)
}

export async function clearUserFiles(options: UserFileOptions = {}): Promise<void> {
  const { dirName = DEFAULT_DIR_NAME } = options
  await clearDirectory(dirName)
}
