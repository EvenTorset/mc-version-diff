import { registerViewer } from '@/viewers/registry'
import { DeltaTrackState } from '@/delta_providers/states'
import Waveform from './Waveform.vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers/index.ts'
import { basename } from '@/util/path.ts'
import { crc32 } from '@/util/zip'

let initPromise: Promise<typeof import('./wasm').convertFsb5> | null = null

type AudioSample = {
  name: string
  bytes: Uint8Array<ArrayBuffer>
}

async function getAudioSamples(
  dr: DeltaResult,
  track: DeltaTrack,
  version: 'a' | 'b'
): Promise<AudioSample[]> {
  const rawContent = await dr.getEntry(dr[version], track[version])
  if (track.id.endsWith('.fsb')) {
    const convertFsb5 = await (initPromise ??= (async () => {
      const wasm = await import('./wasm')
      await wasm.default()
      return wasm.convertFsb5
    })())
    return convertFsb5(rawContent)
  }
  return [
    {
      name: basename(track[version]),
      bytes: rawContent,
    }
  ]
}

function areBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

registerViewer('sound', {
  predictedHeight(track) {
    return track.state === DeltaTrackState.Edited ? 200 : 100
  },
  test(_dr, track) {
    return /\.(ogg|fsb)$/.test(track.id)
  },
  async render(dr, track) {
    switch (track.state) {
      case DeltaTrackState.Added:
      case DeltaTrackState.Moved: {
        const samples = await getAudioSamples(dr, track, 'b')
        if (track.id.endsWith('.ogg')) {
          return (
            <Waveform
              sources={[{
                id: 'b',
                name: samples[0].name,
                version: dr.b,
                bytes: samples[0].bytes,
                color: track.state === DeltaTrackState.Added ? '--color-success' : '--color-accent',
              }]}
            />
          )
        }
        return (
          <div class='viewer-diff-rows'>
            {samples.map(sample => (
              <div key={sample.name}>
                <Waveform
                  sources={[{
                    id: 'b',
                    name: sample.name,
                    version: dr.b,
                    bytes: sample.bytes,
                    color: track.state === DeltaTrackState.Added ? '--color-success' : '--color-accent',
                  }]}
                />
              </div>
            ))}
          </div>
        )
      }
      case DeltaTrackState.Removed: {
        const samples = await getAudioSamples(dr, track, 'a')
        if (track.id.endsWith('.ogg')) {
          return (
            <Waveform
              sources={[{
                id: 'a',
                name: samples[0].name,
                version: dr.a,
                bytes: samples[0].bytes,
                color: '--color-danger',
              }]}
            />
          )
        }
        return (
          <div class='viewer-diff-rows'>
            {samples.map(sample => (
              <div key={sample.name}>
                <Waveform
                  sources={[{
                    id: 'a',
                    name: sample.name,
                    version: dr.a,
                    bytes: sample.bytes,
                    color: '--color-danger',
                  }]}
                />
              </div>
            ))}
          </div>
        )
      }
      case DeltaTrackState.Edited: {
        const [samplesA, samplesB] = await Promise.all([
          getAudioSamples(dr, track, 'a'),
          getAudioSamples(dr, track, 'b'),
        ])

        if (track.id.endsWith('.ogg')) {
          return (
            <Waveform
              sources={[
                {
                  id: 'a',
                  name: samplesA[0].name,
                  version: dr.a,
                  bytes: samplesA[0].bytes,
                },
                {
                  id: 'b',
                  name: samplesB[0].name,
                  version: dr.b,
                  bytes: samplesB[0].bytes,
                },
              ]}
            />
          )
        }

        type SampleRow = {
          id: string
          sampleA?: AudioSample
          sampleB?: AudioSample
          state: 'added' | 'edited' | 'renamed' | 'removed' | 'unchanged'
        }

        const rows: SampleRow[] = []

        if (samplesA.length === 1 && samplesB.length === 1) {
          const sampleA = samplesA[0]
          const sampleB = samplesB[0]
          const bytesEqual = areBytesEqual(sampleA.bytes, sampleB.bytes)
          const namesEqual = sampleA.name === sampleB.name

          let state: 'added' | 'edited' | 'renamed' | 'removed' | 'unchanged'
          if (bytesEqual) {
            state = namesEqual ? 'unchanged' : 'renamed'
          } else {
            state = 'edited'
          }

          rows.push({
            id: sampleB.name,
            sampleA,
            sampleB,
            state,
          })
        } else {
          const mapA = new Map(samplesA.map(s => [s.name, s]))
          const mapB = new Map(samplesB.map(s => [s.name, s]))

          const unmatchedA: AudioSample[] = []
          const unmatchedB: AudioSample[] = []

          for (const sampleA of samplesA) {
            const sampleB = mapB.get(sampleA.name)
            if (sampleB) {
              const state = areBytesEqual(sampleA.bytes, sampleB.bytes) ? 'unchanged' : 'edited'
              rows.push({
                id: sampleA.name,
                sampleA,
                sampleB,
                state,
              })
            } else {
              unmatchedA.push(sampleA)
            }
          }

          for (const sampleB of samplesB) {
            if (!mapA.has(sampleB.name)) {
              unmatchedB.push(sampleB)
            }
          }

          const crcMapA = new Map<number, AudioSample[]>()
          for (const a of unmatchedA) {
            const hash = crc32(a.bytes)
            const list = crcMapA.get(hash) ?? []
            list.push(a)
            crcMapA.set(hash, list)
          }

          const remainingUnmatchedB: AudioSample[] = []

          for (const b of unmatchedB) {
            const hash = crc32(b.bytes)
            const candidates = crcMapA.get(hash)
            let matchedIndex = -1

            if (candidates) {
              matchedIndex = candidates.findIndex(a => areBytesEqual(a.bytes, b.bytes))
            }

            if (candidates && matchedIndex !== -1) {
              const matchedA = candidates.splice(matchedIndex, 1)[0]
              rows.push({
                id: `${matchedA.name}->${b.name}`,
                sampleA: matchedA,
                sampleB: b,
                state: 'renamed',
              })
            } else {
              remainingUnmatchedB.push(b)
            }
          }

          for (const candidates of crcMapA.values()) {
            for (const a of candidates) {
              rows.push({
                id: a.name,
                sampleA: a,
                state: 'removed',
              })
            }
          }

          for (const b of remainingUnmatchedB) {
            rows.push({
              id: b.name,
              sampleB: b,
              state: 'added',
            })
          }
        }

        const sections = [
          { title: 'New Samples', state: 'added' },
          { title: 'Edited Samples', state: 'edited' },
          { title: 'Renamed Samples', state: 'renamed' },
          { title: 'Removed Samples', state: 'removed' },
          { title: 'Unchanged Samples', state: 'unchanged' },
        ]

        return (
          <div class='viewer-diff-rows'>
            {sections
              .map(section => ({
                ...section,
                rows: rows.filter(r => r.state === section.state),
              }))
              .filter(section => section.rows.length > 0)
              .map(section => (
                <div key={section.state} class={`viewer-diff-section ${section.state}`}>
                  <h3>{section.title}</h3>
                  {section.rows.map(row => {
                    const sources = []
                    if (row.sampleA) {
                      sources.push({
                        id: 'a',
                        name: row.sampleA.name,
                        version: dr.a,
                        bytes: row.sampleA.bytes,
                        ...(row.state === 'removed' ? { color: '--color-danger' } : {}),
                      })
                    }
                    if (row.sampleB) {
                      sources.push({
                        id: 'b',
                        name: row.sampleB.name,
                        version: dr.b,
                        bytes: row.sampleB.bytes,
                        ...(row.state === 'added' ? { color: '--color-success' } : {}),
                      })
                    }

                    return <Waveform key={row.id} sources={sources} />
                  })}
                </div>
              ))}
          </div>
        )
      }
    }
  },
})
