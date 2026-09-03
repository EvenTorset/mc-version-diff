<script setup lang="tsx">
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import { ArrowRight16Filled, ArrowSwap24Regular, ArrowUpload24Regular, Attach24Regular, Dismiss24Filled, FolderZip24Regular } from '@vicons/fluent'
import { NButton, NCard, NIcon, NSelect, NSwitch, NUpload, NUploadDragger, type UploadFileInfo } from 'naive-ui'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { getDeltaProvider, listDeltaProviders } from '../registry'
import Spacer from '@/components/Spacer.vue'
import Content from '@/components/Content.vue'
import Tooltip from '@/components/Tooltip.vue'
import { RouterLink, type RouteLocationAsPathGeneric, type RouteLocationAsRelativeGeneric } from 'vue-router'
import { deleteUserFile, readUserFile, writeUserFile } from '@/util/userFiles'
import Notify from '@/notify'
import { errorMessage } from '@/util/errorMessage'
import { selectedComparator } from './selectedComparator'
import { UPLOAD_VERSION_A_KEY, UPLOAD_VERSION_B_KEY, readFilesMeta, writeFilesMeta } from './filesMeta'

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

const comparatorProvider = computed(() => getDeltaProvider(selectedComparator.value)!)
const fileListA = ref<UploadFileInfo[]>([])
const fileListB = ref<UploadFileInfo[]>([])
const optionValues = reactive<any[]>([])
const compareLink = computed<string | RouteLocationAsRelativeGeneric | RouteLocationAsPathGeneric | null>(() => {
  if (!fileListA.value?.length || !fileListB.value?.length) {
    return null
  }
  return {
    name: 'delta',
    params: {
      provider: 'upload',
      a: selectedComparator.value,
      b: '-'
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

function toUploadFileInfo(file: File, name = file.name): UploadFileInfo {
  return {
    id: name,
    name,
    status: 'finished',
    file,
  }
}

async function saveFile(list: UploadFileInfo[], contentName: string, slot: 'a' | 'b') {
  if (restoring) return;
  try {
    const content = await list[0]?.file?.arrayBuffer()
    const meta = readFilesMeta() ?? { provider: selectedComparator.value }
    meta.provider = selectedComparator.value
    const nameKey = slot === 'a' ? 'aName' : 'bName'
    const sizeKey = slot === 'a' ? 'aSize' : 'bSize'
    if (content) {
      await writeUserFile(contentName, content)
      meta[nameKey] = list[0].name
      meta[sizeKey] = content.byteLength
    } else {
      await deleteUserFile(contentName)
      delete meta[nameKey]
      delete meta[sizeKey]
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

watch(fileListA, list => saveFile(list, UPLOAD_VERSION_A_KEY, 'a'))
watch(fileListB, list => saveFile(list, UPLOAD_VERSION_B_KEY, 'b'))

watch(selectedComparator, () => {
  if (restoring) return;
  fileListA.value = []
  fileListB.value = []
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
  if (fileA) fileListA.value = [toUploadFileInfo(fileA, meta?.aName ?? fileA.name)]
  if (fileB) fileListB.value = [toUploadFileInfo(fileB, meta?.bName ?? fileB.name)]
  await nextTick()
  restoring = false
})

const arrowHover = ref(false)

async function swapFiles() {
  const [infoA, infoB] = [fileListA.value[0], fileListB.value[0]]
  const [contentA, contentB] = await Promise.all([
    infoA?.file?.arrayBuffer(),
    infoB?.file?.arrayBuffer(),
  ])

  fileListA.value = infoB && contentB
    ? [{ ...infoB, file: new File([contentB], infoB.name) }]
    : []
  fileListB.value = infoA && contentA
    ? [{ ...infoA, file: new File([contentA], infoA.name) }]
    : []
}

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
      <Row gap="16px">
        <NUpload
          :accept="comparatorProvider.upload?.accept"
          :file-list="fileListA"
          @update:file-list="list => fileListA = list.slice(-1)"
          :file-list-style="{
            display: 'none'
          }"
        >
          <NUploadDragger style="position: relative;">
            <NButton
              v-if="fileListA?.length"
              circle
              class="icon danger"
              size="small"
              style="position: absolute; top: 8px; right: 8px;"
              @click.stop="fileListA = []"
            >
              <template #icon>
                <NIcon :component="Dismiss24Filled" />
              </template>
            </NButton>
            <Col v-if="!fileListA?.length">
              <NIcon :component="ArrowUpload24Regular" :size="48" />
              <h3 style="margin-top: 4px;">Version A</h3>
              <p style="margin-top: 0;">Click here or drag and drop a file to upload</p>
            </Col>
            <Col v-else>
              <NIcon
                :component="
                  /\.(zip|jar)$/.test(fileListA[0].name)
                    ? FolderZip24Regular
                    : Attach24Regular
                "
                :size="48"
              />
              <h3 style="margin-top: 4px;">Version A</h3>
              <p style="margin-top: 0;">{{ fileListA[0].name }}</p>
            </Col>
          </NUploadDragger>
        </NUpload>
        <Tooltip>
          <template #trigger="{ props }">
            <div
              v-bind="props"
              class="swap-toggle"
              :class="{ hover: arrowHover }"
              @mouseenter="arrowHover = true"
              @mouseleave="arrowHover = false"
              @click="swapFiles"
            >
              <NIcon :component="ArrowRight16Filled" :size="32" class="swap-icon arrow" />
              <NIcon :component="ArrowSwap24Regular" :size="32" class="swap-icon swap" />
            </div>
          </template>
          Swap files
        </Tooltip>
        <NUpload
          :accept="comparatorProvider.upload?.accept"
          :file-list="fileListB"
          @update:file-list="list => fileListB = list.slice(-1)"
          :file-list-style="{
            display: 'none'
          }"
        >
          <NUploadDragger style="position: relative;">
            <NButton
              v-if="fileListB?.length"
              circle
              class="icon danger"
              size="small"
              style="position: absolute; top: 8px; right: 8px;"
              @click.stop="fileListB = []"
            >
              <template #icon>
                <NIcon :component="Dismiss24Filled" />
              </template>
            </NButton>
            <Col v-if="!fileListB?.length">
              <NIcon :component="ArrowUpload24Regular" :size="48" />
              <h3 style="margin-top: 4px;">Version B</h3>
              <p style="margin-top: 0;">Click here or drag and drop a file to upload</p>
            </Col>
            <Col v-else>
              <NIcon
                :component="
                  /\.(zip|jar)$/.test(fileListB[0].name)
                    ? FolderZip24Regular
                    : Attach24Regular
                "
                :size="48"
              />
              <h3 style="margin-top: 4px;">Version B</h3>
              <p style="margin-top: 0;">{{ fileListB[0].name }}</p>
            </Col>
          </NUploadDragger>
        </NUpload>
      </Row>
      <template v-if="comparatorProvider.upload?.options">
        <h3 style="margin-left: 0;">Options</h3>
        <Col align="stretch" style="align-self: flex-start;">
          <template v-for="option, i in comparatorProvider.upload?.options">
            <Tooltip v-if="option.type === 'bool'">
              <template #trigger="{ props }">
                <Row
                  v-bind="props"
                  :style="{
                    cursor: 'pointer',
                    userSelect: 'none',
                  }"
                  @click="optionValues[i] = !optionValues[i]"
                >
                  {{ option.label }}
                  <Spacer bridge />
                  <NSwitch :value="optionValues[i]" :default-value="option.default" />
                </Row>
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
          :disabled="!fileListA?.length && !fileListB?.length"
          @click="fileListA = []; fileListB = []"
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
