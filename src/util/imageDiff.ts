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

export type DiffSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas

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
  const uIaw = uniform('u_iaw')
  const uIah = uniform('u_iah')
  const uIbw = uniform('u_ibw')
  const uIbh = uniform('u_ibh')
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

  return {
    canvas,
    draw(a: DiffSource, b: DiffSource) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, textureA)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, textureB)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, b)

      gl.uniform1f(uIaw, a.width)
      gl.uniform1f(uIah, a.height)
      gl.uniform1f(uIbw, b.width)
      gl.uniform1f(uIbh, b.height)
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

export async function diffImage(imgA: ImageBitmap, imgB: ImageBitmap) {
  const differ = createDiffer(
    Math.max(imgA.width, imgB.width),
    Math.max(imgA.height, imgB.height),
  )
  differ.draw(imgA, imgB)
  const image = await createImageBitmap(differ.canvas, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  differ.dispose()
  return image
}
