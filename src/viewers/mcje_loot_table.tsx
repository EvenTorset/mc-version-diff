import { TextDiff, TextView } from '@/components/lazyText'
import Content from '@/components/Content.vue'
import LootItems from '@/components/LootItems.vue'
import LootRules from '@/components/LootRules.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { Settings } from '@/settings'
import { deltaTableReader, describeTable, oddsChanged, sampleTableCached } from '@/util/loot'
import stringify from 'fabulous-json'
import { NCheckbox, NTab, NTabs } from 'naive-ui'
import { ref } from 'vue'
import { registerViewer } from './registry'
import { trackTab } from '@/util/trackFocus'

function getJSON(table: any, raw: string) {
  return Settings.formatJSON ? stringify(table) : raw
}

async function readBoth(dr: DeltaResult, version: string, path: string) {
  const raw = new TextDecoder().decode(await dr.getEntry(version, path))
  return { table: JSON.parse(raw), raw }
}

type Sides = { before: Awaited<ReturnType<typeof readBoth>> | null, after: Awaited<ReturnType<typeof readBoth>> | null }
const sidesCache = new WeakMap<object, Map<string, Promise<Sides>>>()

function readSides(dr: DeltaResult, track: { a: string, b: string }, single: 'a' | 'b' | null) {
  if (!sidesCache.has(dr)) sidesCache.set(dr, new Map())
  const cache = sidesCache.get(dr)!
  const key = `${track.a}|${track.b}`
  if (!cache.has(key)) {
    cache.set(key, (async () => ({
      before: single === 'b' ? null : await readBoth(dr, dr.a, track.a),
      after: single === 'a' ? null : await readBoth(dr, dr.b, track.b),
    }))())
  }
  return cache.get(key)!
}

async function initialTab(dr: DeltaResult, sides: Sides) {
  const { before, after } = sides
  if (!before || !after) return 'items'

  const [ a, b ] = await Promise.all([
    sampleTableCached(before.table, deltaTableReader(dr, dr.a)),
    sampleTableCached(after.table, deltaTableReader(dr, dr.b)),
  ])
  if (oddsChanged(a, b)) return 'items'

  const rulesChanged = JSON.stringify(describeTable(before.table)) !== JSON.stringify(describeTable(after.table))
  return rulesChanged ? 'rules' : 'json'
}

registerViewer('mcje_loot_table', {
  test(_dr, track) {
    return /(?:assets|data)\/[^\/]+\/loot_tables?\/.+\.json$/.test(track.id)
  },
  async render(dr, track) {
    const single = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const sides = await readSides(dr, track, single)
    const { before, after } = sides

    const beforeSide = before ? { version: dr.a, table: before.table } : undefined
    const afterSide = after ? { version: dr.b, table: after.table } : undefined

    const tab = trackTab(track.id, [ 'items', 'rules', 'json' ], await initialTab(dr, sides))
    const showUnchanged = ref(false)
    const counts = ref<{ added: number, changed: number, removed: number, same: number } | null>(null)

    function view_items() {
      return <LootItems
        dr={dr}
        before={beforeSide}
        after={afterSide}
        showUnchanged={showUnchanged.value}
        onCounts={value => counts.value = value}
      />
    }

    function view_rules() {
      return <LootRules before={before?.table} after={after?.table} />
    }

    function view_json() {
      if (!before) return <TextView text={getJSON(after!.table, after!.raw)} path={track.id} />
      if (!after) return <TextView text={getJSON(before.table, before.raw)} path={track.id} />
      return <TextDiff
        path={track.id}
        original={getJSON(before.table, before.raw)}
        modified={getJSON(after.table, after.raw)}
      />
    }

    return () => <>
      <NTabs
        type='bar'
        class='pad-tab-buttons'
        size='small'
        value={tab.value}
        onUpdateValue={(value: string) => tab.value = value}
      >
        {{
          default: () => [
            <NTab name='items' tab='Items' />,
            <NTab name='rules' tab='Rules' />,
            <NTab name='json' tab='JSON' />,
          ],
          suffix: () => tab.value === 'items' && counts.value?.same ? <div class='tab-toggles'>
            <NCheckbox
              size='small'
              checked={showUnchanged.value}
              onUpdateChecked={value => showUnchanged.value = value}
            >
              <span class='toggle-count'>{counts.value.same}</span>
              Unchanged
            </NCheckbox>
          </div> : null,
        }}
      </NTabs>
      <div style={{ display: tab.value === 'items' ? undefined : 'none' }}>
        <Content content={view_items} />
      </div>
      {tab.value === 'rules' ? <Content content={view_rules} /> : null}
      {tab.value === 'json' ? <Content content={view_json} /> : null}
    </>
  },
})
