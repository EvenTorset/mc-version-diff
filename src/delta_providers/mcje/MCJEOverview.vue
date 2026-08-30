<script setup lang="ts">
import { ArrowLeft16Filled, ArrowRight16Filled, ArrowRight24Regular } from '@vicons/fluent'
import { onMounted } from 'vue'
import { getSurroundingDeltas } from './version_manifest'
import { ref } from 'vue'
import MCJEVersionSummary from './MCJEVersionSummary.vue'
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import Spacer from '@/components/Spacer.vue'
import { NButton, NIcon } from 'naive-ui'
import Tooltip from '@/components/Tooltip.vue'

const props = defineProps<{
  a: string
  b: string
}>()

type AdjacentDelta = { a: string, b: string } | null
const prev = ref<AdjacentDelta>()
const next = ref<AdjacentDelta>()

onMounted(async () => {
  const res = await getSurroundingDeltas(props.a, props.b)
  prev.value = res.prev
  next.value = res.next
})
</script>

<template>
  <Col gap="20px" style="flex: 1;">
    <Row style="align-self: stretch;">
      <Spacer />
      <MCJEVersionSummary :id="a" format-numbers />
      <Spacer flex="1" max="100px" />
      <NIcon :size="24" :component="ArrowRight24Regular" />
      <Spacer flex="1" max="100px" />
      <MCJEVersionSummary :id="b" format-numbers />
      <Spacer />
    </Row>
    <Row v-if="prev !== null || next !== null">
      <Tooltip v-if="prev">
        <template #trigger="{ props }">
          <RouterLink v-bind="props" :to="{ name: 'delta', params: { provider: 'mcje', a: prev.a, b: prev.b }}">
            <NButton icon-placement='left'>
              <template #icon>
                <NIcon :component="ArrowLeft16Filled" />
              </template>
              Previous
            </NButton>
          </RouterLink>
        </template>
        <Row>
          {{ prev.a }}
          <NIcon :component="ArrowRight16Filled" />
          {{ prev.b }}
        </Row>
      </Tooltip>
      <Tooltip v-if="next">
        <template #trigger="{ props }">
          <RouterLink v-bind="props" :to="{ name: 'delta', params: { provider: 'mcje', a: next.a, b: next.b }}">
            <NButton icon-placement='left'>
              <template #icon>
                <NIcon :component="ArrowLeft16Filled" />
              </template>
              Previous
            </NButton>
          </RouterLink>
        </template>
        <Row>
          {{ next.a }}
          <NIcon :component="ArrowRight16Filled" />
          {{ next.b }}
        </Row>
      </Tooltip>
    </Row>
  </Col>
</template>
