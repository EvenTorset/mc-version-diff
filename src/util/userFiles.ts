import { getDirectory, getDirectorySize, clearDirectory, isOpfsAvailable } from '@/util/opfs'

export { isOpfsAvailable }

const USER_FILES_DIR = 'user_files'

export async function writeUserFile(
  name: string,
  data: Blob | BufferSource | string,
): Promise<void> {
  const dir = await getDirectory(USER_FILES_DIR)
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(data)
  } finally {
    await writable.close()
  }
}

export async function readUserFile(name: string): Promise<File | null> {
  try {
    const dir = await getDirectory(USER_FILES_DIR)
    const handle = await dir.getFileHandle(name)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function deleteUserFile(name: string): Promise<void> {
  try {
    const dir = await getDirectory(USER_FILES_DIR)
    await dir.removeEntry(name)
  } catch {
    // File already missing
  }
}

export async function listUserFiles(): Promise<string[]> {
  const dir = await getDirectory(USER_FILES_DIR)
  const names: string[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') names.push(entry.name)
  }
  return names
}

export async function getUserFilesSize(): Promise<{ size: number, count: number }> {
  const dir = await getDirectory(USER_FILES_DIR)
  return await getDirectorySize(dir)
}

export async function clearUserFiles(): Promise<void> {
  await clearDirectory(USER_FILES_DIR)
}
