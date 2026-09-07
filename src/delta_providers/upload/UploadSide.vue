<script setup lang="ts">
import Col from '@/components/Col.vue'
import Tooltip from '@/components/Tooltip.vue'
import VersionModeTabs from '@/components/VersionModeTabs.vue'
import Notify from '@/notify'
import { errorMessage } from '@/util/errorMessage'
import { droppedFolder, folderFromEntry, folderFromInput, packFolder, type PickedFolder } from '@/util/folderUpload'
import { ArrowUpload24Regular, Attach24Regular, Dismiss24Filled, Folder24Regular, FolderZip24Regular } from '@vicons/fluent'
import { NButton, NIcon, NProgress, NSpin, NUpload, NUploadDragger, type UploadFileInfo } from 'naive-ui'
import { ref, type Component } from 'vue'
import { getCSSVar } from '@/util/getCSSVar'

defineProps<{
  label: string
  accept?: string
  picker?: Component | null
  modes?: { value: string, label: string }[]
}>()

const fileList = defineModel<UploadFileInfo[]>('fileList', { required: true })
const version = defineModel<string | null>('version', { required: true })
const mode = defineModel<string | null>('mode', { default: null })

const folderInput = ref<HTMLInputElement>()
const stage = ref<'reading' | 'packing' | null>(null)
const progress = ref(0)

function fileIcon(info: UploadFileInfo) {
  if (info.type === 'folder') return Folder24Regular
  if (/\.(zip|jar)$/.test(info.name)) return FolderZip24Regular
  return Attach24Regular
}

async function useFolder(pick: Promise<PickedFolder | null> | PickedFolder | null) {
  stage.value = 'reading'
  progress.value = 0
  try {
    const folder = await pick
    if (!folder) return;
    stage.value = 'packing'
    const file = await packFolder(folder, (done, total) => progress.value = done / total)
    fileList.value = [{ id: file.name, name: file.name, status: 'finished', type: 'folder', file }]
  } catch (err) {
    Notify.error(errorMessage(err))
  } finally {
    stage.value = null
  }
}

function chooseFolder() {
  window.addEventListener('blur', () => {
    window.addEventListener('focus', () => stage.value ??= 'reading', { once: true })
  }, { once: true })
  folderInput.value?.click()
}

function onFolderInput(event: Event) {
  const input = event.target as HTMLInputElement
  const folder = folderFromInput(input.files ?? [])
  input.value = ''
  useFolder(folder)
}

function onDrop(event: DragEvent) {
  const dir = droppedFolder(event.dataTransfer)
  if (!dir) return;
  event.preventDefault()
  event.stopPropagation()
  useFolder(folderFromEntry(dir))
}
</script>

<template>
  <div class="upload-side" @drop.capture="onDrop">
    <div v-if="picker && version !== null" class="version-source">
      <Col>
        <h3>{{ label }}</h3>
        <component :is="picker" :model-value="version" @update:model-value="(id: string) => version = id" />
      </Col>
    </div>
    <NUpload
      v-else
      :accept="accept"
      :file-list="fileList"
      @update:file-list="list => fileList = list.slice(-1)"
      :file-list-style="{
        display: 'none'
      }"
    >
      <NUploadDragger>
        <Col v-if="stage">
          <NSpin :size="48" />
          <h3 style="margin-top: 4px;">{{ label }}</h3>
          <p v-if="stage === 'reading'" style="margin-top: 0;">Reading folder…</p>
          <p v-else style="margin-top: 0;">Packing folder… {{ Math.floor(progress * 100) }}%</p>
          <NProgress
            v-if="stage === 'packing'"
            type="line"
            :percentage="progress * 100"
            :show-indicator="false"
            :color="getCSSVar('--color-accent')"
            style="max-width: 240px;"
          />
        </Col>
        <Col v-else-if="!fileList.length">
          <NIcon :component="ArrowUpload24Regular" :size="48" />
          <h3 style="margin-top: 4px;">{{ label }}</h3>
          <p style="margin-top: 0;">Click here or drag and drop a file or folder to upload</p>
        </Col>
        <Col v-else>
          <NIcon :component="fileIcon(fileList[0])" :size="48" />
          <h3 style="margin-top: 4px;">{{ label }}</h3>
          <p style="margin-top: 0;">{{ fileList[0].name }}</p>
        </Col>
      </NUploadDragger>
    </NUpload>
    <input ref="folderInput" type="file" webkitdirectory hidden @change="onFolderInput" @cancel="stage = null">
    <VersionModeTabs
      v-if="modes && mode !== null"
      class="corner left"
      :model-value="mode"
      :options="modes"
      @update:model-value="(value: string) => mode = value"
    />
    <NButton
      v-if="version === null && fileList.length"
      circle
      class="icon danger corner right"
      size="small"
      @click="fileList = []"
    >
      <template #icon>
        <NIcon :component="Dismiss24Filled" />
      </template>
    </NButton>
    <Tooltip v-else-if="version === null && !stage">
      <template #trigger="{ props }">
        <NButton
          v-bind="props"
          circle
          class="icon corner right"
          size="small"
          @click="chooseFolder"
        >
          <template #icon>
            <NIcon :component="Folder24Regular" />
          </template>
        </NButton>
      </template>
      Choose a folder
    </Tooltip>
  </div>
</template>

<style lang="scss" scoped>

.upload-side {
  flex: 1;
  min-width: 0;
  display: flex;
  position: relative;

  > :deep(.n-upload) {
    flex: 1;
    display: flex;
  }

  :deep(.n-upload-trigger) {
    display: flex;
    width: 100%;
  }

  :deep(.n-upload-dragger) {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
}

.version-source {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 24px;
  border: 1px dashed var(--color-3);
  border-radius: 3px;

  h3 {
    margin: 0 0 12px;
  }
}

.corner {
  position: absolute;
  top: 8px;

  &.left {
    left: 8px;
  }

  &.right {
    right: 8px;
  }
}

</style>
