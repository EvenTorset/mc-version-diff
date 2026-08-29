import { getDirectory, clearDirectory } from '@/util/opfs'

const DIR = 'cmp_cache'

function fileName(a: string, b: string) {
  return `${a}__${b}`.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json'
}

export function verdictKey(kind: string, crcA: number, crcB: number) {
  return `${kind}:${crcA}:${crcB}`
}

export async function loadVerdicts(a: string, b: string): Promise<Map<string, boolean>> {
  try {
    const dir = await getDirectory(DIR)
    const handle = await dir.getFileHandle(fileName(a, b))
    const data = JSON.parse(await (await handle.getFile()).text())
    return new Map(Object.entries(data))
  } catch {
    return new Map()
  }
}

export async function saveVerdicts(a: string, b: string, verdicts: Map<string, boolean>): Promise<void> {
  try {
    const dir = await getDirectory(DIR)
    const handle = await dir.getFileHandle(fileName(a, b), { create: true })
    const writable = await handle.createWritable()
    await writable.write(JSON.stringify(Object.fromEntries(verdicts)))
    await writable.close()
  } catch {
    return
  }
}

export function clearVerdictCache(): Promise<void> {
  return clearDirectory(DIR)
}
