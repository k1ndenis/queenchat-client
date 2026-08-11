let active: HTMLMediaElement | null = null;
export function claimPlayback(element: HTMLMediaElement) {
  if (active && active !== element) active.pause();
  active = element;
}
export function releasePlayback(element: HTMLMediaElement) { if (active === element) active = null; }
