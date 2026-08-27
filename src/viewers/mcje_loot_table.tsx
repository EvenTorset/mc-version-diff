import Content from '@/components/Content.vue'
import LootItems from '@/components/LootItems.vue'
import LootRules from '@/components/LootRules.vue'
import TextDiff from '@/components/TextDiff.vue'
import TextView from '@/components/TextView.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { Settings } from '@/settings'
import stringify from 'fabulous-json'
import { NCheckbox, NTab, NTabs } from 'naive-ui'
import { ref } from 'vue'
import { registerViewer } from './registry'

function getJSON(table: any, raw: string) {
  return Settings.formatJSON ? stringify(table) : raw
}

async function readBoth(dr: DeltaResult, version: string, path: string) {
  const raw = new TextDecoder().decode(await dr.getEntry(version, path))
  return { table: JSON.parse(raw), raw }
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

    const before = single === 'b' ? null : await readBoth(dr, dr.a, track.a)
    const after = single === 'a' ? null : await readBoth(dr, dr.b, track.b)

    const tab = ref('items')
    const showUnchanged = ref(false)
    const counts = ref<{ added: number, changed: number, removed: number, same: number } | null>(null)

    function view_items() {
      return <LootItems
        dr={dr}
        before={before ? { version: dr.a, table: before.table } : undefined}
        after={after ? { version: dr.b, table: after.table } : undefined}
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
              {`Show unchanged (${counts.value.same})`}
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
