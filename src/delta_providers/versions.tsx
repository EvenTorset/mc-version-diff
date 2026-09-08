import type { DeltaProvider, DeltaProviderCategory, DeltaResult, DeltaTrack } from '@/delta_providers'
import { getTrackCategory } from '@/delta_providers/category'
import { DeltaTrackState } from '@/delta_providers/states'
import { readZip, type RawBytes } from 'minecraft-asset-loader'
import type { RehashPayloadItem, RehashWorkerMessage } from '@/util/rehash.worker'
import RehashWorker from '@/util/rehash.worker?worker'
import { compareJson, compareNbt, comparePng, compareStructure, HashEquivalence, terminateCmpWorkers } from '@/comparison'
import { loadVerdicts, saveVerdicts, verdictKey } from '@/comparison/verdictCache'
import getFileExt from '@/util/getFileExt'
import { ProgressHandler } from '@/util/progress'
import { h, ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import Row from '@/components/Row.vue'
import Dim from '@/components/Dim.vue'
import Spacer from '@/components/Spacer.vue'
import { formatBytes } from '@/util/bytes.ts'
import { getCSSVar } from '@/util/getCSSVar'
import { NProgress } from 'naive-ui'
import type { Renderable } from '@/types'
import { naturalCompare } from '@/util/sort'
import { parseTag, TAG_PATH, tagsEquivalent } from '@/util/tag'
import type { ProgressList } from '@/components/progressList.tsx'
import { findVersion } from './manifest'
import type { Edition } from '@/components/versions/edition'
import VersionSelector from '@/components/versions/VersionSelector.vue'
import VersionOverview from '@/components/versions/VersionOverview.vue'
import VersionPicker from '@/components/versions/VersionPicker.vue'

export type VersionEntry = {
  path: string
  size: number
  crc: number
  read(): Promise<Uint8Array>
  raw(): Promise<RawBytes>
}

export type VersionContent = {
  id: string
  entries: Map<string, VersionEntry>
}

function runRehashWorker(
  items: RehashPayloadItem[],
  onProgress: (count: number, total: number) => void
): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    const worker = new RehashWorker()

    worker.onmessage = (event: MessageEvent<RehashWorkerMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress(msg.count, msg.total)
      } else if (msg.type === 'result') {
        worker.terminate()
        resolve(msg.results)
      }
    }

    worker.onerror = err => {
      worker.terminate()
      reject(err)
    }

    worker.postMessage(items)
  })
}

export function createProgressBar(title: string) {
  const obj: any = {
    message: ref(''),
    ratio: ref(0),
    current: ref(0),
    total: ref(0),
    unit: ref(''),
  }
  obj.render = (function(this: {
    message: Ref<string>
    ratio: Ref<number>
    current: Ref<number>
    total: Ref<number>
    unit: Ref<string>
  }) {
    return <div>
      <Row style={{ fontWeight: 500 }}>
        { title }{ this.message.value ? <Dim>- { this.message.value }</Dim> : '' }
        <Spacer />
        { this.unit.value === 'byte'
          ? <>{ formatBytes(this.current.value) } / { formatBytes(this.total.value) }</>
          : <>{ this.current.value } / { this.total.value }</>
        }
      </Row>
      <NProgress
        processing={ this.ratio.value < 1 }
        color={ getCSSVar('--color-accent') }
        type="line" percentage={ this.ratio.value * 100 }
        show-indicator={ false }
      />
    </div>
  }).bind(obj)
  obj.progHandler = new ProgressHandler(p => {
    obj.message.value = p.message
    obj.ratio.value = p.ratio
    obj.current.value = p.current
    obj.total.value = p.total
    obj.unit.value = p.unit
  })
  return obj as {
    message: Ref<string>
    ratio: Ref<number>
    current: Ref<number>
    total: Ref<number>
    unit: Ref<string>
    progHandler: ProgressHandler
    render: Renderable
  }
}

type ProgressBar = ReturnType<typeof createProgressBar>

