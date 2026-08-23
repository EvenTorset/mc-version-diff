import { registerDeltaProvider } from '@/delta_providers/registry'
import { getTrackCategory } from '@/delta_providers/category'
import type { DeltaProvider, DeltaResult, DeltaTrack } from '@/delta_providers'
import { useRoute } from 'vue-router'
import { getVersionDetails, loadMCJEManifest, usesLegacyAssets } from '@/delta_providers/mcje/version_manifest'
import { getCachedFile } from '@/util/download'
import zip, { type ParsedZIPFileEntry } from '@/util/zip'
import type { RehashPayloadItem, RehashWorkerMessage } from '@/util/rehash.worker'
import RehashWorker from '@/util/rehash.worker?worker'
import { compareNbt, comparePng, HashEquivalence, terminateCmpWorkers } from '@/comparison'
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
import type { ProgressList } from '@/components/progressList.tsx'
import { DeltaTrackState } from '@/delta_providers/states'
import { header } from './header.tsx'

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

async function downloadJAR(id: string, progressDisplay: ProgressList, rehash: boolean) {
  const progressBar = createProgressBar(id)
  const progressBarId = progressDisplay.addItem(progressBar.render)

  progressBar.progHandler.setMessage('Fetching version details...')
  const details = await getVersionDetails(id, progressBar.progHandler)

  progressBar.progHandler.setMessage('Downloading JAR file...')
  const file = await getCachedFile(id, details.downloads.client.url, {
    extension: '.jar',
    dirName: 'mcje_cache',
    progHandler: progressBar.progHandler,
  })

  progressBar.progHandler.setMessage('Reading JAR file...')
  const legacy = usesLegacyAssets(details.releaseTime)
  const archive = zip.parse(
    await file.arrayBuffer(),
    filePath => !filePath.endsWith('.class') && (legacy
      ? !filePath.startsWith('META-INF/')
      : /(assets|data)\//.test(filePath))
  )
  const entries = Object.entries(archive.files)

  if (rehash) {
    progressBar.progHandler.setMessage('Calculating file hashes...')
    progressBar.progHandler.setUnit('file')
    const total = entries.length
    progressBar.progHandler.update(0, 0, total)

    const payload: RehashPayloadItem[] = entries.map(([key, e]) => ({
      key,
      compressedContent: e.compressedContent,
      compressionMethod: e.compressionMethod
    }))

    const hashResults = await runRehashWorker(payload, (count, total) => {
      progressBar.progHandler.update(count / total, count, total)
    })

    for (const [key, e] of entries) {
      if (hashResults[key] !== undefined) {
        e.crc32 = hashResults[key]
      }
    }
  }

  progressDisplay.removeItem(progressBarId)
  return {
    id: id,
    details,
    file: archive,
    entries: new Map(entries)
  }
}

const provider: DeltaProvider = {
  name: 'Java Edition',
  categories: [
    {
      name: 'Textures',
      sort: 0,
      expand: true,
      isImages: true,
      mimeType(_path) { return 'image/png' },
      test(_dr, track) {
        return track.id.endsWith('.png')
      }
    },
    {
      name: 'MCMETA',
      sort: 1,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return track.id.endsWith('.mcmeta')
      }
    },
    {
      name: 'Models',
      sort: 2,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/models\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Block states',
      sort: 3,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/blockstates\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Items',
      sort: 4,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/items\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Localization',
      sort: 5,
      expand: true,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/lang\/.+\.json$/.test(track.id) || /^lang\/.+\.lang$/.test(track.id)
      }
    },
    {
      name: 'Shaders',
      sort: 6,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/(?:post_effect\/.+\.json|shaders\/.+\.(?:glsl|fsh|vsh))$/.test(track.id)
      }
    },
    {
      name: 'Particles',
      sort: 7,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /assets\/[^\/]+\/particles\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Advancements',
      sort: 8,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /data\/[^\/]+\/advancement\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Loot tables',
      sort: 9,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /data\/[^\/]+\/loot_table\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Recipes',
      sort: 10,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /data\/[^\/]+\/recipe\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Tags',
      sort: 11,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /data\/[^\/]+\/tags\/.+\.json$/.test(track.id)
      }
    },
    {
      name: 'Structures',
      sort: 12,
      test(_dr, track) {
        return /data\/[^\/]+\/structure\/.+\.nbt$/.test(track.id)
      }
    },
    {
      name: 'World generation',
      sort: 13,
      mimeType(_path) { return 'text/plain' },
      test(_dr, track) {
        return /data\/[^\/]+\/worldgen\/.+\.json$/.test(track.id)
      }
    },
  ],
  async compare(a, b, progressDisplay): Promise<DeltaResult> {
    const rehash = useRoute().query.rehash === 'true'

    const [jarA, jarB] = await Promise.all([
      downloadJAR(a, progressDisplay, rehash),
      downloadJAR(b, progressDisplay, rehash),
    ])

    const hashEquivalence = new HashEquivalence()

    {
      const progressBar = createProgressBar(`${a} → ${b}`)
      const progressBarId = progressDisplay.addItem(progressBar.render)
      progressBar.progHandler.setMessage('Comparing modified files...')
      progressBar.progHandler.setUnit('file')

      const candidates: Array<{
        kind: 'png' | 'nbt'
        entryA: ParsedZIPFileEntry
        entryB: ParsedZIPFileEntry
      }> = []

      for (const [path, entryB] of jarB.entries) {
        if (!path.endsWith('.png') && !path.endsWith('.nbt')) continue
        const entryA = jarA.entries.get(path)
        if (!entryA) continue

        if (entryA.crc32 !== entryB.crc32) {
          candidates.push({
            kind: path.endsWith('.png') ? 'png' : 'nbt',
            entryA,
            entryB,
          })
        }
      }

      let count = 0
      const total = candidates.length
      progressBar.progHandler.update(0, 0, total)

      if (total > 0) {
        await Promise.all(
          candidates.map(async candidate => {
            let equal = false
            if (candidate.kind === 'nbt') {
              equal = await compareNbt(
                { compressedContent: candidate.entryA.compressedContent, compressionMethod: candidate.entryA.compressionMethod },
                { compressedContent: candidate.entryB.compressedContent, compressionMethod: candidate.entryB.compressionMethod }
              )
            } else {
              equal = await comparePng(
                { compressedContent: candidate.entryA.compressedContent, compressionMethod: candidate.entryA.compressionMethod },
                { compressedContent: candidate.entryB.compressedContent, compressionMethod: candidate.entryB.compressionMethod }
              )
            }

            if (equal) {
              hashEquivalence.markEquivalent(candidate.entryA.crc32, candidate.entryB.crc32)
            }

            count++
            progressBar.progHandler.update(count / total, count, total)
          })
        )
      }

      terminateCmpWorkers()
      progressDisplay.removeItem(progressBarId)
    }

    const tracks: DeltaTrack[] = []

    const missingFromA: Array<{ path: string; entry: ParsedZIPFileEntry }> = []
    const unmatchedNewInB: Array<{ path: string; entry: ParsedZIPFileEntry }> = []

    for (const [path, entryA] of jarA.entries) {
      if (!jarB.entries.has(path)) {
        missingFromA.push({ path, entry: entryA })
      }
    }

    for (const [path, entryB] of jarB.entries) {
      const entryA = jarA.entries.get(path)
      if (entryA) {
        if (entryA.crc32 !== entryB.crc32 && !hashEquivalence.areEquivalent(entryA.crc32, entryB.crc32)) {
          tracks.push({
            id: path,
            state: DeltaTrackState.Edited,
            a: path,
            b: path,
          })
        }
      } else {
        unmatchedNewInB.push({ path, entry: entryB })
      }
    }

    const matchedFromA = new Set<string>()
    const matchedNewInB = new Set<string>()

    for (const newFile of unmatchedNewInB) {
      const newExt = getFileExt(newFile.path)

      for (const oldFile of missingFromA) {
        if (matchedFromA.has(oldFile.path)) continue
        if (getFileExt(oldFile.path) !== newExt) continue

        if (
          oldFile.entry.crc32 === newFile.entry.crc32 ||
          hashEquivalence.areEquivalent(oldFile.entry.crc32, newFile.entry.crc32)
        ) {
          tracks.push({
            id: newFile.path,
            state: DeltaTrackState.Moved,
            a: oldFile.path,
            b: newFile.path,
          })
          matchedFromA.add(oldFile.path)
          matchedNewInB.add(newFile.path)
          break
        }
      }
    }

    for (const newFile of unmatchedNewInB) {
      if (!matchedNewInB.has(newFile.path)) {
        tracks.push({
          id: newFile.path,
          state: DeltaTrackState.Added,
          a: '',
          b: newFile.path,
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
        })
      }
    }

    const sortKey = (t: DeltaTrack) => `${t.state}|${t.id}`
    tracks.sort((x, y) => naturalCompare(sortKey(x), sortKey(y)))

    return {
      a,
      b,
      tracks,
      async getEntry(versionId: string, path: string | null) {
        if (!path) return Promise.reject('[MCJE getEntry] No path')

        const entries = versionId === a ? jarA.entries : versionId === b ? jarB.entries : null
        if (!entries) return Promise.reject(`[MCJE getEntry] Invalid version ID: ${versionId}`)

        const entry = entries.get(path)
        return entry?.content ?? Promise.reject(`[MCJE getEntry] File not found: ${path}`)
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
  async header(a, b) {
    return header(a, b, true)
  },
  selector: () => defineAsyncComponent(() => import('./MCJESelector.vue')),
}
registerDeltaProvider('mcje', provider)

loadMCJEManifest()?.catch(() => {})
