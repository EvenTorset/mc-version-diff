<script setup lang="ts">
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import Tooltip from '@/components/Tooltip.vue'
import { Settings } from '@/settings'
import { formatBytes } from '@/util/bytes'
import { applyCacheSize, assets, type Edition } from '@/delta_providers/loader'
import { clearVerdictCache } from '@/comparison/verdictCache'
import { NButton, NCard, NInputNumber, NPopconfirm, NSelect, NSpin, NSwitch, NTabPane, NTabs } from 'naive-ui'
import { onMounted, reactive, ref, watch } from 'vue'

const BYTE_UNITS = { MB: 1024**2, GB: 1024**3, TB: 1024**4 }
const byteUnitOptions = Object.keys(BYTE_UNITS).map(u => ({ label: u, value: u }))

type Unit = keyof typeof BYTE_UNITS

const caches = reactive<Record<Edition, { title: string, key: 'cacheSizeMaxJava' | 'cacheSizeMaxBedrock' | 'cacheSizeMaxAssets', unit: Unit, total: { size: number, files: number } | null }>>({
  java: { title: 'Java', key: 'cacheSizeMaxJava', unit: 'MB', total: null },
  bedrock: { title: 'Bedrock', key: 'cacheSizeMaxBedrock', unit: 'MB', total: null },
  assets: { title: 'Java External', key: 'cacheSizeMaxAssets', unit: 'MB', total: null },
})

const editions = Object.keys(caches) as Edition[]
const cacheTab = ref<Edition>('java')

function sizeOf(edition: Edition): number {
  return (Settings[caches[edition].key] ?? 0) / BYTE_UNITS[caches[edition].unit]
}

function setSize(edition: Edition, value: number | null) {
  Settings[caches[edition].key] = (value ?? 0) * BYTE_UNITS[caches[edition].unit]
}

async function refreshTotal(edition: Edition): Promise<void> {
  caches[edition].total = await assets(edition).cacheStats()
}

async function clearVersionCache(edition: Edition): Promise<void> {
  caches[edition].total = null
  await assets(edition).clearCache()
  await clearVerdictCache()
  await refreshTotal(edition)
}

async function clearAll(): Promise<void> {
  await Promise.all(editions.map(edition => clearVersionCache(edition)))
}

onMounted(() => {
  for (const edition of editions) refreshTotal(edition)
})

for (const edition of editions) {
  watch(() => Settings[caches[edition].key], async () => {
    await applyCacheSize(edition)
    await refreshTotal(edition)
  })
}
</script>

<template>
  <Row align="stretch">
    <NCard title="Settings">
      <Col align="stretch">
        <Tooltip anchor="cursor-x">
          <template #trigger="{ props }">
            <Row v-bind="props" class="setting" @click="Settings.pixelFont = !Settings.pixelFont">
              Pixel font
              <Spacer bridge />
              <NSwitch :value="Settings.pixelFont" />
            </Row>
          </template>
          <h3>Pixel font</h3>
          <p>Use a pixel font when rendering the localization files to better match what it would look like in-game.</p>
        </Tooltip>
        <Tooltip anchor="cursor-x">
          <template #trigger="{ props }">
            <Row v-bind="props" class="setting" @click="Settings.formatJSON = !Settings.formatJSON">
              Format JSON
              <Spacer bridge />
              <NSwitch :value="Settings.formatJSON" />
            </Row>
          </template>
          <h3>Format JSON</h3>
          <p>Use a custom JSON formatter when displaying JSON content. This ensures the JSON is always consistently formatted in a compact, but readable fashion.</p>
        </Tooltip>
      </Col>
    </NCard>
    <NCard title="Version Cache">
      <p style="max-width: 500px;">The version cache keeps local copies of versions so that they don't need to be downloaded again next time you want to compare them. This speeds up future comparisons, but uses some amount of local system storage. Each version type is kept in its own cache with its own limit.</p>
      <Col align="stretch" gap="16px">
        <div class="separator" />
        <NTabs v-model:value="cacheTab">
          <template #suffix>
            <NPopconfirm @positive-click="clearAll" positive-text="Clear" negative-text="Cancel">
              <template #trigger>
                <NButton class="danger" size="small">Clear all</NButton>
              </template>
              Clear every version cache and the saved comparison results?
            </NPopconfirm>
          </template>
          <NTabPane v-for="edition in editions" :key="edition" :name="edition" :tab="caches[edition].title">
            <Col align="stretch" gap="8px" class="cache-section">
              <Row>
                Max cache size
                <Spacer bridge />
                <NInputNumber
                  :value="sizeOf(edition)"
                  @update:value="value => setSize(edition, value)"
                  :min="0"
                  :step="1"
                  :style="{ width: '140px' }"
                />
                <NSelect
                  v-model:value="caches[edition].unit"
                  :options="byteUnitOptions"
                  :style="{ width: '90px' }"
                />
              </Row>
              <Row>
                Current cache size:
                <NSpin v-if="!caches[edition].total" size="small"/>
                <template v-else>{{ formatBytes(caches[edition].total!.size) }} ({{ caches[edition].total!.files }} file{{ caches[edition].total!.files === 1 ? '' : 's' }})</template>
              </Row>
              <NPopconfirm @positive-click="clearVersionCache(edition)" positive-text="Clear" negative-text="Cancel">
                <template #trigger>
                  <NButton class="danger" style="align-self: flex-start;">Clear {{ caches[edition].title }} cache</NButton>
                </template>
                Delete every cached {{ caches[edition].title }} version? They will be downloaded again when you next compare them.
              </NPopconfirm>
            </Col>
          </NTabPane>
        </NTabs>
      </Col>
    </NCard>
  </Row>
</template>

<style lang="scss" scoped>

.cache-section {
  padding-top: 4px;
}

.separator {
  height: 1px;
  background-color: rgb(from var(--color-5) r g b / 0.1);
}

.setting {
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  padding: 0 4px;

  &:hover {
    color: var(--color-6);
  }
}

</style>
