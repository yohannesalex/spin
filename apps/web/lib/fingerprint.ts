// Lightweight device fingerprint for multi-account detection (REQ-SEC-05). Not a security
// boundary — just a stable per-device id plus coarse device traits.
export function deviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem('sd_device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('sd_device', id);
    }
    const traits = [screen.width, screen.height, devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language].join('|');
    return `${id}:${traits}`.slice(0, 128);
  } catch {
    return '';
  }
}
