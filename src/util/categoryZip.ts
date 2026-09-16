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

export async function downloadCategory(dr: DeltaResult, provider: string, category: string, tracks: DeltaTrack[]) {
  const files = downloadableTracks(tracks)
  if (files.length === 0) return;

  const total = files.length.toLocaleString()
  const progress = (done: number) => h('div', { style: 'text-align: center;' }, `${done.toLocaleString()} / ${total}`)

  const notification = Notify.info({
    title: 'Packing files',
    content: progress(0),
    closable: false,
  })

  let lastPercent = -1

  try {
    const bytes = await writeZip(files.map(track => ({
      path: track.b,
      read: () => dr.getEntry(dr.b, track.b),
    })), {
      concurrency: 64,
      onProgress: (done, count) => {
        const percent = Math.floor(done / count * 100)
        if (percent === lastPercent) return;
        lastPercent = percent
        notification.content = progress(done)
      },
    })

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
