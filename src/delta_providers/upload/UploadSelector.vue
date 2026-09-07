<script setup lang="tsx">
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import { ArrowLeft24Filled, ArrowRight16Filled, ArrowRight24Filled } from '@vicons/fluent'
import { NButton, NCard, NCheckbox, NIcon, NSelect, type UploadFileInfo } from 'naive-ui'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { getDeltaProvider, listDeltaProviders } from '../registry'
import Content from '@/components/Content.vue'
import Tooltip from '@/components/Tooltip.vue'
import { RouterLink, type RouteLocationAsPathGeneric, type RouteLocationAsRelativeGeneric } from 'vue-router'
import { deleteUserFile, readUserFile, writeUserFile } from '@/util/userFiles'
import Notify from '@/notify'
import { errorMessage } from '@/util/errorMessage'
import { selectedComparator } from './selectedComparator'
import { UPLOAD_VERSION_A_KEY, UPLOAD_VERSION_B_KEY, readFilesMeta, writeFilesMeta } from './filesMeta'
import CardSectionHeader from '@/components/CardSectionHeader.vue'
import UploadSide from './UploadSide.vue'

let restoring = true

const providerOptions = computed(() => Array.from(listDeltaProviders()
  .filter(p => p.provider.upload)
  .map(p => {
    return {
      label: p.provider.name,
      value: p.id,
    }
  })
))

const swap = ref(false)
const comparatorProvider = computed(() => getDeltaProvider(selectedComparator.value)!)
const versionPicker = computed(() => comparatorProvider.value.upload?.versionPicker?.() ?? null)
const fileListA = ref<UploadFileInfo[]>([])
const fileListB = ref<UploadFileInfo[]>([])
type CompareMode = 'file' | 'version'
const COMPARE_MODES: { value: CompareMode, label: string }[] = [
  { value: 'file', label: 'Upload' },
  { value: 'version', label: 'Vanilla' },
]
const compareMode = ref<CompareMode>('file')
const version = ref('')

function swapped<T>(a: { value: T }, b: { value: T }) {
  return computed({
    get: () => (swap.value ? b.value : a.value),
    set: val => {
      if (swap.value) {
        b.value = val
      } else {
        a.value = val
      }
    }
  })
}

const displayListA = swapped(fileListA, fileListB)
const displayListB = swapped(fileListB, fileListA)

const slotAVersion = computed({
  get: () => compareMode.value === 'version' && versionPicker.value ? version.value : null,
  set: id => { if (id !== null) version.value = id },
})
const nothing = computed<string | null>({ get: () => null, set: () => {} })
const displayVersionA = swapped(slotAVersion, nothing)
const displayVersionB = swapped(nothing, slotAVersion)

const slotAMode = computed<string | null>({
  get: () => versionPicker.value ? compareMode.value : null,
  set: value => { if (value === 'file' || value === 'version') compareMode.value = value },
})
const displayModeA = swapped(slotAMode, nothing)
const displayModeB = swapped(nothing, slotAMode)

const sideAReady = computed(() => slotAVersion.value === null ? fileListA.value.length > 0 : slotAVersion.value !== '')

const optionValues = reactive<any[]>([])
const compareLink = computed<string | RouteLocationAsRelativeGeneric | RouteLocationAsPathGeneric | null>(() => {
  if (!sideAReady.value || !fileListB.value.length) {
    return null
  }
  return {
    name: 'delta',
    params: {
      provider: 'upload',
      a: selectedComparator.value,
      b: swap.value ? 'swap' : undefined,
    },
    query: Object.fromEntries(comparatorProvider.value.upload?.options?.map((o, i) => {
      switch (o.type) {
        case 'bool': return optionValues[i] ? [
          o.queryParam,
          String(optionValues[i])
        ] : null
      }
    }).filter(e => e !== null) ?? [])
  }
})

