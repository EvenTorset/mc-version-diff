<script setup lang="tsx">
import Col from '@/components/Col.vue'
import Content from '@/components/Content.vue'
import Row from '@/components/Row.vue'
import SettingsMenu from '@/components/SettingsMenu.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import { listDeltaProviders } from '@/delta_providers/registry'
import { asyncRenderable } from '@/util/asyncRenderable'
import { Dismiss24Filled, Settings24Filled } from '@vicons/fluent'
import { NIcon, NTab, NTabs } from 'naive-ui'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const dps = Array.from(listDeltaProviders())
const provider = route.params.provider as string
const settingsOpen = ref(provider === 'settings')
const tab = ref<string>(settingsOpen.value ? dps[0].id : provider || dps[0].id)

watch([tab, settingsOpen], () => {
  router.replace({ name: 'home', params: {
    provider: settingsOpen.value ? 'settings' : tab.value === dps[0].id ? '' : tab.value
  }})
})
</script>

<template>
  <Col justify="safe center" style="min-height: 100vh; box-sizing: border-box; padding: 60px 20px" gap="12px">
    <Row justify="center" gap="20px">
      <VersionDiffLogo />
    </Row>
    <Col align="stretch" class="tabs-container">
      <NTabs
        :default-value="dps[0].id"
        style="flex: 0;"
        class="provider-tabs"
        :class="{ hidden: settingsOpen }"
        v-model:value="tab"
      >
        <template #suffix>
          <button
            type="button"
            class="settings-toggle"
            :class="{ open: settingsOpen }"
            :aria-label="settingsOpen ? 'Close settings' : 'Open settings'"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          >
            <NIcon :size="24" :component="Settings24Filled" class="settings-icon gear" />
            <NIcon :size="24" :component="Dismiss24Filled" class="settings-icon cross" />
          </button>
        </template>
        <NTab v-for="dp in dps" :name="dp.id" :tab="dp.provider.name" />
      </NTabs>
      <Suspense>
        <Transition name="slide-fade" mode="out-in">
          <div :key="settingsOpen ? 'settings' : tab" style="height: 520px;">
            <SettingsMenu v-if="settingsOpen" />
            <template v-else v-for="dp in dps" :key="dp.id">
              <Content v-if="tab === dp.id" :content="asyncRenderable(dp.provider.selector())" />
            </template>
          </div>
        </Transition>
      </Suspense>
    </Col>
  </Col>
</template>

<style lang="scss">

.tabs-container {
  min-width: min(960px, 100vw - 40px);
  max-width: min(960px, 100vw - 40px);
}

.provider-tabs {
  .n-tabs-nav-scroll-wrapper {
    transition: opacity 300ms, visibility 0s;
  }

  &.hidden .n-tabs-nav-scroll-wrapper {
    opacity: 0;
    visibility: hidden;
    transition: opacity 300ms, visibility 0s 300ms;
  }
}

.settings-toggle {
  position: relative;
  align-self: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: -4px;
  border: none;
  background: none;
  cursor: pointer;
  user-select: none;
  color: var(--color-4);
  transition: color 200ms;

  &:hover, &.open {
    color: var(--color-accent);
  }

  .settings-icon {
    position: absolute;
    inset: 4px;
    display: block;
    transition: opacity 300ms, transform 300ms;
  }

  .gear {
    transform: rotate(0deg);
  }

  .cross {
    opacity: 0;
    transform: rotate(-90deg);
  }

  &.open {
    .gear {
      opacity: 0;
      transform: rotate(90deg);
    }

    .cross {
      opacity: 1;
      transform: rotate(0deg);
    }
  }
}

</style>