async function loadContent(
  edition: Edition,
  id: string,
  progressDisplay: ProgressList,
  rehash: boolean,
  list: (progressBar: ProgressBar) => Promise<VersionEntry[]>,
): Promise<VersionContent> {
  const progressBar = createProgressBar(id)
  const progressBarId = progressDisplay.addItem(progressBar.render)

  const entries = new Map((await list(progressBar)).map(file => [file.path, file]))

  if (rehash) {
    progressBar.progHandler.setMessage('Calculating file hashes...')
    progressBar.progHandler.setUnit('file')
    const total = entries.size
    progressBar.progHandler.update(0, 0, total)

    const payload: RehashPayloadItem[] = await Promise.all(Array.from(entries.values(), async e => {
      const { bytes, compression } = await e.raw()
      return { key: e.path, bytes, compression }
    }))

    const hashResults = await runRehashWorker(payload, (count, total) => {
      progressBar.progHandler.update(count / total, count, total)
    })

    for (const [key, e] of entries) {
      if (hashResults[key] !== undefined) e.crc = hashResults[key]
    }
  }

  progressDisplay.removeItem(progressBarId)
  const content = { id, entries }
  await edition.afterLoad?.(content)
  return content
}

export function loadVersion(edition: Edition, id: string, progressDisplay: ProgressList, rehash = false) {
  return loadContent(edition, id, progressDisplay, rehash, async progressBar => {
    const version = await findVersion(edition.assets, id)
    if (!version) throw new Error(`Unknown version "${id}"`)

    progressBar.progHandler.setMessage('Downloading...')
    progressBar.progHandler.setUnit('byte')
    await version.loadJar({
      onProgress: (done, total) => progressBar.progHandler.update(total ? done / total : 0, done, total ?? 0),
    })

    progressBar.progHandler.setMessage('Reading...')
    return await version.list() as VersionEntry[]
  })
}

function uploadFilter(legacy: boolean) {
  return (path: string) => !path.endsWith('.class') && (
    legacy
      ? !path.startsWith('META-INF/')
      : !path.includes('/') || /(assets|data)[/]/.test(path)
  )
}

export function readUpload(edition: Edition, name: string, bytes: Uint8Array<ArrayBuffer>, legacy: boolean, progressDisplay: ProgressList, rehash = false) {
  return loadContent(edition, name, progressDisplay, rehash, async progressBar => {
    progressBar.progHandler.setMessage('Reading file...')
    const keep = uploadFilter(legacy)
    return readZip(bytes).filter(e => keep(e.path))
  })
}

const decoder = new TextDecoder()

const STRUCTURE_PATH = /(assets|data)\/[^\/]+\/structures?\/.+\.nbt$/
const JSON_PATH = /\.(json|mcmeta)$/

