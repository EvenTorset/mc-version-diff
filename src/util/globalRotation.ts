const ROTATE_SPEED = 0.35

let theta = 0
let rafId = 0
let lastTick = 0

function tick(now: number) {
  rafId = requestAnimationFrame(tick)
  const dt = Math.min((now - lastTick) / 1000, 0.1) || 0
  lastTick = now
  theta -= dt * ROTATE_SPEED
}

function ensureRunning() {
  if (rafId) return;
  lastTick = performance.now()
  rafId = requestAnimationFrame(tick)
}

export function getGlobalTheta(): number {
  ensureRunning()
  return theta
}

export function shortestAngleDelta(target: number, current: number): number {
  const twoPi = Math.PI * 2
  let delta = (target - current) % twoPi
  if (delta > Math.PI) delta -= twoPi
  else if (delta < -Math.PI) delta += twoPi
  return delta
}
