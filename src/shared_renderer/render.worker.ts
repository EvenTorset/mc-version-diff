import type { ImageViewMode } from '@/types'

export interface RenderTask {
  bitmap: ImageBitmap
  mode: ImageViewMode
  width: number
  height: number
}

export interface WorkerRenderMessage {
  id: number
  bitmap?: ImageBitmap
  error?: string
}

const MODE_MAP: Record<ImageViewMode, number> = {
  rgba: 0,
  rgb: 1,
  r: 2,
  g: 3,
  b: 4,
  a: 5,
}

const vertexSource = /*glsl*/`#version 300 es
precision highp float;

const vec2 positions[6] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),

  vec2(-1.0,  1.0),
  vec2( 1.0, -1.0),
  vec2( 1.0,  1.0)
);

out vec2 uv;

void main() {
  vec2 p = positions[gl_VertexID];
  uv = p * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  gl_Position = vec4(p, 0.0, 1.0);
}
`

const fragmentSource = /*glsl*/`#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform int uMode;

in vec2 uv;

out vec4 outColor;

void main() {
  vec4 c = texture(uTexture, uv);

  switch (uMode) {
    case 1: // RGB
      c.a = 1.0;
      break;
    case 2: // R
      c.rgb = c.rrr;
      c.a = 1.0;
      break;
    case 3: // G
      c.rgb = c.ggg;
      c.a = 1.0;
      break;
    case 4: // B
      c.rgb = c.bbb;
      c.a = 1.0;
      break;
    case 5: // A
      c.rgb = c.aaa;
      c.a = 1.0;
      break;
  }

  outColor = c;
}
`

let canvas: OffscreenCanvas | null = null
let gl: WebGL2RenderingContext | null = null
let program: WebGLProgram | null = null
let texture: WebGLTexture | null = null
let vao: WebGLVertexArrayObject | null = null
let uTexture: WebGLUniformLocation | null = null
let uMode: WebGLUniformLocation | null = null

function initGL() {
  canvas = new OffscreenCanvas(1, 1)
  gl = canvas.getContext('webgl2', {
    premultipliedAlpha: false,
    alpha: true,
    preserveDrawingBuffer: true,
  })

  if (!gl) {
    throw new Error('WebGL2 unavailable in worker thread')
  }

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)

  const vs = compileShader(gl.VERTEX_SHADER, vertexSource)
  const fs = compileShader(gl.FRAGMENT_SHADER, fragmentSource)

  program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program)!)
  }

  gl.deleteShader(vs)
  gl.deleteShader(fs)

  vao = gl.createVertexArray()
  gl.bindVertexArray(vao)

  texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  uTexture = gl.getUniformLocation(program, 'uTexture')
  uMode = gl.getUniformLocation(program, 'uMode')
}

function compileShader(type: number, source: string): WebGLShader {
  const shader = gl!.createShader(type)!
  gl!.shaderSource(shader, source)
  gl!.compileShader(shader)

  if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
    throw new Error(gl!.getShaderInfoLog(shader)!)
  }
  return shader
}

self.onmessage = (event: MessageEvent<{ id: number } & RenderTask>) => {
  const { id, bitmap, mode, width, height } = event.data

  try {
    if (!gl) initGL()

    if (canvas!.width !== width) canvas!.width = width
    if (canvas!.height !== height) canvas!.height = height

    gl!.viewport(0, 0, width, height)

    gl!.bindTexture(gl!.TEXTURE_2D, texture)
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      bitmap,
    )

    bitmap.close()

    gl!.useProgram(program)
    gl!.uniform1i(uTexture, 0)
    gl!.uniform1i(uMode, MODE_MAP[mode] ?? 0)

    gl!.drawArrays(gl!.TRIANGLES, 0, 6)

    gl!.flush()

    const resultBitmap = canvas!.transferToImageBitmap()
    self.postMessage({ id, bitmap: resultBitmap }, { transfer: [resultBitmap] })
  } catch (err: any) {
    bitmap.close()
    self.postMessage({ id, error: err?.message || String(err) })
  }
}
