import { registerViewer } from './registry'
import Bitmap from '@/components/Bitmap.vue'
import { formatBytes } from '@/util/bytes'
import Row from '@/components/Row.vue'
import FitBox from '@/components/FitBox.vue'
import Tooltip from '@/components/Tooltip.vue'
import type { ImageViewMode, TooltipTriggerProps } from '@/types'
import { ref, type CSSProperties, type Ref } from 'vue'
import { DeltaTrackState } from '@/delta_providers/states'
import { popupable } from '@/util/popupable'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import MediaColumn from '@/components/MediaColumn.vue'
import TextureAnimation from '@/components/TextureAnimation.vue'
import { animationOf, animationStats, readAnimation } from '@/util/animation'
import TextureDifference from '@/components/TextureDifference.vue'
import { diffImage } from '@/util/imageDiff'
import NativeTemplate from '@/components/NativeTemplate.vue'
import { imageFromBytes } from '@/util/imageFromBytes'
import RawImage from '@/components/RawImage.vue'

export const imageViewMode = ref<ImageViewMode>('rgba')
export const animateTextures = ref(false)
function versionImage(
  dr: DeltaResult,
  track: DeltaTrack,
  version: 'a' | 'b',
  img: ImageBitmap,
  bytes: Uint8Array<ArrayBuffer>,
  mcmeta: string | null,
  anim?: { ref: Ref<any>, onUpdate: () => void },
  changedDims?: boolean,
  changedSize?: boolean,
  changedClass?: string,
) {
  const caption = () => <><span style={{
    color: changedDims ? changedClass === 'new' ? 'var(--color-success)' : 'var(--color-danger)' : undefined
  }}>{img.width}×{img.height}</span> · <span style={{
    color: changedSize ? changedClass === 'new' ? 'var(--color-success)' : 'var(--color-danger)' : undefined
  }}>{formatBytes(bytes.byteLength)}</span></>

  // only an edited track shows more than one image, so only it has a group to page through
  const group = track.state === DeltaTrackState.Edited ? track.id : undefined

  const animation = mcmeta ? animationOf(mcmeta) : null
  const stats = animation ? animationStats(animation, img.width, img.height) : null
  const details = `${img.width}×${img.height} · ${formatBytes(bytes.byteLength)}`
  const description = stats
    ? `${details} · ${stats.frames} frames of ${stats.frame.width}×${stats.frame.height} · ${Math.round(stats.duration) / 1000}s`
    : details

  if (animateTextures.value && mcmeta) {
    return <TextureAnimation
      ref={anim?.ref}
      onUpdate={anim?.onUpdate}
      dr={dr}
      version={dr[version]}
      mcmeta={mcmeta}
      texture={version === 'a' ? track.a : track.b}
      mode={imageViewMode.value}
      label={dr[version]}
      group={group}
      v-slots={{ caption }}
    />
  }

  return <MediaColumn title={dr[version]} v-slots={{ caption }}>
    <FitBox
      width={img.width}
      height={img.height}
      maxWidth={512}
      maxHeight={128}
    >
      <RawImage
        bytes={bytes}
        mode={imageViewMode.value}
        {...popupable({
          title: dr[version],
          description,
          group,
          thumbnails: true,
          zoom: true,
        })}
      />
    </FitBox>
  </MediaColumn>
}

const commonLegendBoxStyle: CSSProperties = {
  width: '16px',
  height: '16px',
  border: '1px solid var(--color-3)',
  boxSizing: 'border-box',
}

const legend = [
  {
    title: 'Different',
    desc: 'The area changed color or transparency.',
    style: {
      ...commonLegendBoxStyle,
      backgroundColor: '#f0f',
    } as CSSProperties,
  },
  {
    title: 'Different Transparent RGB',
    desc: 'The area changed color, but is invisible.',
    style: {
      ...commonLegendBoxStyle,
      backgroundColor: '#0ff',
    } as CSSProperties,
  },
  {
    title: 'Added',
    desc: 'The area was added by resizing the texture.',
    style: {
      ...commonLegendBoxStyle,
      background: 'repeating-linear-gradient(-45deg, #5f8, #5f8 4px, #44cc6d 4px, #44cc6d 8px)',
    } as CSSProperties,
  },
  {
    title: 'Removed',
    desc: 'The area was removed by resizing the texture.',
    style: {
      ...commonLegendBoxStyle,
      background: 'repeating-linear-gradient(-45deg, #f34, #f34 4px, #b22430 4px, #b22430 8px)',
    } as CSSProperties,
  },
  {
    title: 'Out of bounds',
    desc: 'The area is not in either version and is not relevant for the comparison.',
    style: {
      ...commonLegendBoxStyle,
      background: 'repeating-linear-gradient(-45deg, #808080, #808080 4px, #666 4px, #666 8px)',
    } as CSSProperties,
  },
]

