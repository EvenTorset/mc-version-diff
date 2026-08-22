import { easeTowardIdle } from './orbitIdle'
import type * as ThreeNS from 'three'

const IDLE_RETURN_DELAY = 5000

interface Entry {
  camera: ThreeNS.PerspectiveCamera
  target: ThreeNS.Vector3
  homePhi: number
  homeRadius: number
  owner: symbol | null
  idleTimer: ReturnType<typeof setTimeout> | null
  lastTickTime: number
  refCount: number
}

const registry = new Map<string, Entry>()

export class SharedCamera {
  constructor(private THREE: typeof ThreeNS, private entry: Entry) {}

  get camera(): ThreeNS.PerspectiveCamera {
    return this.entry.camera
  }

  get homeRadius(): number {
    return this.entry.homeRadius
  }

  growHomeRadius(radius: number) {
    if (radius > this.entry.homeRadius) this.entry.homeRadius = radius
  }

  claim(ownerId: symbol): boolean {
    if (this.entry.owner !== null && this.entry.owner !== ownerId) return false
    if (this.entry.idleTimer !== null) {
      clearTimeout(this.entry.idleTimer)
      this.entry.idleTimer = null
    }
    this.entry.owner = ownerId
    return true
  }

  release(ownerId: symbol) {
    if (this.entry.owner !== ownerId) return;
    if (this.entry.idleTimer !== null) clearTimeout(this.entry.idleTimer)
    this.entry.idleTimer = setTimeout(() => {
      this.entry.owner = null
    }, IDLE_RETURN_DELAY)
  }

  sync(now: number) {
    if (this.entry.owner !== null) {
      this.entry.lastTickTime = now
      return;
    }
    const dt = Math.min((now - this.entry.lastTickTime) / 1000, 0.1) || 0
    this.entry.lastTickTime = now
    if (dt <= 0) return;
    easeTowardIdle(this.THREE, this.entry.camera, this.entry.target, this.entry.homePhi, this.entry.homeRadius, dt)
  }
}

export function acquireSharedCamera(
  THREE: typeof ThreeNS,
  key: string,
  homeTheta: number,
  homePhi: number,
  homeRadius: number,
): SharedCamera {
  let entry = registry.get(key)
  if (!entry) {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000)
    const target = new THREE.Vector3()
    camera.position.setFromSpherical(new THREE.Spherical(homeRadius, homePhi, homeTheta))
    entry = {
      camera,
      target,
      homePhi,
      homeRadius,
      owner: null,
      idleTimer: null,
      lastTickTime: performance.now(),
      refCount: 0,
    }
    registry.set(key, entry)
  } else if (homeRadius > entry.homeRadius) {
    entry.homeRadius = homeRadius
  }
  entry.refCount++
  return new SharedCamera(THREE, entry)
}

export function releaseSharedCamera(key: string) {
  const entry = registry.get(key)
  if (!entry) return;
  entry.refCount--
  if (entry.refCount <= 0) {
    if (entry.idleTimer !== null) clearTimeout(entry.idleTimer)
    registry.delete(key)
  }
}
