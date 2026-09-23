<script setup lang="tsx">
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import { NButton, NCard, NCheckbox, NSelect, type UploadFileInfo } from 'naive-ui'
import { computed, nextTick, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { getDeltaProvider, listDeltaProviders } from '../registry'
import Content from '@/components/Content.vue'
import Tooltip from '@/components/Tooltip.vue'
import SwapToggle from '@/components/SwapToggle.vue'
import { RouterLink, type RouteLocationAsPathGeneric, type RouteLocationAsRelativeGeneric } from 'vue-router'
import { deleteUserFile, readUserFile, writeUserFile } from '@/util/userFiles'
import Notify from '@/notify'
import { errorMessage } from '@/util/errorMessage'
import { selectedComparator } from './selectedComparator'
import { UPLOAD_VERSION_A_KEY, UPLOAD_VERSION_B_KEY, readFilesMeta, writeFilesMeta, type FilesMeta } from './filesMeta'
import CardSectionHeader from '@/components/CardSectionHeader.vue'
import UploadSide from './UploadSide.vue'
import { useSwapCrossfade } from '@/util/swapCrossfade'

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
const sides = ref<InstanceType<typeof Row>>()
const cross = useSwapCrossfade(() => sides.value?.$el)

function sideElements() {
  return Array.from((sides.value?.$el as HTMLElement | undefined)?.querySelectorAll<HTMLElement>(':scope > .upload-side:not([inert])') ?? [])
}

watch(swap, async () => {
  const leaving = cross.capture(sideElements())
  cross.cancel()
  await nextTick()
  const next = sideElements()
  if (next.length !== 2 || leaving.length !== 2) return;
  cross.play(leaving, next)
})

const comparatorProvider = computed(() => getDeltaProvider(selectedComparator.value)!)
const versionPicker = computed(() => comparatorProvider.value.upload?.versionPicker?.() ?? null)
const fileListA = ref<UploadFileInfo[]>([])
const fileListB = ref<UploadFileInfo[]>([])
type CompareMode = 'file' | 'version' | 'url'
const COMPARE_MODES: { value: CompareMode, label: string }[] = [
  { value: 'file', label: 'Upload' },
  { value: 'url', label: 'URL' },
  { value: 'version', label: 'Vanilla' },
]
const BASIC_COMPARE_MODES = COMPARE_MODES.filter(m => m.value !== 'version')
const compareModeA = ref<CompareMode>('file')
const compareModeB = ref<CompareMode>('file')
const version = ref('')
const urlA = ref('')
const urlB = ref('')

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
  get: () => compareModeA.value === 'version' && versionPicker.value ? version.value : null,
  set: id => { if (id !== null) version.value = id },
})
const nothing = computed<string | null>({ get: () => null, set: () => {} })
const displayVersionA = swapped(slotAVersion, nothing)
const displayVersionB = swapped(nothing, slotAVersion)

const modeOptionsA = computed(() => versionPicker.value ? COMPARE_MODES : BASIC_COMPARE_MODES)
const modeOptionsB = computed(() => BASIC_COMPARE_MODES)
const displayModeA = swapped(compareModeA, compareModeB)
const displayModeB = swapped(compareModeB, compareModeA)
const displayModeOptionsA = swapped(modeOptionsA, modeOptionsB)
const displayModeOptionsB = swapped(modeOptionsB, modeOptionsA)
const displayUrlA = swapped(urlA, urlB)
const displayUrlB = swapped(urlB, urlA)

const slotAReady = computed(() => {
  if (compareModeA.value === 'version') return version.value !== ''
  if (compareModeA.value === 'url') return urlA.value.trim() !== ''
  return fileListA.value.length > 0
})
const slotBReady = computed(() => {
  if (compareModeB.value === 'url') return urlB.value.trim() !== ''
  return fileListB.value.length > 0
})

function optionShown(option: { uploadsOnly?: boolean }) {
  return !option.uploadsOnly || slotAVersion.value === null
}

