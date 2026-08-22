<script setup lang="ts">
import Col from '@/components/Col.vue'
import Content from '@/components/Content.vue'
import Row from '@/components/Row.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import { listDeltaProviders } from '@/delta_providers/registry'
import { asyncRenderable } from '@/util/asyncRenderable'
import { Settings32Filled } from '@vicons/fluent'
import { NIcon, NTabPane, NTabs } from 'naive-ui'

const dps = Array.from(listDeltaProviders())
</script>

<template>
  <Col justify="safe center" style="min-height: 100vh; box-sizing: border-box; padding: 60px 20px" gap="12px">
    <Row justify="center" gap="20px">
      <VersionDiffLogo />
      <!-- TODO: Move settings button -->
      <RouterLink :to="{ name: 'settings' }">
        <NIcon :component="Settings32Filled" :size="32" />
      </RouterLink>
    </Row>
    <Row justify="center">
      <NTabs :default-value="dps[0].id" animated style="flex: 0;">
        <NTabPane v-for="dp in dps" :name="dp.id" :tab="dp.provider.name">
          <Suspense>
            <Content :content="asyncRenderable(dp.provider.selector())" />
          </Suspense>
        </NTabPane>
      </NTabs>
    </Row>
  </Col>
</template>
