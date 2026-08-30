import { TextDiff, TextView } from '@/components/lazyText'
import Content from '@/components/Content.vue'
import RecipeView, { type RecipeMarks, type SlotMark } from '@/components/RecipeView.vue'
import type { DeltaResult } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { Settings } from '@/settings'
import {
  deltaTagResolver, normalizeRecipe, sameIngredient, sameResult,
  type NormalizedRecipe, type RecipeIngredient,
} from '@/util/recipes'
import stringify from 'fabulous-json'
import { NTabPane, NTabs } from 'naive-ui'
import { registerViewer } from '../registry'
import { trackTab } from '@/util/trackFocus'

function getJSON(recipe: any, raw: string) {
  return Settings.formatJSON ? stringify(recipe) : raw
}

async function readSide(dr: DeltaResult, version: string, path: string) {
  const raw = new TextDecoder().decode(await dr.getEntry(version, path))
  const json = JSON.parse(raw)
  const recipe = await normalizeRecipe(json, deltaTagResolver(dr, version))
  return { raw, json, recipe }
}

function slotIngredients(recipe: NormalizedRecipe): (RecipeIngredient | null)[] {
  const layout = recipe.layout
  if (layout.kind === 'grid') return layout.slots
  if (layout.kind === 'labeled') return layout.slots.map(slot => slot.ingredient)
  return []
}

function labelOnlyMarks(recipe: NormalizedRecipe, label: SlotMark | null): RecipeMarks {
  return {
    slots: slotIngredients(recipe).map(() => null),
    result: null,
    meta: recipe.meta.map(() => null),
    label,
  }
}

function computeMarks(a: NormalizedRecipe, b: NormalizedRecipe): {
  a: RecipeMarks
  b: RecipeMarks
  slotsComparable: boolean
} {
  const label: SlotMark | null = a.type !== b.type ? 'changed' : null
  const labelOnly = () => ({
    a: labelOnlyMarks(a, label),
    b: labelOnlyMarks(b, label),
    slotsComparable: false,
  })

  if (a.layout.kind !== b.layout.kind || a.layout.kind === 'special') return labelOnly()
  if (a.layout.kind === 'grid' && b.layout.kind === 'grid') {
    if (a.layout.width !== b.layout.width || a.layout.height !== b.layout.height) return labelOnly()
  }
  const slotsA = slotIngredients(a)
  const slotsB = slotIngredients(b)
  if (slotsA.length !== slotsB.length) return labelOnly()

  const textA = new Map(a.meta.map(m => [ m.key, m.text ]))
  const textB = new Map(b.meta.map(m => [ m.key, m.text ]))
  const marksA: RecipeMarks = {
    slots: [],
    result: null,
    meta: a.meta.map(m => !textB.has(m.key) ? 'removed' : textB.get(m.key) !== m.text ? 'changed' : null),
    label,
  }
  const marksB: RecipeMarks = {
    slots: [],
    result: null,
    meta: b.meta.map(m => !textA.has(m.key) ? 'added' : textA.get(m.key) !== m.text ? 'changed' : null),
    label,
  }
  for (let i = 0; i < slotsA.length; i++) {
    const ia = slotsA[i]
    const ib = slotsB[i]
    if (sameIngredient(ia, ib)) {
      marksA.slots.push(null)
      marksB.slots.push(null)
    } else if (ia && !ib) {
      marksA.slots.push('removed')
      marksB.slots.push(null)
    } else if (!ia && ib) {
      marksA.slots.push(null)
      marksB.slots.push('added')
    } else {
      marksA.slots.push('changed')
      marksB.slots.push('changed')
    }
  }
  if (!sameResult(a.result, b.result)) {
    marksA.result = a.result && !b.result ? 'removed' : 'changed'
    marksB.result = b.result && !a.result ? 'added' : 'changed'
    if (!a.result) marksA.result = null
    if (!b.result) marksB.result = null
  }
  return { a: marksA, b: marksB, slotsComparable: true }
}

registerViewer('mcje_recipe', {
  test(_dr, track) {
    return /(?:assets|data)\/[^\/]+\/recipes?\/.+\.json$/.test(track.id)
  },
  async render(dr, track) {
    const single = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const before = single === 'b' ? null : await readSide(dr, dr.a, track.a)
    const after = single === 'a' ? null : await readSide(dr, dr.b, track.b)
    const marks = before && after ? computeMarks(before.recipe, after.recipe) : null

    const unchanged = !!before && !!after
      && JSON.stringify(before.recipe) === JSON.stringify(after.recipe)

    const tab = trackTab(track.id, [ 'recipe', 'json' ], unchanged ? 'json' : 'recipe')

    function view_recipe() {
      if (before && after && !unchanged) {
        return <div class='recipe-diff'>
          <div class='recipe-side'>
            <div class='recipe-version'>{dr.a}</div>
            <RecipeView dr={dr} version={dr.a} recipe={before.recipe} marks={marks?.a} dimUnmarked={marks?.slotsComparable} />
          </div>
          <div class='recipe-side'>
            <div class='recipe-version'>{dr.b}</div>
            <RecipeView dr={dr} version={dr.b} recipe={after.recipe} marks={marks?.b} dimUnmarked={marks?.slotsComparable} />
          </div>
        </div>
      }
      const side = (after ?? before)!
      const version = after ? dr.b : dr.a
      return <div class='recipe-single'>
        {unchanged ? <div class='recipe-note'>This recipe did not change.</div> : null}
        <RecipeView dr={dr} version={version} recipe={side.recipe} />
      </div>
    }

    function view_json() {
      if (!before) return <TextView text={getJSON(after!.json, after!.raw)} path={track.id} />
      if (!after) return <TextView text={getJSON(before.json, before.raw)} path={track.id} />
      return <TextDiff
        path={track.id}
        original={getJSON(before.json, before.raw)}
        modified={getJSON(after.json, after.raw)}
      />
    }

    return () => <>
      <NTabs
        type='bar'
        class='no-tab-padding pad-tab-buttons'
        size='small'
        value={tab.value}
        onUpdateValue={(value: string) => tab.value = value}
      >
        <NTabPane name='recipe' tab='Recipe' displayDirective='show:lazy'>
          <Content content={view_recipe} />
        </NTabPane>
        <NTabPane name='json' tab='JSON' displayDirective='show:lazy'>
          <Content content={view_json} />
        </NTabPane>
      </NTabs>
    </>
  },
})
