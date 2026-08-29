import TextView from '@/components/TextView.vue'
import { registerViewer } from './registry'
import MarkChanges from '@/components/MarkChanges.vue'
import { DeltaTrackState } from '@/delta_providers/states'

type DeprecatedLang = { removed?: string[], renamed?: Record<string, string> }

registerViewer('deprecated_lang', {
  test(_dr, track) {
    return /assets\/[^\/]+\/lang\/deprecated.json$/.test(track.id)
  },
  async render(dr, track) {
    function viewer(orig: DeprecatedLang, mod: DeprecatedLang) {
      const removed_changes = {
        added: [] as string[],
        removed: [] as string[],
      }
      for (const s of orig.removed ?? []) {
        if (!mod.removed?.includes(s)) {
          removed_changes.removed.push(s)
        }
      }
      for (const s of mod.removed ?? []) {
        if (!orig.removed?.includes(s)) {
          removed_changes.added.push(s)
        }
      }
      const renamed_changes = {
        added: [] as [string, string][],
        edited: [] as [string, string, string][],
        removed: [] as [string, string][],
      }
      for (const [ k, v ] of Object.entries(orig.renamed ?? {})) {
        if (!mod.renamed || !(k in mod.renamed)) {
          renamed_changes.removed.push([k, v])
        } else if (v !== mod.renamed[k]) {
          renamed_changes.edited.push([k, v, mod.renamed[k]])
        }
      }
      for (const [ k, v ] of Object.entries(mod.renamed ?? {})) {
        if (!orig.renamed || !(k in orig.renamed)) {
          renamed_changes.added.push([k, v])
        }
      }
      return <>
        {removed_changes.added.length > 0 ? <>
          <h3 style='margin-left: 12px;'>New Deprecations</h3>
          <div class='grid-table' style="grid-template-columns: 1fr; font-weight: 500;">
            <div class='grid-table-row grid-table-header'>
              <div style='padding-left: 12px;'>Key</div>
            </div>
            {removed_changes.added.map(s => <div class='grid-table-row'>
              <div style='padding-left: 12px;'><code>{ s }</code></div>
            </div>)}
          </div>
        </> : ''}
        {removed_changes.removed.length > 0 ? <>
          <h3 style='margin-left: 12px;'>Removed Deprecations</h3>
          <div class='grid-table' style="grid-template-columns: 1fr; font-weight: 500;">
            <div class='grid-table-row grid-table-header'>
              <div style='padding-left: 12px;'>Key</div>
            </div>
            {removed_changes.removed.map(s => <div class='grid-table-row'>
              <div style='padding-left: 12px;'><code>{ s }</code></div>
            </div>)}
          </div>
        </> : ''}
        {renamed_changes.added.length > 0 ? <>
          <h3 style='margin-left: 12px;'>New Auto-Renames</h3>
          <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
            <div class='grid-table-row grid-table-header'>
              <div style='padding-left: 12px;'>Deprecated Key</div>
              <div style='padding-right: 12px;'>New Key</div>
            </div>
            {renamed_changes.added.map(([k, v]) => <div class='grid-table-row'>
              <div style='padding-left: 12px;'><code>{ k }</code></div>
              <div style='padding-right: 12px;'><code>{ v }</code></div>
            </div>)}
          </div>
        </> : ''}
        {renamed_changes.edited.length > 0 ? <>
          <h3 style='margin-left: 12px;'>Updated Auto-Renames</h3>
          <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
            <div class='grid-table-row grid-table-header'>
              <div style='padding-left: 12px;'>Deprecated Key</div>
              <div style='padding-right: 12px;'>New Key</div>
            </div>
            {renamed_changes.edited.map(([k, o, m]) => <div class='grid-table-row'>
              <div style='padding-left: 12px;'><code>{ k }</code></div>
              <div style='padding-right: 12px; margin: 4px 0;'><MarkChanges original={o} modified={m} code/></div>
            </div>)}
          </div>
        </> : ''}
        {renamed_changes.removed.length > 0 ? <>
          <h3 style='margin-left: 12px;'>Removed Auto-Renames</h3>
          <div class='grid-table' style="grid-template-columns: auto 1fr; font-weight: 500;">
            <div class='grid-table-row grid-table-header'>
              <div style='padding-left: 12px;'>Deprecated Key</div>
              <div style='padding-right: 12px;'>New Key</div>
            </div>
            {renamed_changes.removed.map(([k, v]) => <div class='grid-table-row'>
              <div style='padding-left: 12px;'><code>{ k }</code></div>
              <div style='padding-right: 12px;'><code>{ v }</code></div>
            </div>)}
          </div>
        </> : ''}
      </>
    }
    const td = new TextDecoder()
    switch (track.state) {
      case DeltaTrackState.Edited: {
        const [ orig, mod ]: [
          DeprecatedLang,
          DeprecatedLang,
        ] = await Promise.all([
          dr.getEntry(dr.a, track.a).then(bytes => JSON.parse(td.decode(bytes))),
          dr.getEntry(dr.b, track.b).then(bytes => JSON.parse(td.decode(bytes))),
        ])
        return viewer(orig, mod)
      }
      case DeltaTrackState.Added: return viewer({}, await dr.getEntry(dr.b, track.b).then(bytes => JSON.parse(td.decode(bytes))))
      case DeltaTrackState.Removed: return viewer(await dr.getEntry(dr.a, track.a).then(bytes => JSON.parse(td.decode(bytes))), {})
      case DeltaTrackState.Moved: return <TextView
        text={td.decode(await dr.getEntry(dr.b, track.b))}
        path={track.id}
      ></TextView>
    }
  },
})
