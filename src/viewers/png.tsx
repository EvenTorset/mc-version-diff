import { registerViewer } from './registry'
import Bitmap from '@/components/Bitmap.vue'
import { formatBytes } from '@/util/bytes'
import Row from '@/components/Row.vue'
import FitBox from '@/components/FitBox.vue'
import Tooltip from '@/components/Tooltip.vue'
import type { ImageViewMode, TooltipTriggerProps } from '@/types'
import { ref, type CSSProperties } from 'vue'
import { DeltaTrackState } from '@/delta_providers/states'
import { popupable } from '@/util/popupable'
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import MediaColumn from '@/components/MediaColumn.vue'
import TextureAnimation from '@/components/TextureAnimation.vue'
import { readAnimation } from '@/util/animation'
import NativeTemplate from '@/components/NativeTemplate.vue'
import { imageFromBytes } from '@/util/imageFromBytes'
import RawImage from '@/components/RawImage.vue'

function diffImage(imgA: ImageBitmap, imgB: ImageBitmap): Promise<ImageBitmap> {
  const iaw = imgA.width
  const iah = imgA.height
  const ibw = imgB.width
  const ibh = imgB.height
  const w = Math.max(iaw, ibw)
  const h = Math.max(iah, ibh)

  const canvas = new OffscreenCanvas(w, h)
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })

  if (!gl) {
    console.error('WebGL 2 not supported')
    throw new Error('WebGL 2 not supported')
  }

  const vertexShaderSource = /*glsl*/`
    #version 300 es
    in vec4 a_position;
    out vec2 v_texCoord;
    void main() {
      gl_Position = a_position;
      v_texCoord = (a_position.xy + 1.0) / 2.0;
      v_texCoord.y = 1.0 - v_texCoord.y;
    }
  `.trim()

  const fragmentShaderSource = /*glsl*/`
    #version 300 es
    precision highp float;
    uniform sampler2D u_imageA;
    uniform sampler2D u_imageB;
    uniform float u_iaw;
    uniform float u_iah;
    uniform float u_ibw;
    uniform float u_ibh;
    uniform float u_w;
    uniform float u_h;
    in vec2 v_texCoord;
    out vec4 outColor;

    const float EPSILON = 0.001;

    bool roughlyEqual(float a, float b) {
      return abs(a - b) < EPSILON;
    }

    bool roughlyEqual(vec4 a, vec4 b) {
      return roughlyEqual(a.x, b.x) &&
             roughlyEqual(a.y, b.y) &&
             roughlyEqual(a.z, b.z) &&
             roughlyEqual(a.w, b.w);
    }

    void main() {
      float x = v_texCoord.x * u_w;
      float y = v_texCoord.y * u_h;

      vec2 texCoordA = vec2(v_texCoord.x * (u_w / u_iaw), v_texCoord.y * (u_h / u_iah));
      vec2 texCoordB = vec2(v_texCoord.x * (u_w / u_ibw), v_texCoord.y * (u_h / u_ibh));

      vec4 colorA = texture(u_imageA, texCoordA);
      vec4 colorB = texture(u_imageB, texCoordB);

      if ((x >= u_iaw || y >= u_iah) && (x >= u_ibw || y >= u_ibh)) {
        // Out of bounds for both
        float a = floor(mod(x + y, 8.0) / 4.0);
        outColor = vec4(0.5 * mix(0.8, 1.0, a), 0.5 * mix(0.8, 1.0, a), 0.5 * mix(0.8, 1.0, a), 1.0);
      } else if (x >= u_iaw || y >= u_iah) {
        // Out of bounds for A (Added)
        float a = floor(mod(x + y, 8.0) / 4.0);
        outColor = vec4(0.33 * mix(0.8, 1.0, a), 1.0 * mix(0.8, 1.0, a), 0.53 * mix(0.8, 1.0, a), 1.0);
      } else if (x >= u_ibw || y >= u_ibh) {
        // Out of bounds for B (Removed)
        float a = floor(mod(x + y, 8.0) / 4.0);
        outColor = vec4(1.0 * mix(0.7, 1.0, a), 0.2 * mix(0.7, 1.0, a), 0.27 * mix(0.7, 1.0, a), 1.0);
      } else if (roughlyEqual(colorA.a, 0.0) || roughlyEqual(colorB.a, 0.0)) {
        // Completely transparent pixels: only compare alpha
        if (!roughlyEqual(colorA.a, colorB.a)) {
          outColor = vec4(1.0, 0.0, 1.0, 1.0); // Different alpha
        } else if (!roughlyEqual(colorA, colorB)) {
          outColor = vec4(0.0, 1.0, 1.0, 1.0); // Different RGB
        } else {
          outColor = vec4(colorA.rgb * colorA.a * 0.5, colorA.a * 0.5); // Same RGB and alpha
        }
      } else if (!roughlyEqual(colorA, colorB)) {
        // Different RGB
        outColor = vec4(1.0, 0.0, 1.0, 1.0);
      } else {
        // Same
        outColor = vec4(colorA.rgb * colorA.a * 0.5, colorA.a * 0.5);
      }
    }
  `.trim()

  function compileShader(gl: WebGL2RenderingContext, source: string, type: number) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER)!
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER)!

  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program))
    throw new Error('Program linking failed')
  }
  gl.useProgram(program)

  function createTexture(gl: WebGL2RenderingContext, image: ImageBitmap) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    return texture
  }

  const textureA = createTexture(gl, imgA)
  const textureB = createTexture(gl, imgB)

  const uImageALocation = gl.getUniformLocation(program, 'u_imageA')
  const uImageBLocation = gl.getUniformLocation(program, 'u_imageB')
  const uIawLocation = gl.getUniformLocation(program, 'u_iaw')
  const uIahLocation = gl.getUniformLocation(program, 'u_iah')
  const uIbwLocation = gl.getUniformLocation(program, 'u_ibw')
  const uIbhLocation = gl.getUniformLocation(program, 'u_ibh')
  const uWLocation = gl.getUniformLocation(program, 'u_w')
  const uHLocation = gl.getUniformLocation(program, 'u_h')

  gl.uniform1i(uImageALocation, 0)
  gl.uniform1i(uImageBLocation, 1)
  gl.uniform1f(uIawLocation, iaw)
  gl.uniform1f(uIahLocation, iah)
  gl.uniform1f(uIbwLocation, ibw)
  gl.uniform1f(uIbhLocation, ibh)
  gl.uniform1f(uWLocation, canvas.width)
  gl.uniform1f(uHLocation, canvas.height)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, textureA)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, textureB)

  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  const positions = [
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  gl.flush()

  const img = createImageBitmap(canvas, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })

  gl.deleteTexture(textureA)
  gl.deleteTexture(textureB)
  gl.deleteProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  gl.deleteBuffer(positionBuffer)
  canvas.width = 1
  canvas.height = 1

  const extension = gl.getExtension('WEBGL_lose_context')
  if (extension) {
    extension.loseContext()
  }

  return img
}

