import type { DeltaResult } from '@/delta_providers'
import { legacyVariant } from '@/util/legacyItems'

export interface RecipeIngredient {
  options: string[]
  tag?: string
  components?: Record<string, any>
}

export interface RecipeResult {
  id: string
  count: number
  components?: Record<string, any>
}

export interface LabeledSlot {
  label: string
  ingredient: RecipeIngredient | null
}

export type RecipeLayout =
  | { kind: 'grid', width: number, height: number, slots: (RecipeIngredient | null)[] }
  | { kind: 'labeled', slots: LabeledSlot[] }
  | { kind: 'special', description: string }

export interface NormalizedRecipe {
  type: string
  label: string
  layout: RecipeLayout
  result: RecipeResult | null
  meta: string[]
}

export type TagResolver = (tag: string) => Promise<string[]>

const strip = (s: string) => s.replace(/^minecraft:/, '')
const namespaced = (s: string) => s.includes(':') ? s : `minecraft:${s}`

export function deltaTagResolver(dr: DeltaResult, version: string): TagResolver {
  const cache = new Map<string, Promise<string[]>>()

  async function resolve(tag: string, seen: Set<string>): Promise<string[]> {
    const clean = tag.replace(/^#/, '')
    if (seen.has(clean)) return []
    seen.add(clean)
    const [ ns, path ] = clean.includes(':') ? clean.split(':') : [ 'minecraft', clean ]
    for (const dir of [ 'item', 'items' ]) {
      const buf = await dr.getEntry(version, `data/${ns}/tags/${dir}/${path}.json`).catch(() => null)
      if (!buf) continue
      const values = JSON.parse(new TextDecoder().decode(buf)).values ?? []
      const out: string[] = []
      for (const value of values) {
        const id = typeof value === 'string' ? value : value?.id
        if (typeof id !== 'string') continue
        if (id.startsWith('#')) out.push(...await resolve(id, seen))
        else out.push(strip(id))
      }
      return out
    }
    return []
  }

  return tag => {
    if (!cache.has(tag)) cache.set(tag, resolve(tag, new Set()))
    return cache.get(tag)!
  }
}

async function parseIngredient(value: any, resolveTag: TagResolver): Promise<RecipeIngredient | null> {
  if (value == null) return null
  if (typeof value === 'string') {
    if (!value) return null
    if (value.startsWith('#')) return { options: await resolveTag(value), tag: namespaced(value.slice(1)) }
    return { options: [ strip(value) ] }
  }
  if (Array.isArray(value)) {
    const parts = await Promise.all(value.map(v => parseIngredient(v, resolveTag)))
    const options = parts.filter(Boolean).flatMap(p => p!.options)
    return options.length ? { options: Array.from(new Set(options)) } : null
  }
  if (typeof value === 'object') {
    if (typeof value.tag === 'string') return { options: await resolveTag(value.tag), tag: namespaced(value.tag) }
    const id = value.item ?? value.id
    if (typeof id !== 'string') return null
    const ingredient: RecipeIngredient = { options: [ legacyVariant(strip(id), value.data) ] }
    const potion = value.potion_contents?.potions ?? value.potion_contents?.potion
    if (typeof potion === 'string') {
      ingredient.components = { 'minecraft:potion_contents': { potion } }
    }
    return ingredient
  }
  return null
}

function parseResult(recipe: any): RecipeResult | null {
  const result = recipe.result ?? recipe.output
  if (result == null) return null
  if (typeof result === 'string') {
    return { id: strip(result), count: recipe.count ?? 1 }
  }
  const id = result.id ?? result.item
  if (typeof id !== 'string') return null
  return {
    id: legacyVariant(strip(id), result.data),
    count: result.count ?? 1,
    components: result.components,
  }
}

const COOKING_LABELS: Record<string, string> = {
  smelting: 'Smelting',
  blasting: 'Blasting',
  smoking: 'Smoking',
  campfire_cooking: 'Campfire cooking',
}

export async function normalizeRecipe(recipe: any, resolveTag: TagResolver): Promise<NormalizedRecipe> {
  const type = strip(recipe.type ?? '')
  const ing = (value: any) => parseIngredient(value, resolveTag)
  const meta: string[] = []

  if (type === 'crafting_shaped') {
    const pattern: string[] = recipe.pattern ?? []
    const width = Math.max(1, ...pattern.map(row => row.length))
    const height = Math.max(1, pattern.length)
    const slots: (RecipeIngredient | null)[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const symbol = pattern[y]?.[x]
        slots.push(symbol && symbol !== ' ' ? await ing(recipe.key?.[symbol]) : null)
      }
    }
    return { type, label: 'Shaped crafting', layout: { kind: 'grid', width, height, slots }, result: parseResult(recipe), meta }
  }

  if (type === 'crafting_shapeless') {
    const slots = await Promise.all((recipe.ingredients ?? []).map(ing))
    const width = Math.min(3, Math.max(1, slots.length))
    return {
      type, label: 'Shapeless crafting',
      layout: { kind: 'grid', width, height: Math.max(1, Math.ceil(slots.length / 3)), slots },
      result: parseResult(recipe), meta,
    }
  }

  if (type in COOKING_LABELS) {
    if (recipe.experience) meta.push(`${recipe.experience} XP`)
    if (recipe.cookingtime) meta.push(`${recipe.cookingtime / 20}s`)
    return {
      type, label: COOKING_LABELS[type],
      layout: { kind: 'labeled', slots: [ { label: '', ingredient: await ing(recipe.ingredient) } ] },
      result: parseResult(recipe), meta,
    }
  }

  if (type === 'stonecutting') {
    return {
      type, label: 'Stonecutting',
      layout: { kind: 'labeled', slots: [ { label: '', ingredient: await ing(recipe.ingredient) } ] },
      result: parseResult(recipe), meta,
    }
  }

  if (type === 'smithing' || type === 'smithing_transform' || type === 'smithing_trim') {
    const slots: LabeledSlot[] = []
    if (recipe.template !== undefined) slots.push({ label: 'Template', ingredient: await ing(recipe.template) })
    slots.push({ label: 'Base', ingredient: await ing(recipe.base) })
    slots.push({ label: 'Material', ingredient: await ing(recipe.addition) })
    if (type === 'smithing_trim' && typeof recipe.pattern === 'string') {
      meta.push(`Pattern: ${strip(recipe.pattern)}`)
    }
    return {
      type, label: type === 'smithing_trim' ? 'Smithing trim' : 'Smithing',
      layout: { kind: 'labeled', slots },
      result: parseResult(recipe), meta,
    }
  }

  if (type === 'crafting_transmute') {
    const result = parseResult(recipe)
    return {
      type, label: 'Transmute crafting',
      layout: { kind: 'labeled', slots: [
        { label: 'Input', ingredient: await ing(recipe.input) },
        { label: 'Material', ingredient: await ing(recipe.material) },
      ] },
      result, meta: result ? meta : [ ...meta, 'Keeps the input item' ],
    }
  }

  if (type === 'crafting_imbue') {
    return {
      type, label: 'Imbue crafting',
      layout: { kind: 'labeled', slots: [
        { label: 'Source', ingredient: await ing(recipe.source) },
        { label: 'Material', ingredient: await ing(recipe.material) },
      ] },
      result: parseResult(recipe), meta,
    }
  }

  if (type === 'crafting_dye') {
    return {
      type, label: 'Dyeing',
      layout: { kind: 'labeled', slots: [
        { label: 'Target', ingredient: await ing(recipe.target) },
        { label: 'Dye', ingredient: await ing(recipe.dye) },
      ] },
      result: parseResult(recipe), meta,
    }
  }

  if (type === 'brewing') {
    return {
      type, label: 'Brewing',
      layout: { kind: 'labeled', slots: [
        { label: 'Input', ingredient: await ing(recipe.input) },
        { label: 'Reagent', ingredient: await ing(recipe.reagent) },
      ] },
      result: parseResult(recipe), meta,
    }
  }

  return {
    type, label: 'Special recipe',
    layout: { kind: 'special', description: `Dynamic recipe (${type || 'unknown type'}), the ingredients are determined in code.` },
    result: parseResult(recipe), meta,
  }
}

export function sameIngredient(a: RecipeIngredient | null, b: RecipeIngredient | null) {
  if (!a || !b) return a === b
  if ((a.tag ?? null) !== (b.tag ?? null)) return false
  if (JSON.stringify(a.components ?? null) !== JSON.stringify(b.components ?? null)) return false
  return a.options.join('|') === b.options.join('|')
}

export function sameResult(a: RecipeResult | null, b: RecipeResult | null) {
  if (!a || !b) return a === b
  return a.id === b.id && a.count === b.count
    && JSON.stringify(a.components ?? null) === JSON.stringify(b.components ?? null)
}
