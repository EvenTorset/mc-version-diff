import Content from '@/components/Content.vue'
import TextDiff from '@/components/TextDiff.vue'
import TextureAnimation from '@/components/TextureAnimation.vue'
import TextView from '@/components/TextView.vue'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { NTab, NTabs } from 'naive-ui'
import { ref, type Ref } from 'vue'
import { animationOf } from '@/util/animation'
import { registerViewer } from './registry'

export const mcmetaTexture = ref(false)

async function readSide(dr: DeltaResult, version: string, path: string) {
  const raw = new TextDecoder().decode(await dr.getEntry(version, path))
  return { version, raw, animated: !!animationOf(raw), texture: path.replace(/\.mcmeta$/, '') }
}

export async function hasAnimations(dr: DeltaResult, tracks: DeltaTrack[]) {
  const sides = tracks.filter(track => track.id.endsWith('.mcmeta')).flatMap(track => [
    ...track.a ? [ [ dr.a, track.a ] as const ] : [],
    ...track.b ? [ [ dr.b, track.b ] as const ] : [],
  ])
  const animated = await Promise.all(sides.map(async ([ version, path ]) => {
    try {
      return !!animationOf(new TextDecoder().decode(await dr.getEntry(version, path)))
    } catch {
      return false
    }
  }))
  return animated.includes(true)
}

registerViewer('mcje_mcmeta', {
  test(_dr, track) {
    return track.id.endsWith('.mcmeta')
  },
  async render(dr, track) {
    const single = track.state === DeltaTrackState.Removed
      ? 'a'
      : track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved
        ? 'b'
        : null

    const before = single === 'b' ? null : await readSide(dr, dr.a, track.a)
    const after = single === 'a' ? null : await readSide(dr, dr.b, track.b)
    const sides = [ before, after ].filter(side => side !== null)
    const animated = sides.some(side => side.animated)

    function view_text() {
      if (!before) return <TextView text={after!.raw} path={track.id} />
      if (!after) return <TextView text={before.raw} path={track.id} />
      return <TextDiff path={track.id} original={before.raw} modified={after.raw} />
    }

    if (!animated) return view_text

    const tab = ref('animation')

    type Stats = { frames: number, duration: number }
    const stats: Record<string, Ref<Stats | null>> = {}
    for (const side of sides) stats[side.version] = ref(null)

    function caption(side: typeof sides[number]) {
      const mine = stats[side.version].value
      if (!mine) return null
      const other = sides.find(s => s !== side && s.animated)
      const theirs = other ? stats[other.version].value : null
      const cls = (key: keyof Stats) => theirs && theirs[key] !== mine[key] ? 'changed' : ''
      return <>
        <span class={cls('frames')}>{mine.frames} frames</span>
        {' · '}
        <span class={cls('duration')}>{Math.round(mine.duration) / 1000}s</span>
      </>
    }

    function view_animation() {
      return <div class='animation-sides'>
        {sides.map(side => <div class='animation-side' key={side.version}>
          {side.animated
            ? <TextureAnimation
              dr={dr}
              version={side.version}
              mcmeta={side.raw}
              texture={side.texture}
              numbered={!mcmetaTexture.value}
              label={sides.length > 1 ? side.version : undefined}
              group={sides.length > 1 ? track.id : undefined}
              onStats={(value: Stats) => stats[side.version].value = value}
              v-slots={{ caption: () => caption(side) }}
            />
            : <div class='animation-none'>No animation in this version.</div>}
        </div>)}
      </div>
    }

    return () => <>
      <NTabs
        type='bar'
        class='pad-tab-buttons'
        size='small'
        value={tab.value}
        onUpdateValue={(value: string) => tab.value = value}
      >
        <NTab name='animation' tab='Animation' />
        <NTab name='json' tab='JSON' />
      </NTabs>
      {tab.value === 'animation' ? <Content content={view_animation} /> : null}
      {tab.value === 'json' ? <Content content={view_text} /> : null}
    </>
  },
})
