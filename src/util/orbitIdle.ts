import { getGlobalTheta, shortestAngleDelta } from './globalRotation'
import type * as ThreeNS from 'three'

export const RETURN_LERP_RATE = 3

export function easeTowardIdle(
  THREE: typeof ThreeNS,
  camera: ThreeNS.PerspectiveCamera,
  target: ThreeNS.Vector3,
  homePhi: number,
  homeRadius: number,
  dt: number,
) {
  const t = 1 - Math.exp(-RETURN_LERP_RATE * dt)
  const offset = camera.position.clone().sub(target)
  const sph = new THREE.Spherical().setFromVector3(offset)
  sph.theta += shortestAngleDelta(getGlobalTheta(), sph.theta) * t
  sph.phi += (homePhi - sph.phi) * t
  sph.radius += (homeRadius - sph.radius) * t
  camera.position.setFromSpherical(sph).add(target)
}
