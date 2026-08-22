<script setup lang="tsx">
import AnimatedHeight from '@/components/AnimatedHeight.vue'
import Col from '@/components/Col.vue'
import Content from '@/components/Content.vue'
import Row from '@/components/Row.vue'
import SettingsMenu from '@/components/SettingsMenu.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import { listDeltaProviders } from '@/delta_providers/registry'
import { asyncRenderable } from '@/util/asyncRenderable'
import { Settings32Filled } from '@vicons/fluent'
import { NIcon, NTab, NTabs } from 'naive-ui'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const dps = Array.from(listDeltaProviders())
const tab = ref<string>(route.params.provider as string || dps[0].id)

watch(tab, () => {
  router.replace({ name: 'home', params: { provider: tab.value === dps[0].id ? '' : tab.value }})
})

function settingsTab() {
  return <NIcon size={24} component={Settings32Filled}/>
}
</script>

<template>
  <Col justify="safe center" style="min-height: 100vh; box-sizing: border-box; padding: 60px 20px" gap="12px">
    <Row justify="center" gap="20px">
      <VersionDiffLogo />
    </Row>
    <Col align="stretch" class="tabs-container">
      <NTabs :default-value="dps[0].id" style="flex: 0;" class="provider-tabs" v-model:value="tab">
        <NTab v-for="dp in dps" :name="dp.id" :tab="dp.provider.name" />
        <NTab name="settings" :tab="settingsTab" />
      </NTabs>
      <AnimatedHeight :duration="500">
        <Suspense>
          <Transition name="slide-fade" mode="out-in">
            <div :key="tab">
              <SettingsMenu v-if="tab === 'settings'" />
              <template v-else v-for="dp in dps" :key="dp.id">
                <Content v-if="tab === dp.id" :content="asyncRenderable(dp.provider.selector())" />
              </template>
            </div>
          </Transition>
        </Suspense>
      </AnimatedHeight>
    </Col>
  </Col>
</template>

<style lang="scss">

.tabs-container {
  min-width: min(960px, 100vw - 40px);
  max-width: min(960px, 100vw - 40px);
}

.provider-tabs .n-tabs-wrapper {
  display: flex;

  .n-tabs-tab-wrapper:has([data-name="settings"]) {
    flex-grow: 1 !important;
    justify-content: flex-end;
  }
}

</style>
