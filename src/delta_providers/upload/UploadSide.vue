<script setup lang="ts">
import Col from '@/components/Col.vue'
import VersionModeTabs from '@/components/VersionModeTabs.vue'
import { ArrowUpload24Regular, Attach24Regular, Dismiss24Filled, FolderZip24Regular } from '@vicons/fluent'
import { NButton, NIcon, NUpload, NUploadDragger, type UploadFileInfo } from 'naive-ui'
import type { Component } from 'vue'

defineProps<{
  label: string
  accept?: string
  picker?: Component | null
  modes?: { value: string, label: string }[]
}>()

const fileList = defineModel<UploadFileInfo[]>('fileList', { required: true })
const version = defineModel<string | null>('version', { required: true })
const mode = defineModel<string | null>('mode', { default: null })
</script>

<template>
  <div class="upload-side">
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
        <Col v-if="!fileList.length">
          <NIcon :component="ArrowUpload24Regular" :size="48" />
          <h3 style="margin-top: 4px;">{{ label }}</h3>
          <p style="margin-top: 0;">Click here or drag and drop a file to upload</p>
        </Col>
        <Col v-else>
          <NIcon
            :component="/\.(zip|jar)$/.test(fileList[0].name) ? FolderZip24Regular : Attach24Regular"
            :size="48"
          />
          <h3 style="margin-top: 4px;">{{ label }}</h3>
          <p style="margin-top: 0;">{{ fileList[0].name }}</p>
        </Col>
      </NUploadDragger>
    </NUpload>
    <div class="corner">
      <NButton
        v-if="version === null && fileList.length"
        circle
        class="icon danger"
        size="small"
        @click="fileList = []"
      >
        <template #icon>
          <NIcon :component="Dismiss24Filled" />
        </template>
      </NButton>
      <VersionModeTabs
        v-if="modes && mode !== null"
        :model-value="mode"
        :options="modes"
        @update:model-value="(value: string) => mode = value"
      />
    </div>
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
    display: block;
    width: 100%;
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
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

</style>