export async function buildDelta(
  provider: DeltaProvider<VersionContent>,
  a: string,
  b: string,
  jarA: VersionContent,
  jarB: VersionContent,
  progressDisplay: ProgressList,
): Promise<DeltaResult> {
  const hashEquivalence = new HashEquivalence()

  {
    const progressBar = createProgressBar(`${a} → ${b}`)
    const progressBarId = progressDisplay.addItem(progressBar.render)
    progressBar.progHandler.setMessage('Comparing modified files...')
    progressBar.progHandler.setUnit('file')

    const candidates: Array<{
      kind: 'png' | 'nbt' | 'structure' | 'json'
      entryA: VersionEntry
      entryB: VersionEntry
    }> = []

    for (const [path, entryB] of jarB.entries) {
      if (!path.endsWith('.png') && !path.endsWith('.nbt') && !JSON_PATH.test(path)) continue
      const entryA = jarA.entries.get(path)
      if (!entryA) continue

      if (entryA.crc !== entryB.crc) {
        candidates.push({
          kind: path.endsWith('.png')
            ? 'png'
            : JSON_PATH.test(path)
              ? 'json'
              : STRUCTURE_PATH.test(path) ? 'structure' : 'nbt',
          entryA,
          entryB,
        })
      }
    }

    const verdicts = await loadVerdicts(a, b)
    const misses = candidates.filter(candidate => {
      const cached = verdicts.get(verdictKey(candidate.kind, candidate.entryA.crc, candidate.entryB.crc))
      if (cached) hashEquivalence.markEquivalent(candidate.entryA.crc, candidate.entryB.crc)
      return cached === undefined
    })

    let count = 0
    const total = misses.length
    progressBar.progHandler.update(0, 0, total)

    if (total > 0) {
      await Promise.all(
        misses.map(async candidate => {
          const [ rawA, rawB ] = await Promise.all([ candidate.entryA.raw(), candidate.entryB.raw() ])
          const compare = { json: compareJson, structure: compareStructure, nbt: compareNbt, png: comparePng }[candidate.kind]
          const equal = await compare(rawA, rawB)

          verdicts.set(verdictKey(candidate.kind, candidate.entryA.crc, candidate.entryB.crc), equal)
          if (equal) {
            hashEquivalence.markEquivalent(candidate.entryA.crc, candidate.entryB.crc)
          }

          count++
          progressBar.progHandler.update(count / total, count, total)
        })
      )
      saveVerdicts(a, b, verdicts)
    }

    terminateCmpWorkers()
    progressDisplay.removeItem(progressBarId)
  }

  {
    const tags: Array<[ VersionEntry, VersionEntry ]> = []
    for (const [ path, entryB ] of jarB.entries) {
      if (!TAG_PATH.test(path)) continue
      const entryA = jarA.entries.get(path)
      if (entryA && entryA.crc !== entryB.crc) tags.push([ entryA, entryB ])
    }

    await Promise.all(tags.map(async ([ entryA, entryB ]) => {
      try {
        const [ tagA, tagB ] = await Promise.all([
          entryA.read().then(b => parseTag(decoder.decode(b))),
          entryB.read().then(b => parseTag(decoder.decode(b))),
        ])
        if (tagsEquivalent(tagA, tagB)) hashEquivalence.markEquivalent(entryA.crc, entryB.crc)
      } catch {}
    }))
  }

  const tracks: DeltaTrack[] = []

  const missingFromA: Array<{ path: string; entry: VersionEntry }> = []
  const unmatchedNewInB: Array<{ path: string; entry: VersionEntry }> = []

  for (const [path, entryA] of jarA.entries) {
    if (!jarB.entries.has(path)) {
      missingFromA.push({ path, entry: entryA })
    }
  }

  for (const [path, entryB] of jarB.entries) {
    const entryA = jarA.entries.get(path)
    if (entryA) {
      if (entryA.crc !== entryB.crc && !hashEquivalence.areEquivalent(entryA.crc, entryB.crc)) {
        tracks.push({
          id: path,
          state: DeltaTrackState.Edited,
          a: path,
          b: path,
          sizeDiff: entryB.size - entryA.size,
          absSizeDiff: Math.abs(entryB.size - entryA.size),
        })
      }
    } else {
      unmatchedNewInB.push({ path, entry: entryB })
    }
  }

  const matchedFromA = new Set<string>()
  const matchedNewInB = new Set<string>()

  type RemovedFile = { index: number, path: string, ext: string }
  const removedByHash = new Map<number, RemovedFile[]>()
  for (const [ i, { path, entry } ] of missingFromA.entries()) {
    let list = removedByHash.get(entry.crc)
    if (!list) removedByHash.set(entry.crc, list = [])
    list.push({ index: i, path, ext: getFileExt(path) })
  }

  for (const newFile of unmatchedNewInB) {
    const newExt = getFileExt(newFile.path)

    let match: RemovedFile | null = null
    for (const hash of hashEquivalence.group(newFile.entry.crc)) {
      for (const oldFile of removedByHash.get(hash) ?? []) {
        if (oldFile.ext !== newExt || matchedFromA.has(oldFile.path)) continue
        if (!match || oldFile.index < match.index) match = oldFile
        break
      }
    }

    if (match) {
      tracks.push({
        id: newFile.path,
        state: DeltaTrackState.Moved,
        a: match.path,
        b: newFile.path,
        sizeDiff: 0,
        absSizeDiff: 0,
      })
      matchedFromA.add(match.path)
      matchedNewInB.add(newFile.path)
    }
  }

  for (const newFile of unmatchedNewInB) {
    if (!matchedNewInB.has(newFile.path)) {
      tracks.push({
        id: newFile.path,
        state: DeltaTrackState.Added,
        a: '',
        b: newFile.path,
        sizeDiff: newFile.entry.size,
        absSizeDiff: newFile.entry.size,
      })
    }
  }

  for (const oldFile of missingFromA) {
    if (!matchedFromA.has(oldFile.path)) {
      tracks.push({
        id: oldFile.path,
        state: DeltaTrackState.Removed,
        a: oldFile.path,
        b: '',
        sizeDiff: -oldFile.entry.size,
        absSizeDiff: oldFile.entry.size,
      })
    }
  }

  tracks.sort((x, y) => x.state - y.state || naturalCompare(x.id, y.id))

  return {
    a,
    b,
    tracks,
    async getEntry(versionId: string, path: string | null) {
      if (!path) return Promise.reject('[MCJE getEntry] No path')

      const entries = versionId === a ? jarA.entries : versionId === b ? jarB.entries : null
      if (!entries) return Promise.reject(`[MCJE getEntry] Invalid version ID: ${versionId}`)

      const entry = entries.get(path)
      if (!entry) return Promise.reject(`[MCJE getEntry] File not found: ${path}`)
      return entry.read() as Promise<Uint8Array<ArrayBuffer>>
    },
    getCategory(track) {
      return getTrackCategory(provider, this, track)
    },
    listEntries(versionId, path) {
      const jar = versionId === a ? jarA : jarB
      const entries: Set<string> = new Set()
      for (const k of jar.entries.keys()) {
        if (k.startsWith(path) && path.length < k.length && k[path.length] === '/') {
          const tail = k.slice(path.length + 1)
          const segmentLength = tail.indexOf('/')
          entries.add(segmentLength > 0 ? tail.slice(0, segmentLength) : tail)
        }
      }
      return Promise.resolve(Array.from(entries))
    },
  } as DeltaResult

}

