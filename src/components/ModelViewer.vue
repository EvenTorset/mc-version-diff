<script lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'

export type PrepareModel = (dr: DeltaResult, version: string, path: string) => Promise<{ model: any, assets: any, animate?: (group: any, time: number, camera?: any) => void, length?: number, fixed?: boolean }>

let sharedRenderer: any = null

function getSharedRenderer(THREE: any) {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true })
    sharedRenderer.setPixelRatio(1)
  }
  return sharedRenderer
}
</script>

<script setup lang="tsx">
import { DeltaTrackState } from '@/delta_providers/states'
import { acquireSharedCamera, releaseSharedCamera, type SharedCamera } from '@/util/sharedCamera'
import { acquireFixedFrame, releaseFixedFrame } from '@/util/fixedFrame'
import { easeTowardIdle } from '@/util/orbitIdle'
import { getGlobalTheta } from '@/util/globalRotation'
import { createAnimator, getThree, loadModel, resolveModelData, versionAssets } from '@/util/blockModelRenderer'
import { NSpin } from 'naive-ui'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { onBeforeUnmount, onMounted, ref, Transition, watch } from 'vue'
import type * as ThreeNS from 'three'
import { useElementVisible } from '@/util/useElementVisible'

const props = defineProps<{
  dr: DeltaResult
  track: DeltaTrack
  version: 'a' | 'b'
  expanded?: boolean
  prepare?: PrepareModel
  cameraKey?: string | null
}>()

const IDLE_RETURN_DELAY = 5000
const CAMERA_FOV = 35
const FIXED_PHI = Math.PI / 3
const FIXED_THETA = Math.PI / 4
const FIT_SAMPLES = 16
const FIXED_FIT_RATE = 10
const FIXED_FIT_RUNS = 4
const FIT_SETTLE_SECONDS = 2
const FIT_GROWTH = 0.001

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const isVisible = useElementVisible(containerRef)

const loading = ref(true)
const errorMessage = ref('')
const fixed = ref(false)

let THREE: typeof ThreeNS
let group: ThreeNS.Group | null = null
let animate: ((group: any, time: number, camera?: any) => void) | null = null
let animator: ReturnType<typeof createAnimator> | null = null
let homeRadius = 24
let homePhi = 0
let fixedBox: ThreeNS.Box3 | null = null
let fixedFrameKey: string | null = null

let scene: ThreeNS.Scene | null = null
let camera: ThreeNS.PerspectiveCamera | null = null
let context2d: CanvasRenderingContext2D | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null

let idle = true
let idleTimer: ReturnType<typeof setTimeout> | null = null
let rafId = 0
let lastFrameTime = 0
let active = false

const ownerId = Symbol('model-viewer')
let pairCamera: SharedCamera | null = null
let pairCameraKey: string | null = null

function clearIdleTimer() {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = null
}

function interruptIdle(): boolean {
  clearIdleTimer()
  idle = false
  if (pairCamera) return pairCamera.claim(ownerId)
  return true
}

function scheduleReturn() {
  clearIdleTimer()
  if (pairCamera) {
    pairCamera.release(ownerId)
    return;
  }
  idleTimer = setTimeout(() => {
    idle = true
  }, IDLE_RETURN_DELAY)
}

function disposeGroupResources(root: ThreeNS.Object3D) {
  root.traverse(obj => {
    const mesh = obj as ThreeNS.Mesh
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      for (const key of ['map', 'alphaMap', 'emissiveMap'] as const) {
        const mat = material as unknown as Record<string, ThreeNS.Texture | undefined>
        mat[key]?.dispose()
      }
      material.dispose()
    }
  })
}

async function loadModelGroup() {
  THREE = await getThree()

  const path = props.track[props.version]
  const version = props.dr[props.version]
  const prepared = props.prepare
    ? await props.prepare(props.dr, version, path)
    : {
      model: JSON.parse(new TextDecoder().decode(await props.dr.getEntry(version, path))),
      assets: await versionAssets(props.dr, version),
    }
  const { model, assets } = prepared
  animate = prepared.animate ?? null
  fixed.value = !!prepared.fixed

  const resolved = await resolveModelData(assets, { model })
  const g = new THREE.Group()
  await loadModel(g, assets, resolved, {
    animate: false,
    lighting: 'world',
    display: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] },
  })

  const box = new THREE.Box3().setFromObject(g)
  if (animate) {
    const span = Math.max(prepared.length ?? 0, 2)
    const samples = prepared.fixed ? Math.round(span * FIXED_FIT_RATE) : FIT_SAMPLES
    const settleAfter = Math.round(samples / span * FIT_SETTLE_SECONDS)
    const sampled = new THREE.Box3()
    const size = new THREE.Vector3()
    const extent = () => box.isEmpty() ? 0 : box.getSize(size).x + size.y + size.z
    for (let run = 0; run < (prepared.fixed ? FIXED_FIT_RUNS : 1); run++) {
      let settled = 0
      for (let i = 0; i <= samples; i++) {
        animate(g, span * i / samples)
        g.updateMatrixWorld(true)
        const before = extent()
        box.union(sampled.setFromObject(g))
        if (extent() - before > FIT_GROWTH) settled = 0
        else if (++settled >= settleAfter) break
      }
      animate(g, 0)
    }
  }
  if (prepared.fixed) {
    box.expandByPoint(new THREE.Vector3())
    fixedBox = box
  } else {
    g.position.sub(box.getCenter(new THREE.Vector3()))
  }

  homeRadius = fitRadius(box.getSize(new THREE.Vector3()))

  group = g
  animator = createAnimator(g)
}

