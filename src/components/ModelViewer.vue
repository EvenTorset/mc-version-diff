<script setup lang="tsx">
import type { DeltaResult, DeltaTrack } from '@/delta_providers'
import { DeltaTrackState } from '@/delta_providers/states'
import { acquireSharedCamera, releaseSharedCamera, type SharedCamera } from '@/util/sharedCamera'
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
}>()

const IDLE_RETURN_DELAY = 5000
const CAMERA_FOV = 35

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const isVisible = useElementVisible(containerRef)

const loading = ref(true)
const errorMessage = ref('')

let THREE: typeof ThreeNS
let group: ThreeNS.Group | null = null
let animator: ReturnType<typeof createAnimator> | null = null
let homeRadius = 24
let homePhi = 0

let scene: ThreeNS.Scene | null = null
let camera: ThreeNS.PerspectiveCamera | null = null
let renderer: ThreeNS.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let loseContextExt: WEBGL_lose_context | null = null
let resizeObserver: ResizeObserver | null = null

let idle = true
let idleTimer: ReturnType<typeof setTimeout> | null = null
let rafId = 0
let lastFrameTime = 0
let contextActive = false

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
  const raw = await props.dr.getEntry(version, path)
  const model = JSON.parse(new TextDecoder().decode(raw))
  const assets = await versionAssets(props.dr, version)

  const resolved = await resolveModelData(assets, { model })
  const g = new THREE.Group()
  await loadModel(g, assets, resolved, {
    animate: false,
    lighting: 'world',
    display: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] },
  })

  const box = new THREE.Box3().setFromObject(g)
  const center = box.getCenter(new THREE.Vector3())
  g.position.sub(center)

  const size = box.getSize(new THREE.Vector3())
  homeRadius = Math.max(1, Math.hypot(size.x, size.y, size.z)) * 1.6 + 6

  group = g
  animator = createAnimator(g)
}

function resize() {
  if (!renderer || !canvasRef.value) return;
  const w = canvasRef.value.clientWidth
  const h = canvasRef.value.clientHeight
  if (!w || !h) return;
  renderer.setSize(w, h, false)
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

function frame(now: number) {
  rafId = requestAnimationFrame(frame)
  if (!contextActive || !renderer || !camera || !controls || !scene) return;

  if (pairCamera) {
    pairCamera.sync(now)
  } else {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1) || 0
    if (idle) easeTowardIdle(THREE, camera, controls.target, homePhi, homeRadius, dt)
  }
  lastFrameTime = now

  controls.update()

  if (canvasRef.value && canvasRef.value.clientHeight) {
    camera.aspect = canvasRef.value.clientWidth / canvasRef.value.clientHeight
    camera.updateProjectionMatrix()
  }

  animator?.update()
  renderer.render(scene, camera)
}

function setupScene() {
  if (!canvasRef.value || !group) return;

  scene = new THREE.Scene()
  scene.add(group)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  loseContextExt = renderer.getContext().getExtension('WEBGL_lose_context')
  contextActive = true

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasRef.value)
  resize()

  const dir = new THREE.Vector3(-1, 0.75, -1).normalize()
  const dirSpherical = new THREE.Spherical().setFromVector3(dir)
  homePhi = dirSpherical.phi
  const initialTheta = getGlobalTheta()

  if (props.track.state === DeltaTrackState.Edited) {
    pairCameraKey = props.track.id
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

function suspendContext() {
  if (!contextActive) return;
  contextActive = false
  loseContextExt?.loseContext()
}

function resumeContext() {
  if (contextActive || !renderer) return;
  contextActive = true
  loseContextExt?.restoreContext()
  lastFrameTime = performance.now()
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
  if (group) disposeGroupResources(group)
  renderer?.dispose()
  loseContextExt?.loseContext()
  renderer = null
  loseContextExt = null
  scene = null
  camera = null
  contextActive = false
}

function syncToVisibility() {
  if (!group) return;
  if (!isVisible.value) {
    suspendContext()
  } else if (!renderer) {
    setupScene()
  } else {
    resumeContext()
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
  <div ref="containerRef" class="model-viewer" :class="{ expanded }">
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