type EditionProviderOptions = {
  categories: DeltaProviderCategory[]
  upload?: Pick<NonNullable<DeltaProvider<VersionContent>['upload']>, 'accept' | 'options'>
}

export function editionProvider(edition: Edition, { categories, upload }: EditionProviderOptions): DeltaProvider<VersionContent> {
  const provider: DeltaProvider<VersionContent> = {
    name: edition.name,
    categories,
    upload: upload && {
      ...upload,
      versionPicker: () => (props: any) => h(VersionPicker, { edition, ...props }),
      async defaultVersion() {
        return (await edition.assets.manifest.version('release'))?.id ?? ''
      },
      load(source, progressDisplay) {
        const params = new URL(location.href).searchParams
        const rehash = params.get('rehash') === 'true'
        const legacy = params.get('legacy') === 'true'
        return 'version' in source
          ? loadVersion(edition, source.version, progressDisplay, rehash)
          : readUpload(edition, source.name, source.content, legacy, progressDisplay, rehash)
      },
    },
    selector: () => () => <VersionSelector edition={edition} />,
    overview: dr => <VersionOverview edition={edition} dr={dr} />,
    async fetch(a, b, progressDisplay) {
      const rehash = useRoute().query.rehash === 'true'
      const [ contentA, contentB ] = await Promise.all([
        loadVersion(edition, a, progressDisplay, rehash),
        loadVersion(edition, b, progressDisplay, rehash),
      ])
      return { contentA, contentB }
    },
    compare(a, b, contentA, contentB, progressDisplay) {
      return buildDelta(provider, a, b, contentA, contentB, progressDisplay)
    },
  }
  return provider
}