function toUploadFileInfo(file: File, name = file.name, folder = false): UploadFileInfo {
  return {
    id: name,
    name,
    status: 'finished',
    type: folder ? 'folder' : null,
    file,
  }
}

function currentMeta() {
  const meta = readFilesMeta() ?? { provider: selectedComparator.value }
  meta.provider = selectedComparator.value
  return meta
}

async function saveFile(list: UploadFileInfo[], contentName: string, slot: 'a' | 'b') {
  if (restoring) return;
  try {
    const content = await list[0]?.file?.arrayBuffer()
    if (content) {
      await writeUserFile(contentName, content)
    } else {
      await deleteUserFile(contentName)
    }
    const meta = currentMeta()
    const nameKey = slot === 'a' ? 'aName' : 'bName'
    const sizeKey = slot === 'a' ? 'aSize' : 'bSize'
    const folderKey = slot === 'a' ? 'aFolder' : 'bFolder'
    if (content) {
      meta[nameKey] = list[0].name
      meta[sizeKey] = content.byteLength
      meta[folderKey] = list[0].type === 'folder'
    } else {
      delete meta[nameKey]
      delete meta[sizeKey]
      delete meta[folderKey]
    }
    writeFilesMeta(meta)
  } catch (err: any) {
    console.error(err)
    Notify.error(<>
      Failed to save file.
      <br/>
      {errorMessage(err)}
    </>)
  }
}

function saveVersion(id: string | null) {
  if (restoring) return;
  const meta = currentMeta()
  if (id) {
    meta.aVersion = id
  } else {
    delete meta.aVersion
  }
  writeFilesMeta(meta)
}

watch(fileListA, list => saveFile(list, UPLOAD_VERSION_A_KEY, 'a'))
watch(fileListB, list => saveFile(list, UPLOAD_VERSION_B_KEY, 'b'))
watch(slotAVersion, id => saveVersion(id))

watch(compareMode, async mode => {
  if (mode !== 'version' || version.value) return;
  const id = await comparatorProvider.value.upload?.defaultVersion?.()
  if (id && compareMode.value === 'version' && !version.value) version.value = id
})

function clear() {
  fileListA.value = []
  fileListB.value = []
  version.value = ''
}

watch(selectedComparator, () => {
  if (restoring) return;
  clear()
})

onMounted(async () => {
  const meta = readFilesMeta()
  if (meta) {
    selectedComparator.value = meta.provider
  }
  const [fileA, fileB] = await Promise.all([
    readUserFile(UPLOAD_VERSION_A_KEY),
    readUserFile(UPLOAD_VERSION_B_KEY),
  ])
  if (fileA) fileListA.value = [toUploadFileInfo(fileA, meta?.aName ?? fileA.name, meta?.aFolder)]
  if (fileB) fileListB.value = [toUploadFileInfo(fileB, meta?.bName ?? fileB.name, meta?.bFolder)]
  if (meta?.aVersion) {
    compareMode.value = 'version'
    version.value = meta.aVersion
  }
  await nextTick()
  restoring = false
})

const arrowHover = ref(false)

</script>