function resize() {
  if (!canvasRef.value) return;
  const ratio = Math.min(window.devicePixelRatio, 2)
  const w = Math.round(canvasRef.value.clientWidth * ratio)
  const h = Math.round(canvasRef.value.clientHeight * ratio)
  if (!w || !h) return;
  if (canvasRef.value.width !== w) canvasRef.value.width = w
  if (canvasRef.value.height !== h) canvasRef.value.height = h
}

function onWheel(event: WheelEvent) {
  if (document.activeElement !== canvasRef.value) return;
  event.preventDefault()
  if (!camera || !controls) return;
  if (!interruptIdle()) return;
  scheduleReturn()

  const offset = camera.position.clone().sub(controls.target)
  const sph = new THREE.Spherical().setFromVector3(offset)
  const zoom = Math.exp(event.deltaY * 0.001)
  const homeR = pairCamera ? pairCamera.homeRadius : homeRadius
  sph.radius = THREE.MathUtils.clamp(sph.radius * zoom, homeR * 0.25, homeR * 4)
  camera.position.setFromSpherical(sph).add(controls.target)
}

function fitRadius(size: ThreeNS.Vector3) {
  return Math.max(1, Math.hypot(size.x, size.y, size.z)) * 1.6 + 6
}

function fixedDistance(box: ThreeNS.Box3) {
  const direction = new THREE.Vector3().setFromSpherical(new THREE.Spherical(1, FIXED_PHI, FIXED_THETA))
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction, right).normalize()
  const tan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2))
  const center = box.getCenter(new THREE.Vector3())
  let distance = 0
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center)
    const depth = corner.dot(direction)
    distance = Math.max(distance, Math.abs(corner.dot(up)) / tan + depth, Math.abs(corner.dot(right)) / tan + depth)
  }
  return Math.max(4, distance) * 1.15 + 4
}

function applyFixedFrame() {
  if (!group || !camera || !fixedBox) return;
  group.position.copy(fixedBox.getCenter(new THREE.Vector3())).negate()
  camera.position.setFromSpherical(new THREE.Spherical(fixedDistance(fixedBox), FIXED_PHI, FIXED_THETA))
  camera.lookAt(0, 0, 0)
}

function frame(now: number) {
  rafId = requestAnimationFrame(frame)
  if (!active || !context2d || !camera || !scene) return;
  if (fixed.value) applyFixedFrame()

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1) || 0
  if (controls) {
    if (pairCamera) {
      pairCamera.sync(now)
    } else if (idle) {
      easeTowardIdle(THREE, camera, controls.target, homePhi, homeRadius, dt)
    }
    controls.update()
  }
  lastFrameTime = now

  if (canvasRef.value && canvasRef.value.clientHeight) {
    camera.aspect = canvasRef.value.clientWidth / canvasRef.value.clientHeight
    camera.updateProjectionMatrix()
  }

  animator?.update()
  if (group) animate?.(group, now / 1000, camera)

  const canvas = canvasRef.value!
  if (!canvas.width || !canvas.height) return;
  const renderer = getSharedRenderer(THREE)
  if (renderer.domElement.width !== canvas.width || renderer.domElement.height !== canvas.height) renderer.setSize(canvas.width, canvas.height, false)
  renderer.render(scene, camera)
  context2d.clearRect(0, 0, canvas.width, canvas.height)
  context2d.drawImage(renderer.domElement, 0, 0)
}

