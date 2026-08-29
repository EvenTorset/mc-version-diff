import { TextDiff, TextView } from '@/components/lazyText'
import { registerViewer } from './registry'
import { trackTab } from '@/util/trackFocus'
import { DeltaTrackState } from '@/delta_providers/states'
import { readNbt } from '@/util/nbt'
import stringify from 'fabulous-json'
import type { DeltaResult } from '@/delta_providers'
import StructureViewer from '@/components/StructureViewer.vue'
import { reactive, ref, Suspense, watch, type Component } from 'vue'
import { NCheckbox, NTab, NTabs } from 'naive-ui'
import Row from '@/components/Row.vue'
import type { CompareResult, CompareView } from '@/util/structureViewer'
import { asyncRenderable } from '@/util/asyncRenderable'
import Content from '@/components/Content.vue'

async function jsonNbt(dr: DeltaResult, version: string, path: string): Promise<string> {
  const nbt = await dr.getEntry(version, path)
  const json = await readNbt(nbt)
  return stringify(json, {
    replace(_key, value) {
      if (typeof value === 'bigint') {
        return `${value}n`
      }
      return value
    },
  })
}

registerViewer('mcje_structure', {
  test(_dr, track) {
    return track.id.endsWith('.nbt')
  },
  async render(dr, track) {
    const version = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const viewTabs: { name: string, tab: string, view?: CompareView }[] = version
      ? [{ name: '3d', tab: '3D View' }]
      : [
        { name: 'comparison', tab: 'Comparison', view: 'slide' },
        { name: 'before', tab: 'Before', view: 'before' },
        { name: 'after', tab: 'After', view: 'after' },
      ]

    const tab = trackTab(track.id, [ ...viewTabs.map(entry => entry.name), 'json' ], viewTabs[0].name)
    const view = ref<CompareView>('slide')
    const show = reactive({ added: true, changed: true, removed: true })
    const counts = ref<CompareResult['counts'] | null>(null)

    function view_3d() {
      return version
        ? <StructureViewer dr={dr} track={track} version={version} />
        : <StructureViewer
            dr={dr}
            track={track}
            show={show}
            view={view.value}
            onCounts={value => {
              counts.value = value
              show.added = value.added > 0
              show.changed = value.changed > 0
              show.removed = value.removed > 0
            }}
          />
    }

    function hasHighlights() {
      const value = counts.value
      return !!value && (value.added > 0 || value.changed > 0 || value.removed > 0)
    }

    function highlightToggle(key: 'added' | 'changed' | 'removed', label: string) {
      if (!counts.value?.[key]) return null
      return <NCheckbox
        size='small'
        checked={show[key]}
        onUpdateChecked={value => show[key] = value}
      >
        <span class='toggle-count'>{counts.value?.[key]}</span>
        {label}
      </NCheckbox>
    }
    async function view_json() {
      if (track.state === DeltaTrackState.Removed) {
        return <TextView
          text={await jsonNbt(dr, dr.a, track.a)}
          path={`${track.id}.json`}
        />
      }
      if (
        track.state === DeltaTrackState.Added
        || track.state === DeltaTrackState.Moved
      ) {
        return <TextView
          text={await jsonNbt(dr, dr.b, track.b)}
          path={`${track.id}.json`}
        />
      }
      return <TextDiff
        path={`${track.id}.json`}
        original={await jsonNbt(dr, dr.a, track.a)}
        modified={await jsonNbt(dr, dr.b, track.b)}
      />
    }

    let jsonView: Component | undefined
    const jsonSeen = ref(false)
    watch(tab, value => { if (value === 'json') jsonSeen.value = true }, { immediate: true })

    return () => <>
      <NTabs
        type='bar'
        class='pad-tab-buttons'
        size='small'
        value={tab.value}
        onUpdateValue={(value: string) => {
          tab.value = value
          const mode = viewTabs.find(entry => entry.name === value)?.view
          if (mode) view.value = mode
        }}
      >
        {{
          default: () => [
            ...viewTabs.map(entry => <NTab key={entry.name} name={entry.name} tab={entry.tab} />),
            <NTab name='json' tab='JSON' />,
          ],
          suffix: () => hasHighlights() && tab.value !== 'json' ? <Row class='tab-toggles' gap='12px'>
            {highlightToggle('added', 'Added')}
            {highlightToggle('changed', 'Changed')}
            {highlightToggle('removed', 'Removed')}
          </Row> : null,
        }}
      </NTabs>
      <div style={{ display: tab.value === 'json' ? 'none' : undefined }}>
        <Content content={view_3d}/>
      </div>
      {jsonSeen.value ? <div style={{ display: tab.value === 'json' ? undefined : 'none' }}>
        <Suspense>
          <Content content={jsonView ??= asyncRenderable(view_json())}/>
        </Suspense>
      </div> : null}
    </>
  },
})