<template>
  <NCard title="Upload">
    <Col gap="8px" align="stretch">
      <Row>
        Comparison method:
        <NSelect
          :options="providerOptions"
          v-model:value="selectedComparator"
          style="width: auto;"
          :consistent-menu-width="false"
        />
      </Row>
      <Row gap="16px" align="stretch">
        <UploadSide
          :label="swap ? 'Version B' : 'Version A'"
          :accept="comparatorProvider.upload?.accept"
          :picker="versionPicker"
          :modes="COMPARE_MODES"
          v-model:file-list="displayListA"
          v-model:version="displayVersionA"
          v-model:mode="displayModeA"
        />
        <Tooltip>
          <template #trigger="{ props }">
            <div
              v-bind="props"
              class="swap-toggle"
              :class="{ hover: arrowHover }"
              @mouseenter="arrowHover = true"
              @mouseleave="arrowHover = false"
              @click="swap = !swap"
            >
              <NIcon :component="ArrowRight16Filled" :size="32" class="swap-icon arrow" />
              <div class="swap-icon swap">
                <div class="swap-row">
                  <Transition :name="swap ? 'flow-right' : 'flow-left'">
                    <NIcon :key="String(swap)" :component="swap ? ArrowLeft24Filled : ArrowRight24Filled" :size="24" class="swap-arrow" :class="swap ? 'points-left' : 'points-right'" />
                  </Transition>
                </div>
                <div class="swap-row">
                  <Transition :name="swap ? 'flow-left' : 'flow-right'">
                    <NIcon :key="String(swap)" :component="swap ? ArrowRight24Filled : ArrowLeft24Filled" :size="24" class="swap-arrow" :class="swap ? 'points-right' : 'points-left'" />
                  </Transition>
                </div>
              </div>
            </div>
          </template>
          Swap sides
        </Tooltip>
        <UploadSide
          :label="swap ? 'Version A' : 'Version B'"
          :accept="comparatorProvider.upload?.accept"
          :picker="versionPicker"
          :modes="COMPARE_MODES"
          v-model:file-list="displayListB"
          v-model:version="displayVersionB"
          v-model:mode="displayModeB"
        />
      </Row>
      <template v-if="comparatorProvider.upload?.options">
        <CardSectionHeader text="Options" style="margin-left: -12px;" />
        <Col align="stretch" style="align-self: flex-start;">
          <template v-for="option, i in comparatorProvider.upload?.options">
            <Tooltip v-if="option.type === 'bool'">
              <template #trigger="{ props }">
                <NCheckbox v-bind="props" v-model:checked="optionValues[i]">{{ option.label }}</NCheckbox>
              </template>
              <Content :content="option.tooltip" />
            </Tooltip>
          </template>
        </Col>
      </template>
    </Col>
    <template #footer>
      <Row justify="flex-end" gap="8px">
        <NButton
          :disabled="!fileListA.length && !fileListB.length && !version"
          @click="clear"
        >
          Clear
        </NButton>
        <RouterLink v-if="compareLink" :to="compareLink">
          <NButton class="accent">Compare</NButton>
        </RouterLink>
        <NButton v-else disabled class="accent">Compare</NButton>
      </Row>
    </template>
  </NCard>
</template>

<style lang="scss">

.swap-toggle {
  position: relative;
  min-width: 32px;
  width: 32px;
  height: 32px;
  align-self: center;
  cursor: pointer;
  user-select: none;
  color: var(--color-4);
  transition: color 200ms;

  &:hover {
    color: var(--color-accent);
  }

  .swap-icon {
    position: absolute;
    inset: 0;
    display: block;
    transition: opacity 300ms, transform 300ms;
  }

  .arrow {
    transform: rotate(0deg);
  }

  .swap {
    opacity: 0;
    transform: rotate(-90deg);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .swap-row {
    position: relative;
    height: 14px;
  }

  .swap-arrow {
    position: absolute;
    top: 50%;
    margin-top: -12px;
    transition: opacity 300ms, transform 300ms;

    &.points-right {
      right: 0;
    }

    &.points-left {
      left: 0;
    }
  }

  .flow-right-leave-to {
    opacity: 0;
    transform: translateX(60%) scale(0.5);
  }

  .flow-left-leave-to {
    opacity: 0;
    transform: translateX(-60%) scale(0.5);
  }

  .flow-left-enter-from {
    opacity: 0;
    transform: translateX(60%) scale(0.5);
  }

  .flow-right-enter-from {
    opacity: 0;
    transform: translateX(-60%) scale(0.5);
  }

  &.hover {
    .arrow {
      opacity: 0;
      transform: rotate(90deg);
    }

    .swap {
      opacity: 1;
      transform: rotate(0deg);
    }
  }
}

</style>
