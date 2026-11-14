const DISMISS_DISTANCE_PX = 80;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;

export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE_PX || vy > DISMISS_VELOCITY_PX_PER_MS;
}