function setupScene() {
  if (!canvasRef.value || !group) return;

  scene = new THREE.Scene()
  scene.add(group)

  context2d = canvasRef.value.getContext('2d')
  active = true

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasRef.value)
  resize()

  const cameraKey = props.cameraKey === undefined
    ? props.track.state === DeltaTrackState.Edited ? props.track.id : null
    : props.cameraKey

  if (fixed.value) {
    camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000)
    if (cameraKey && fixedBox) {
      fixedFrameKey = cameraKey
      fixedBox = acquireFixedFrame(THREE, cameraKey, fixedBox)
    }
    applyFixedFrame()
    lastFrameTime = performance.now()
    rafId = requestAnimationFrame(frame)
    return;
  }

  const dir = new THREE.Vector3(-1, 0.75, -1).normalize()
  const dirSpherical = new THREE.Spherical().setFromVector3(dir)
  homePhi = dirSpherical.phi
  const initialTheta = getGlobalTheta()

  if (cameraKey) {
    pairCameraKey = cameraKey
    pairCamera = acquireSharedCamera(THREE, pairCameraKey, initialTheta, homePhi, homeRadius)
    camera = pairCamera.camera
  } else {
    camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000)
    camera.position.setFromSpherical(new THREE.Spherical(homeRadius, homePhi, initialTheta))
  }

  controls = new OrbitControls(camera, canvasRef.value)
  controls.enableDamping = true
  controls.rotateSpeed = 0.4
  controls.enablePan = false
  controls.enableZoom = false

  controls.addEventListener('start', () => {
    if (!interruptIdle()) controls!.enabled = false
  })
  controls.addEventListener('end', () => {
    controls!.enabled = true
    scheduleReturn()
  })

  canvasRef.value.addEventListener('wheel', onWheel, { passive: false })

  lastFrameTime = performance.now()
  rafId = requestAnimationFrame(frame)
}

function suspend() {
  if (!active) return;
  active = false
  cancelAnimationFrame(rafId)
}

function resume() {
  if (active || !context2d) return;
  active = true
  lastFrameTime = performance.now()
  rafId = requestAnimationFrame(frame)
}

function teardownScene() {
  cancelAnimationFrame(rafId)
  clearIdleTimer()
  resizeObserver?.disconnect()
  resizeObserver = null
  canvasRef.value?.removeEventListener('wheel', onWheel)
  controls?.dispose()
  controls = null
  if (pairCameraKey) {
    releaseSharedCamera(pairCameraKey)
    pairCameraKey = null
    pairCamera = null
  }
  if (fixedFrameKey) {
    releaseFixedFrame(fixedFrameKey)
    fixedFrameKey = null
  }
  if (group) disposeGroupResources(group)
  context2d = null
  scene = null
  camera = null
  active = false
}

function syncToVisibility() {
  if (!group) return;
  if (!isVisible.value) {
    suspend()
  } else if (!context2d) {
    setupScene()
  } else {
    resume()
  }
}

onMounted(async () => {
  try {
    await loadModelGroup()
  } catch (err) {
    console.error(err)
    errorMessage.value = err instanceof Error ? err.message : String(err)
    return;
  } finally {
    loading.value = false
  }
  syncToVisibility()
})

watch(isVisible, syncToVisibility)

onBeforeUnmount(() => {
  teardownScene()
})

</script>

<template>
  <div ref="containerRef" class="model-viewer" :class="{ expanded, fixed }">
    <canvas ref="canvasRef" tabindex="0"></canvas>
    <Transition name="fade">
      <div v-if="loading" class="loading-cover">
        <NSpin size="large" />
      </div>
    </Transition>
    <div v-if="errorMessage" class="err">{{ errorMessage }}</div>
  </div>
</template>

<style lang="scss" scoped>

.model-viewer {
  position: relative;
  height: 256px;
  width: 256px;

  &.expanded {
    width: auto;
    height: 80vh;
    flex: 1;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
    outline: none;
    --checkerboard-dark: color-mix(in srgb, var(--color-1) 30%, var(--color-0-alt));
    --checkerboard-light: color-mix(in srgb, var(--color-2) 30%, var(--color-0-alt));
    background: conic-gradient(
      var(--checkerboard-light) 0.25turn,
      var(--checkerboard-dark) 0.25turn 0.5turn,
      var(--checkerboard-light) 0.5turn 0.75turn,
      var(--checkerboard-dark) 0.75turn
    ) top left / 16px 16px repeat;

    &:focus-visible {
      outline: 2px solid var(--color-1, #3498db);
      outline-offset: -2px;
    }

    &:active {
      cursor: grabbing;
    }
  }

  &.fixed canvas {
    cursor: default;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  position: absolute;
  opacity: 0;
}

.loading-cover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--background-color);
}

.err {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  color: var(--color-danger);
  font-size: 0.9rem;
}

</style>