const optionValues = reactive<any[]>([])
const compareLink = computed<string | RouteLocationAsRelativeGeneric | RouteLocationAsPathGeneric | null>(() => {
  if (!slotAReady.value || !slotBReady.value) {
    return null
  }
  return {
    name: 'delta',
    params: {
      provider: 'upload',
      a: selectedComparator.value,
      b: swap.value ? 'swap' : undefined,
    },
    query: {
      ...compareModeA.value === 'url' && urlA.value.trim() && { aUrl: urlA.value.trim() },
      ...compareModeB.value === 'url' && urlB.value.trim() && { bUrl: urlB.value.trim() },
      ...Object.fromEntries(comparatorProvider.value.upload?.options?.map((o, i) => {
        if (!optionShown(o)) return null
        switch (o.type) {
          case 'bool': return optionValues[i] ? [
            o.queryParam,
            String(optionValues[i])
          ] : null
        }
      }).filter(e => e !== null) ?? [])
    }
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

function saveUrl(slot: 'a' | 'b', url: string) {
  if (restoring) return;
  const meta = currentMeta()
  const urlKey = slot === 'a' ? 'aUrl' : 'bUrl'
  if (url.trim()) {
    meta[urlKey] = url.trim()
  } else {
    delete meta[urlKey]
  }
  writeFilesMeta(meta)
}

watch(fileListA, list => saveFile(list, UPLOAD_VERSION_A_KEY, 'a'))
watch(fileListB, list => saveFile(list, UPLOAD_VERSION_B_KEY, 'b'))
watch(slotAVersion, id => saveVersion(id))
watch(urlA, url => saveUrl('a', url))
watch(urlB, url => saveUrl('b', url))

watch(compareModeA, async mode => {
  if (mode !== 'version' || version.value) return;
  const id = await comparatorProvider.value.upload?.defaultVersion?.()
  if (id && compareModeA.value === 'version' && !version.value) version.value = id
})

function clear() {
  fileListA.value = []
  fileListB.value = []
  version.value = ''
  urlA.value = ''
  urlB.value = ''

  const meta = currentMeta()
  delete meta.aCachedUrl
  delete meta.bCachedUrl
  writeFilesMeta(meta)
}

watch(selectedComparator, () => {
  if (restoring) return;
  clear()
})

function restoreSide(
  slot: 'a' | 'b',
  meta: FilesMeta | null,
  file: File | null,
  mode: Ref<CompareMode>,
  url: Ref<string>,
  fileList: Ref<UploadFileInfo[]>,
) {
  const metaUrl = slot === 'a' ? meta?.aUrl : meta?.bUrl
  const cachedUrl = slot === 'a' ? meta?.aCachedUrl : meta?.bCachedUrl
  const name = slot === 'a' ? meta?.aName : meta?.bName
  const folder = slot === 'a' ? meta?.aFolder : meta?.bFolder
  if (metaUrl) url.value = metaUrl
  if (file && (!metaUrl || cachedUrl === metaUrl)) {
    fileList.value = [toUploadFileInfo(file, name ?? file.name, folder)]
  } else if (metaUrl) {
    mode.value = 'url'
  }
}

onMounted(async () => {
  const meta = readFilesMeta()
  if (meta) {
    selectedComparator.value = meta.provider
  }
  const [fileA, fileB] = await Promise.all([
    readUserFile(UPLOAD_VERSION_A_KEY),
    readUserFile(UPLOAD_VERSION_B_KEY),
  ])
  restoreSide('a', meta, fileA, compareModeA, urlA, fileListA)
  restoreSide('b', meta, fileB, compareModeB, urlB, fileListB)
  if (meta?.aVersion) {
    compareModeA.value = 'version'
    version.value = meta.aVersion
  }
  await nextTick()
  restoring = false
})


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
      <Row ref="sides" class="sides" gap="16px" align="stretch">
        <UploadSide
          :label="swap ? 'Version B' : 'Version A'"
          :accept="comparatorProvider.upload?.accept"
          :picker="versionPicker"
          :modes="displayModeOptionsA"
          v-model:file-list="displayListA"
          v-model:version="displayVersionA"
          v-model:mode="displayModeA"
          v-model:url="displayUrlA"
        />
        <Tooltip>
          <template #trigger="{ props }">
            <SwapToggle v-bind="props" :swapped="swap" @click="swap = !swap" />
          </template>
          Swap sides
        </Tooltip>
        <UploadSide
          :label="swap ? 'Version A' : 'Version B'"
          :accept="comparatorProvider.upload?.accept"
          :picker="versionPicker"
          :modes="displayModeOptionsB"
          v-model:file-list="displayListB"
          v-model:version="displayVersionB"
          v-model:mode="displayModeB"
          v-model:url="displayUrlB"
        />
      </Row>
      <template v-if="comparatorProvider.upload?.options">
        <CardSectionHeader text="Options" style="margin-left: -12px;" />
        <div class="options">
          <template v-for="option, i in comparatorProvider.upload?.options">
            <Transition name="reveal">
              <div v-if="option.type === 'bool' && optionShown(option)" class="option reveal-slot">
                <div class="option-body">
                  <Tooltip>
                    <template #trigger="{ props }">
                      <NCheckbox v-bind="props" v-model:checked="optionValues[i]">{{ option.label }}</NCheckbox>
                    </template>
                    <Content :content="option.tooltip" />
                  </Tooltip>
                </div>
              </div>
            </Transition>
          </template>
        </div>
      </template>
    </Col>
    <template #footer>
      <Row justify="flex-end" gap="8px">
        <NButton
          :disabled="!fileListA.length && !fileListB.length && !version && !urlA && !urlB"
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

<style lang="scss" scoped>

.sides {
  position: relative;
}

.options {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
}

.option + .option {
  padding-top: 4px;

  &.reveal-enter-from,
  &.reveal-leave-to {
    padding-top: 0;
  }
}

</style>
