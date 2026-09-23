import { defineAsyncComponent } from 'vue'
import { getDeltaProvider, registerDeltaProvider } from '../registry.ts'
import { resolveStaticOrSync } from '@/util/resolveToStatic.ts'
import { readUserFile, writeUserFile } from '@/util/userFiles.ts'
import { selectedComparator } from './selectedComparator.ts'
import UploadOverview from './UploadOverview.vue'
import {
  readFilesMeta,
  writeFilesMeta,
  UPLOAD_VERSION_A_KEY,
  UPLOAD_VERSION_B_KEY,
  type FilesMeta,
} from './filesMeta.ts'
import { createProgressBar } from '@/delta_providers/versions'
import type { UploadSource } from '../index.ts'
import type { ProgressList } from '@/components/progressList.tsx'

const CORS_PROXY = 'https://cors.even-torset.workers.dev/'

type Slot = 'a' | 'b'

function slots(swap: string): [Slot, Slot] {
  return swap === 'swap' ? ['b', 'a'] : ['a', 'b']
}

function slotVersion(meta: FilesMeta | null, slot: Slot) {
  return slot === 'a' ? meta?.aVersion : undefined
}

function slotUrl(params: URLSearchParams, slot: Slot) {
  return params.get(slot === 'a' ? 'aUrl' : 'bUrl') || undefined
}

function slotFileKey(slot: Slot) {
  return slot === 'a' ? UPLOAD_VERSION_A_KEY : UPLOAD_VERSION_B_KEY
}

function slotCachedUrl(meta: FilesMeta, slot: Slot) {
  return slot === 'a' ? meta.aCachedUrl : meta.bCachedUrl
}

function setSlotCachedUrl(meta: FilesMeta, slot: Slot, url: string) {
  if (slot === 'a') meta.aCachedUrl = url
  else meta.bCachedUrl = url
}

function setSlotUrl(meta: FilesMeta, slot: Slot, url: string) {
  if (slot === 'a') meta.aUrl = url
  else meta.bUrl = url
}

function setSlotFileMeta(meta: FilesMeta, slot: Slot, name: string, size: number, folder: boolean) {
  if (slot === 'a') {
    meta.aName = name
    meta.aSize = size
    meta.aFolder = folder
  } else {
    meta.bName = name
    meta.bSize = size
    meta.bFolder = folder
  }
}

function filenameFromUrl(source: string) {
  try {
    const parsed = new URL(source)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    return last || parsed.hostname
  } catch {
    return source
  }
}

function sideName(meta: FilesMeta | null, slot: Slot, params: URLSearchParams) {
  const version = slotVersion(meta, slot)
  if (version) return version
  const name = slot === 'a' ? meta?.aName : meta?.bName
  if (name) return name
  const url = slotUrl(params, slot)
  if (url) return filenameFromUrl(url)
  return slot === 'a' ? 'Version A' : 'Version B'
}

async function fetchUrlContent(url: string, label: string, progressDisplay: ProgressList): Promise<Uint8Array<ArrayBuffer>> {
  const progressBar = createProgressBar(label)
  const progressBarId = progressDisplay.addItem(progressBar.render)
  try {
    progressBar.progHandler.setMessage('Downloading...')
    progressBar.progHandler.setUnit('byte')
    const response = await fetch(CORS_PROXY + url)
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
    const totalHeader = response.headers.get('content-length')
    const total = totalHeader ? Number(totalHeader) : 0
    if (!response.body) {
      const buffer = new Uint8Array(await response.arrayBuffer())
      progressBar.progHandler.update(1, buffer.byteLength, buffer.byteLength)
      return buffer
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      received += value.byteLength
      progressBar.progHandler.update(total ? received / total : 0, received, total)
    }
    const content = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      content.set(chunk, offset)
      offset += chunk.byteLength
    }
    return content
  } finally {
    progressDisplay.removeItem(progressBarId)
  }
}

async function sideSource(meta: FilesMeta, slot: Slot, other: Slot, params: URLSearchParams, progressDisplay: ProgressList): Promise<UploadSource> {
  const version = slotVersion(meta, slot)
  if (version) return { version }
  const url = slotUrl(params, slot)
  if (url) {
    if (slotCachedUrl(meta, slot) === url) {
      const cached = await readUserFile(slotFileKey(slot))
      if (cached) {
        return { name: sideName(meta, slot, params), content: new Uint8Array(await cached.arrayBuffer()), against: slotVersion(meta, other) }
      }
    }
    const content = await fetchUrlContent(url, sideName(meta, slot, params), progressDisplay)
    await writeUserFile(slotFileKey(slot), content.buffer)
    setSlotUrl(meta, slot, url)
    setSlotCachedUrl(meta, slot, url)
    setSlotFileMeta(meta, slot, filenameFromUrl(url), content.byteLength, false)
    writeFilesMeta(meta)
    return { name: sideName(meta, slot, params), content, against: slotVersion(meta, other) }
  }
  const file = await readUserFile(slotFileKey(slot))
  if (!file) throw new Error('Both sides need a file, URL, or a version to compare')
  return { name: sideName(meta, slot, params), content: new Uint8Array(await file.arrayBuffer()), against: slotVersion(meta, other) }
}

registerDeltaProvider('upload', {
  name: 'Upload',
  selector: () => defineAsyncComponent(() => import('./UploadSelector.vue')),
  overview(dr) {
    return <UploadOverview dr={dr} />
  },
  categories() {
    const provider = getDeltaProvider(selectedComparator.value)
    if (!provider) return []
    return resolveStaticOrSync(provider.categories)
  },
  async fetch(comparatorName, swap, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }
    selectedComparator.value = comparatorName

    const meta = readFilesMeta() ?? { provider: comparatorName }
    const params = new URL(location.href).searchParams
    const [ first, second ] = slots(swap)
    const [ sourceA, sourceB ] = await Promise.all([
      sideSource(meta, first, second, params, progressDisplay),
      sideSource(meta, second, first, params, progressDisplay),
    ])
    const [ contentA, contentB ] = await Promise.all([
      provider.upload.load(sourceA, progressDisplay),
      provider.upload.load(sourceB, progressDisplay),
    ])
    return { contentA, contentB }
  },
  compare(comparatorName, swap, contentA, contentB, progressDisplay) {
    const provider = getDeltaProvider(comparatorName)
    if (!provider?.upload) {
      throw new Error(`Invalid delta provider name: '${comparatorName}'`)
    }

    const meta = readFilesMeta()
    const params = new URL(location.href).searchParams
    const [ first, second ] = slots(swap)
    return provider.compare(
      sideName(meta, first, params),
      sideName(meta, second, params),
      contentA,
      contentB,
      progressDisplay
    )
  },
})
