import { TextDiff, TextView } from '@/components/lazyText'
import { DeltaTrackState } from '@/delta_providers/states'
import { Settings } from '@/settings'
import stringify from 'fabulous-json'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'

async function getJSON(dr: DeltaResult, version: string, path: string): Promise<string> {
  const text = new TextDecoder().decode(await dr.getEntry(version, path))
  if (!Settings.formatJSON) return text
  try {
    return stringify(JSON.parse(text))
  } catch {
    return text
  }
}

export async function renderJsonTab(dr: DeltaResult, track: DeltaTrack) {
  if (track.state === DeltaTrackState.Removed) {
    return <TextView
      text={await getJSON(dr, dr.a, track.a)}
      path={track.id}
    />
  }
  if (
    track.state === DeltaTrackState.Added
    || track.state === DeltaTrackState.Moved
  ) {
    return <TextView
      text={await getJSON(dr, dr.b, track.b)}
      path={track.id}
    />
  }
  return <TextDiff
    path={track.id}
    original={await getJSON(dr, dr.a, track.a)}
    modified={await getJSON(dr, dr.b, track.b)}
  />
}
