import { h } from 'vue'
import { saveAs } from 'file-saver'
import { writeZip } from 'minecraft-asset-loader'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { errorMessage } from '@/util/errorMessage'
import { naturalCompare } from '@/util/sort'
import Notify from '@/notify'

export function downloadableTracks(tracks: DeltaTrack[]) {
  return tracks
    .filter(track => track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Edited)
    .sort((a, b) => naturalCompare(a.b, b.b))
}

function zipEntry(dr: DeltaResult, path: string) {
  const read = () => dr.getEntry(dr.b, path)
  const entry = dr.getStoredEntry?.(dr.b, path)
  if (!entry || typeof entry.crc !== 'number') return { path, read }
  return { path, read, crc: entry.crc, size: entry.size, raw: () => entry.raw() }
}

export async function downloadCategory(dr: DeltaResult, provider: string, category: string, tracks: DeltaTrack[]) {
  const files = downloadableTracks(tracks)
  if (files.length === 0) return;

  const notification = Notify.info({
    title: 'Packing files',
    content: progress(0),
    closable: false,
  })

  let shown = -1

  function progress(percent: number) {
    return h('div', { style: 'text-align: center;' }, `${percent}%`)
  }

  function show(done: number) {
    const percent = Math.floor(done / files.length * 100)
    if (percent === shown) return;
    shown = percent
    notification.content = progress(percent)
  }

  try {
    const bytes = await writeZip(files.map(track => zipEntry(dr, track.b)), { onProgress: show })
    const name = category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    saveAs(new Blob([bytes as BlobPart]), `${provider}-${dr.a}-${dr.b}-${name}.zip`)
    notification.close()
  } catch (err) {
    notification.close()
    Notify.error({
      title: 'Failed to pack files',
      content: errorMessage(err),
    })
  }
}
