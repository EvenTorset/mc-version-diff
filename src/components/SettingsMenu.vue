<script setup lang="ts">
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import Tooltip from '@/components/Tooltip.vue'
import { Settings } from '@/settings'
import { formatBytes } from '@/util/bytes'
import { getOPFSSize } from '@/util/download'
import { NButton, NCard, NInputNumber, NSelect, NSpin, NSwitch } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'

async function clearOPFS(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  for await (const name of root.keys()) {
    await root.removeEntry(name, { recursive: true });
  }
  cacheTotal.value = await getOPFSSize()
}

const cacheTotal = ref<{ size: number, count: number }>({
  size: -1,
  count: -1,
})

const BYTE_UNITS = { B: 1, kB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 }
const byteUnitOptions = Object.keys(BYTE_UNITS).map(u => ({ label: u, value: u }))

const cacheSizeMaxUnit = ref<keyof typeof BYTE_UNITS>('MB')

const cacheSizeMaxDV = computed({
  get: () => (Settings.cacheSizeMax ?? 0) / BYTE_UNITS[cacheSizeMaxUnit.value],
  set: v => {
    Settings.cacheSizeMax = (v ?? 0) * BYTE_UNITS[cacheSizeMaxUnit.value]
  }
})

onMounted(async () => {
  cacheTotal.value = await getOPFSSize()
})
</script>

<template>
  <Row align="stretch">
    <NCard title="Settings">
      <Col align="stretch">
        <Tooltip>
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
        <Tooltip>
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
      <p style="max-width: 500px;">The version cache keeps local copies of versions so that they don't need to be downloaded again next time you want to compare them. This speeds up future comparisons, but uses some amount of local system storage.</p>
      <Col align="stretch" gap="8px">
        <Row>
          Max cache size
          <Spacer bridge />
          <NInputNumber
            v-model:value="cacheSizeMaxDV"
            :min="0"
            :step="1"
            :style="{ width: '140px' }"
          />
          <NSelect
            v-model:value="cacheSizeMaxUnit"
            :options="byteUnitOptions"
            :style="{ width: '90px' }"
          />
        </Row>
        <Row>
          Current total cache size:
          <NSpin v-if="cacheTotal.size === -1" size="small"/>
          <template v-else>{{ formatBytes(cacheTotal.size) }} ({{ cacheTotal.count }} file{{ cacheTotal.count === 1 ? '' : 's' }})</template>
        </Row>
        <Tooltip>
          <template #trigger="{ props }">
            <NButton v-bind="props" @click="clearOPFS" class="danger" style="align-self: flex-start;">Clear</NButton>
          </template>
          <h3>Clear Cache</h3>
          <p>Clearing the version cache will free up some space on your system, but you will need to download the versions again if you want to compare them later.</p>
        </Tooltip>
      </Col>
    </NCard>
  </Row>
</template>

<style lang="scss" scoped>

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
