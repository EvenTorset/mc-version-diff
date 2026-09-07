import { registerDeltaProvider } from '@/delta_providers/registry'
import { getTrackCategory } from '@/delta_providers/category'
import type { DeltaProvider, DeltaResult, DeltaTrack } from '@/delta_providers'
import { useRoute } from 'vue-router'
import { getVersion, getVersionList, loadMCJEManifest, type MCJEVersionDetails } from '@/delta_providers/mcje/version_manifest'
import { readZip, type RawBytes } from 'minecraft-asset-loader'
import type { RehashPayloadItem, RehashWorkerMessage } from '@/util/rehash.worker'
import RehashWorker from '@/util/rehash.worker?worker'
import { compareJson, compareNbt, comparePng, compareStructure, HashEquivalence, terminateCmpWorkers } from '@/comparison'
import { loadVerdicts, saveVerdicts, verdictKey } from '@/comparison/verdictCache'
import getFileExt from '@/util/getFileExt'
import { ProgressHandler } from '@/util/progress'
import { defineAsyncComponent, ref, type Ref } from 'vue'
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
import { DeltaTrackState } from '@/delta_providers/states'
import { readPackFormats } from './pack_formats'
import MCJEOverview from './MCJEOverview.vue'

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

function createProgressBar(title: string) {
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

export type MCJEEntry = {
  path: string
  size: number
  crc: number
  read(): Promise<Uint8Array>
  raw(): Promise<RawBytes>
}

export type MCJEVersionContent = {
  id: string
  details: MCJEVersionDetails | null
  entries: Map<string, MCJEEntry>
}

function uploadFilter(legacy: boolean) {
  return (path: string) => !path.endsWith('.class') && (
    legacy
      ? !path.startsWith('META-INF/')
      : !path.includes('/') || /(assets|data)[/]/.test(path)
  )
}

async function getJAR(
  id: string,
  progressDisplay: ProgressList,
  rehash: boolean,
  content?: Uint8Array<ArrayBuffer>,
  legacy?: boolean,
): Promise<MCJEVersionContent> {
  const progressBar = createProgressBar(id)
  const progressBarId = progressDisplay.addItem(progressBar.render)

  let details: MCJEVersionDetails | null = null
  let files: { path: string, size: number, crc?: number, read(): Promise<Uint8Array>, raw(): Promise<RawBytes> }[]

  if (content) {
    progressBar.progHandler.setMessage('Reading file...')
    const keep = uploadFilter(!!legacy)
    files = readZip(content).filter(e => keep(e.path))
  } else {
    progressBar.progHandler.setMessage('Fetching version details...')
    const version = await getVersion(id)
    if (!version) throw new Error(`Unknown version "${id}"`)
    details = await version.details() as MCJEVersionDetails

    progressBar.progHandler.setMessage('Downloading JAR file...')
    progressBar.progHandler.setUnit('byte')
    await version.loadJar({
      onProgress: (done, total) => progressBar.progHandler.update(total ? done / total : 0, done, total),
    })

    progressBar.progHandler.setMessage('Reading JAR file...')
    files = await version.list()
  }

  const entries = new Map<string, MCJEEntry>()
  for (const file of files) {
    entries.set(file.path, {
      path: file.path,
      size: file.size,
      crc: file.crc ?? 0,
      read: () => file.read(),
      raw: () => file.raw(),
    })
  }
  await readPackFormats(id, entries)

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
  return { id, details, entries }
}

const decoder = new TextDecoder()

const STRUCTURE_PATH = /(assets|data)\/[^\/]+\/structures?\/.+\.nbt$/
const JSON_PATH = /\.(json|mcmeta)$/

const provider: DeltaProvider<MCJEVersionContent> = {
  name: 'Java Edition',
  upload: {
    accept: '.jar,.zip',
    options: [
      {
        label: 'Rehash',
        queryParam: 'rehash',
        type: 'bool',
        default: false,
        tooltip: () => <>
          <h3>Rehash</h3>
          <p>
            Recalculates file hashes before comparing.
          </p>
          <p><strong>When to use:</strong> If stored hashes are missing or corrupted, causing incorrect comparison results.</p>
          <p><strong>Downside:</strong> Significantly increases comparison time.</p>
        </>,
      },
      {
        label: 'Legacy assets',
        queryParam: 'legacy',
        type: 'bool',
        default: false,
        tooltip: () => <>
          <h3>Legacy assets</h3>
          <p>
            Use the pre-1.6 file structure.
          </p>
        </>,
      },
    ],
    versionPicker: () => defineAsyncComponent(() => import('./MCJEVersionPicker.vue')),
    async defaultVersion() {
      await loadMCJEManifest()
      return getVersionList().find(v => v.type === 'release')?.id ?? ''
    },
    load(source, progressDisplay) {
      const loc = new URL(location.href)
      const rehash = loc.searchParams.get('rehash') === 'true'
      const legacy = loc.searchParams.get('legacy') === 'true'
      return 'version' in source
        ? getJAR(source.version, progressDisplay, rehash)
        : getJAR(source.name, progressDisplay, rehash, source.content, legacy)
    },
  },
  categories: [
    {
      name: 'Textures',
      sort: 0,
      expand: true,
      isImages: true,
      test(_dr, track) {
        return track.id.endsWith('.png')
      }
    },
    {
      name: 'MCMETA',
      sort: 1,
      test(_dr, track) {
        return track.id.endsWith('.mcmeta')
      }
    },
    {
      name: 'Models',
      sort: 2,
      test(_dr, track) {
        return /assets\/[^\/]+\/models\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Block states',
      sort: 3,
      test(_dr, track) {
        return /assets\/[^\/]+\/blockstates\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Items',
      sort: 4,
      test(_dr, track) {
        return /assets\/[^\/]+\/items\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 5,
      expand: true,
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.(json|lang)$/.test(track.id) || /^lang\/.+\.lang$/.test(track.id)
      }
    },
    {
      name: 'Shaders',
      sort: 6,
      test(_dr, track) {
        return /assets\/[^\/]+\/(?:shaders|post_effect)\/.+\.(?:glsl|fsh|vsh|json)$/.test(track.id)
      }
    },
    {
      name: 'Particles',
      sort: 7,
      test(_dr, track) {
        return /assets\/[^\/]+\/particles\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Advancements',
      sort: 8,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/advancements?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Loot tables',
      sort: 9,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/loot_tables?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Recipes',
      sort: 10,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/recipes?\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Tags',
      sort: 11,
      test(_dr, track) {
        return /data\/[^\/]+\/tags\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Structures',
      sort: 12,
      test(_dr, track) {
        return /(assets|data)\/[^\/]+\/structures?\/.+\.nbt$/.test(track.id)
      }
    },
    {
      name: 'World generation',
      sort: 13,
      test(_dr, track) {
        return /data\/.+\/worldgen\/.+\.json$/.test(track.id)
      }
    },
  ],
  async fetch(a, b, progressDisplay) {
    const rehash = useRoute().query.rehash === 'true'
    const [jarA, jarB] = await Promise.all([
      getJAR(a, progressDisplay, rehash),
      getJAR(b, progressDisplay, rehash),
    ])
    return {
      contentA: jarA,
      contentB: jarB,
    }
  },
  async compare(a, b, jarA, jarB, progressDisplay) {
    const hashEquivalence = new HashEquivalence()

    {
      const progressBar = createProgressBar(`${a} → ${b}`)
      const progressBarId = progressDisplay.addItem(progressBar.render)
      progressBar.progHandler.setMessage('Comparing modified files...')
      progressBar.progHandler.setUnit('file')

      const candidates: Array<{
        kind: 'png' | 'nbt' | 'structure' | 'json'
        entryA: MCJEEntry
        entryB: MCJEEntry
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
      const tags: Array<[ MCJEEntry, MCJEEntry ]> = []
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

    const missingFromA: Array<{ path: string; entry: MCJEEntry }> = []
    const unmatchedNewInB: Array<{ path: string; entry: MCJEEntry }> = []

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
  },
  overview(dr) {
    return <MCJEOverview dr={dr} />
  },
  selector: () => defineAsyncComponent(() => import('./MCJESelector.vue')),
}
registerDeltaProvider('mcje', provider)

loadMCJEManifest()?.catch(() => {})