export const imageViewMode = ref<ImageViewMode>('rgba')
export const animateTextures = ref(false)
function versionImage(
  dr: DeltaResult,
  track: DeltaTrack,
  version: 'a' | 'b',
  img: ImageBitmap,
  bytes: Uint8Array<ArrayBuffer>,
  mcmeta: string | null,
  changedDims?: boolean,
  changedSize?: boolean,
  changedClass?: string,
) {
  const caption = () => <><span style={{
    color: changedDims ? changedClass === 'new' ? 'var(--color-success)' : 'var(--color-danger)' : undefined
  }}>{img.width}x{img.height}</span>, <span style={{
    color: changedSize ? changedClass === 'new' ? 'var(--color-success)' : 'var(--color-danger)' : undefined
  }}>{formatBytes(bytes.byteLength)}</span></>

  // only an edited track shows more than one image, so only it has a group to page through
  const group = track.state === DeltaTrackState.Edited ? track.id : undefined

  if (animateTextures.value && mcmeta) {
    return <TextureAnimation
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
          description: `${img.width}x${img.height}, ${formatBytes(bytes.byteLength)}`,
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
    const diffTooltipDisable = ref<boolean>(false)
    const legendIgnore: number[] = []
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
        imgA.width !== imgB.width || imgA.height !== imgB.height,
        contentA.byteLength !== contentB.byteLength,
        'new'
      )}
      <MediaColumn title='Difference'>
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
          {legend.map((l, i) => legendIgnore.includes(i) ? '' : <>
            <h3><Row><div style={l.style}></div>{l.title}</Row></h3>
            <p>{l.desc}</p>
          </>)}
        </Tooltip>
      </MediaColumn>
    </Row>
  },
})
