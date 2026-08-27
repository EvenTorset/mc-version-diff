<script setup lang="ts">
import type { DeltaResult } from '@/delta_providers'
import type { NormalizedRecipe, RecipeIngredient } from '@/util/recipes'
import { ArrowRight24Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Dim from './Dim.vue'
import ItemIcon from './ItemIcon.vue'
import NamespacedPath from './NamespacedPath.vue'
import Tooltip from './Tooltip.vue'

export type SlotMark = 'added' | 'changed' | 'removed'

export interface RecipeMarks {
  slots: (SlotMark | null)[]
  result: SlotMark | null
}

const props = defineProps<{
  dr: DeltaResult
  version: string
  recipe: NormalizedRecipe
  marks?: RecipeMarks
}>()

const tick = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0

onMounted(() => {
  if (subscribers++ === 0) timer = setInterval(() => tick.value++, 1200)
})
onBeforeUnmount(() => {
  if (--subscribers === 0 && timer !== null) {
    clearInterval(timer)
    timer = null
  }
})

const slots = computed(() => props.recipe.layout.kind === 'special' ? [] : props.recipe.layout.slots)

function ingredientOf(index: number): RecipeIngredient | null {
  const slot = slots.value[index]
  if (slot && typeof slot === 'object' && 'label' in slot) return slot.ingredient
  return slot as RecipeIngredient | null
}

function labelOf(index: number): string {
  const slot = slots.value[index]
  return slot && typeof slot === 'object' && 'label' in slot ? slot.label : ''
}

function currentOption(ingredient: RecipeIngredient) {
  if (!ingredient.options.length) return null
  return ingredient.options[tick.value % ingredient.options.length]
}

const header = computed(() => [ props.recipe.label, ...props.recipe.meta ].join(' · '))

const hasLabels = computed(() =>
  props.recipe.layout.kind === 'labeled' && props.recipe.layout.slots.some(slot => slot.label))
</script>

<template>
  <div class="recipe">
    <div class="recipe-header">{{ header }}</div>
    <div v-if="recipe.layout.kind === 'special'" class="recipe-special">
      {{ recipe.layout.description }}
      <div v-if="recipe.result" class="recipe-io">
        <div class="slot" :class="marks?.result">
          <ItemIcon :dr="dr" :version="version" :id="recipe.result.id" :components="recipe.result.components" :size="32" />
          <span v-if="recipe.result.count > 1" class="slot-count">{{ recipe.result.count }}</span>
        </div>
      </div>
    </div>
    <div v-else class="recipe-io" :class="{ 'has-labels': hasLabels }">
      <div
        v-if="recipe.layout.kind === 'grid'"
        class="slot-grid"
        :style="{ gridTemplateColumns: `repeat(${recipe.layout.width}, auto)` }"
      >
        <div v-for="(_, i) of slots" :key="i" class="slot" :class="marks?.slots[i]">
          <template v-if="ingredientOf(i)">
            <Tooltip>
              <template #trigger="{ props: tt }">
                <span v-bind="tt" class="slot-content">
                  <ItemIcon
                    v-if="currentOption(ingredientOf(i)!)"
                    :dr="dr" :version="version"
                    :id="currentOption(ingredientOf(i)!)!"
                    :components="ingredientOf(i)!.components"
                    :size="32"
                  />
                  <span v-else class="slot-tag">#</span>
                </span>
              </template>
              <span>
                <NamespacedPath v-if="currentOption(ingredientOf(i)!)" :value="currentOption(ingredientOf(i)!)!" />
                <template v-else>unknown</template>
                <Dim v-if="ingredientOf(i)!.tag"> · #{{ ingredientOf(i)!.tag }} · {{ ingredientOf(i)!.options.length }} options</Dim>
              </span>
            </Tooltip>
          </template>
        </div>
      </div>
      <div v-else class="labeled-slots">
        <div v-for="(_, i) of slots" :key="i" class="labeled-slot">
          <div class="slot" :class="marks?.slots[i]">
            <template v-if="ingredientOf(i)">
              <Tooltip>
                <template #trigger="{ props: tt }">
                  <span v-bind="tt" class="slot-content">
                    <ItemIcon
                      v-if="currentOption(ingredientOf(i)!)"
                      :dr="dr" :version="version"
                      :id="currentOption(ingredientOf(i)!)!"
                      :components="ingredientOf(i)!.components"
                      :size="32"
                    />
                    <span v-else class="slot-tag">#</span>
                  </span>
                </template>
                <span>
                  <NamespacedPath v-if="currentOption(ingredientOf(i)!)" :value="currentOption(ingredientOf(i)!)!" />
                  <template v-else>unknown</template>
                  <Dim v-if="ingredientOf(i)!.tag"> · #{{ ingredientOf(i)!.tag }} · {{ ingredientOf(i)!.options.length }} options</Dim>
                </span>
              </Tooltip>
            </template>
          </div>
          <div v-if="labelOf(i)" class="slot-label">{{ labelOf(i) }}</div>
        </div>
      </div>
      <template v-if="recipe.result">
        <NIcon :size="24" :component="ArrowRight24Regular" class="recipe-arrow" />
        <div class="slot result" :class="marks?.result">
          <Tooltip>
            <template #trigger="{ props: tt }">
              <span v-bind="tt" class="slot-content">
                <ItemIcon :dr="dr" :version="version" :id="recipe.result.id" :components="recipe.result.components" :size="32" />
              </span>
            </template>
            <NamespacedPath :value="recipe.result.id" />
          </Tooltip>
          <span v-if="recipe.result.count > 1" class="slot-count">{{ recipe.result.count }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>

.recipe {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recipe-header {
  color: var(--color-4);
  font-size: 13px;
}

.recipe-special {
  max-width: 300px;
  color: var(--color-4);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recipe-io {
  display: flex;
  align-items: center;
  gap: 12px;

  &.has-labels {
    padding-bottom: 20px;
  }
}

.slot-grid {
  display: grid;
  gap: 3px;
}

.labeled-slots {
  display: flex;
  gap: 8px;
}

.labeled-slot {
  position: relative;
}

.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  box-sizing: border-box;
  border: 1px solid var(--color-2);
  border-radius: 6px;
  background-color: var(--color-1);

  &.added {
    border-color: var(--color-success);
  }

  &.changed {
    border-color: var(--color-accent-suppl);
  }

  &.removed {
    border-color: var(--color-danger);
  }
}

.slot-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-tag {
  color: var(--color-4);
  font-weight: 600;
}

.slot-count {
  position: absolute;
  right: 3px;
  bottom: 1px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-6);
  text-shadow: 0 1px 2px #000;
  pointer-events: none;
}

.slot-label {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  translate: -50%;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-4);
}

.recipe-arrow {
  color: var(--color-4);
  flex-shrink: 0;
}

</style>