registerViewer('png', {
  predictedHeight: 166.4,
  test(_dr, track) {
    return track.id.endsWith('.png')
  },
  async render(dr, track) {
    if (track.state === DeltaTrackState.Added || track.state === DeltaTrackState.Moved) {
      const content = await dr.getEntry(dr.b, track.b)
      const img = await imageFromBytes(content)
      const mcmeta = await readAnimation(dr, dr.b, track.b)
      return () => <Row class='image-sides'>{versionImage(dr, track, 'b', img, content, mcmeta)}</Row>
    }
    if (track.state === DeltaTrackState.Removed) {
      const content = await dr.getEntry(dr.a, track.a)
      const img = await imageFromBytes(content)
      const mcmeta = await readAnimation(dr, dr.a, track.a)
      return () => <Row class='image-sides'>{versionImage(dr, track, 'a', img, content, mcmeta)}</Row>
    }
    const [
      [ contentA, imgA ],
      [ contentB, imgB ],
    ] = await Promise.all([
      dr.getEntry(dr.a, track.a).then(async c => [c, await imageFromBytes(c)] as const),
      dr.getEntry(dr.b, track.b).then(async c => [c, await imageFromBytes(c)] as const),
    ])
    const [ mcmetaA, mcmetaB ] = await Promise.all([
      readAnimation(dr, dr.a, track.a),
      readAnimation(dr, dr.b, track.b),
    ])
    const diff = await diffImage(imgA, imgB)
    // both sides animate independently, so the live difference has to be redrawn
    // from whichever frames are on screen rather than from a diff of the sheets
    const animA = ref<any>(null)
    const animB = ref<any>(null)
    const diffView = ref<any>(null)
    const onUpdate = () => diffView.value?.requestDraw()
    const sideA = { ref: animA, onUpdate }
    const sideB = { ref: animB, onUpdate }
    const liveDiff = !!mcmetaA && !!mcmetaB
    const diffTooltipDisable = ref<boolean>(false)
    const legendIgnore: number[] = []
    const legendEntries = () => legend.map((l, i) => legendIgnore.includes(i) ? '' : <>
      <h3><Row><div style={l.style}></div>{l.title}</Row></h3>
      <p>{l.desc}</p>
    </>)
    if (imgA.width === imgB.width) {
      if (imgA.height === imgB.height) {
        legendIgnore.push(2, 3, 4) // Added, Removed, Out of bounds
      } else if (imgA.height < imgB.height) {
        legendIgnore.push(3, 4) // Removed, Out of bounds
      } else {
        legendIgnore.push(2, 4) // Added, Out of bounds
      }
    } else if (imgA.width < imgB.width && imgA.height <= imgB.height) {
      legendIgnore.push(3, 4) // Removed, Out of bounds
    } else if (imgA.width > imgB.width && imgA.height >= imgB.height) {
      legendIgnore.push(2, 4) // Added, Out of bounds
    }
    return () => <Row align='flex-start' wrap class='image-sides'>
      {versionImage(
        dr,
        track,
        'a',
        imgA,
        contentA,
        mcmetaA,
        sideA,
        imgA.width !== imgB.width || imgA.height !== imgB.height,
        contentA.byteLength !== contentB.byteLength,
        'old'
      )}
      {versionImage(
        dr,
        track,
        'b',
        imgB,
        contentB,
        mcmetaB,
        sideB,
        imgA.width !== imgB.width || imgA.height !== imgB.height,
        contentA.byteLength !== contentB.byteLength,
        'new'
      )}
      {animateTextures.value && liveDiff ? <Tooltip
        distance={20}
        side='right'
        v-slots={{
          trigger: ({ props }: TooltipTriggerProps) => <TextureDifference
            {...props}
            ref={diffView}
            sourceA={() => animA.value?.playerCanvas}
            sourceB={() => animB.value?.playerCanvas}
            label='Difference'
            group={track.id}
          />,
        }}
      >
        {legendEntries()}
      </Tooltip> : <MediaColumn title='Difference'>
        <Tooltip
          distance={20}
          side='right'
          disabled={diffTooltipDisable.value}
          v-slots={{
            trigger: ({ props }: TooltipTriggerProps) => <>
              <NativeTemplate>
                <div class='popupable-title'>Difference</div>
                <Row gap='16px' class='popupable-description'>
                  {legend.map((l, i) => legendIgnore.includes(i) ? '' : <Tooltip v-slots={{
                    trigger: ({ props: ttp }: any) => (
                      <Row {...ttp}><div style={l.style}></div>{l.title}</Row>
                    )
                  }}>
                    <h3>{l.title}</h3>
                    <p>{l.desc}</p>
                  </Tooltip>)}
                </Row>
              </NativeTemplate>
              <FitBox
                {...props}
                width={diff.width}
                height={diff.height}
                maxWidth={512}
                maxHeight={128}
              >
                <Bitmap
                  bitmap={diff}
                  {...popupable({
                    content: 'prev',
                    group: track.id,
                    thumbnails: true,
                    zoom: true,
                  })}
                  onVnodeMounted={comp => {
                    comp.el?.addEventListener('popupable:open', () => {
                      diffTooltipDisable.value = true
                    })
                    comp.el?.addEventListener('popupable:close', () => {
                      diffTooltipDisable.value = false
                    })
                  }}
                />
              </FitBox>
            </>
          }}
        >
          {legendEntries()}
        </Tooltip>
      </MediaColumn>}
    </Row>
  },
})
