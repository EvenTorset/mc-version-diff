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
  uniform vec2 u_sizeA;
  uniform vec2 u_sizeB;
  uniform vec2 u_frameA;
  uniform vec2 u_frameB;
  uniform vec4 u_offsetA;
  uniform vec4 u_offsetB;
  uniform float u_blendA;
  uniform float u_blendB;
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

  vec4 frameColor(sampler2D image, vec2 size, vec4 offset, float blend, vec2 pixel) {
    vec4 color = texture(image, (offset.xy + pixel) / size);
    if (blend > 0.0) {
      color = mix(color, texture(image, (offset.zw + pixel) / size), blend);
    }
    return color;
  }

  void main() {
    float x = v_texCoord.x * u_w;
    float y = v_texCoord.y * u_h;
    vec2 pixel = vec2(x, y);

    vec4 colorA = frameColor(u_imageA, u_sizeA, u_offsetA, u_blendA, pixel);
    vec4 colorB = frameColor(u_imageB, u_sizeB, u_offsetB, u_blendB, pixel);

    if ((x >= u_frameA.x || y >= u_frameA.y) && (x >= u_frameB.x || y >= u_frameB.y)) {
      // Out of bounds for both
      float a = floor(mod(x + y, 8.0) / 4.0);
      outColor = vec4(0.5 * mix(0.8, 1.0, a), 0.5 * mix(0.8, 1.0, a), 0.5 * mix(0.8, 1.0, a), 1.0);
    } else if (x >= u_frameA.x || y >= u_frameA.y) {
      // Out of bounds for A (Added)
      float a = floor(mod(x + y, 8.0) / 4.0);
      outColor = vec4(0.33 * mix(0.8, 1.0, a), 1.0 * mix(0.8, 1.0, a), 0.53 * mix(0.8, 1.0, a), 1.0);
    } else if (x >= u_frameB.x || y >= u_frameB.y) {
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

export type DiffFrame = {
  width: number
  height: number
  x?: number
  y?: number
  nextX?: number
  nextY?: number
  progress?: number
}

export type DiffSide = {
  image: ImageBitmap
  frame: { width: number, height: number }
}

export function createDiffer(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) {
    console.error('WebGL 2 not supported')
    throw new Error('WebGL 2 not supported')
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

  function createTexture() {
    const texture = gl!.createTexture()
    gl!.bindTexture(gl!.TEXTURE_2D, texture)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST)
    return texture
  }

  const textureA = createTexture()
  const textureB = createTexture()

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const uSizeA = uniform('u_sizeA')
  const uSizeB = uniform('u_sizeB')
  const uFrameA = uniform('u_frameA')
  const uFrameB = uniform('u_frameB')
  const uOffsetA = uniform('u_offsetA')
  const uOffsetB = uniform('u_offsetB')
  const uBlendA = uniform('u_blendA')
  const uBlendB = uniform('u_blendB')
  const uW = uniform('u_w')
  const uH = uniform('u_h')

  gl.uniform1i(uniform('u_imageA'), 0)
  gl.uniform1i(uniform('u_imageB'), 1)

  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]), gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  let sizeA: DiffFrame | null = null
  let sizeB: DiffFrame | null = null

  return {
    canvas,
    resize(newWidth: number, newHeight: number) {
      if (canvas.width !== newWidth) canvas.width = newWidth
      if (canvas.height !== newHeight) canvas.height = newHeight
    },
    lost() {
      return gl.isContextLost()
    },
    setSources(a: ImageBitmap, b: ImageBitmap) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, textureA)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, textureB)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b)

      sizeA = { width: a.width, height: a.height }
      sizeB = { width: b.width, height: b.height }
    },
    draw(frameA: DiffFrame | null = null, frameB: DiffFrame | null = null) {
      if (!sizeA || !sizeB) return;
      const a = frameA ?? sizeA
      const b = frameB ?? sizeB

      gl.uniform2f(uSizeA, sizeA.width, sizeA.height)
      gl.uniform2f(uSizeB, sizeB.width, sizeB.height)
      gl.uniform2f(uFrameA, a.width, a.height)
      gl.uniform2f(uFrameB, b.width, b.height)
      gl.uniform4f(uOffsetA, a.x ?? 0, a.y ?? 0, a.nextX ?? 0, a.nextY ?? 0)
      gl.uniform4f(uOffsetB, b.x ?? 0, b.y ?? 0, b.nextX ?? 0, b.nextY ?? 0)
      gl.uniform1f(uBlendA, a.progress ?? 0)
      gl.uniform1f(uBlendB, b.progress ?? 0)
      gl.uniform1f(uW, canvas.width)
      gl.uniform1f(uH, canvas.height)

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.flush()
    },
    dispose() {
      gl.deleteTexture(textureA)
      gl.deleteTexture(textureB)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.deleteBuffer(positionBuffer)
      canvas.width = 1
      canvas.height = 1
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

let sharedDiffer: ReturnType<typeof createDiffer> | null = null
let sharedQueue: Promise<unknown> = Promise.resolve()

export function diffImage(imgA: ImageBitmap, imgB: ImageBitmap): Promise<ImageBitmap> {
  const run = sharedQueue.then(async () => {
    const width = Math.max(imgA.width, imgB.width)
    const height = Math.max(imgA.height, imgB.height)

    if (sharedDiffer?.lost()) {
      sharedDiffer.dispose()
      sharedDiffer = null
    }
    sharedDiffer ??= createDiffer(width, height)
    sharedDiffer.resize(width, height)
    sharedDiffer.setSources(imgA, imgB)
    sharedDiffer.draw()

    return createImageBitmap(sharedDiffer.canvas, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
  })
  sharedQueue = run.catch(() => {})
  return run
}
