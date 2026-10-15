// REQ-SEC-04: Cloudflare Turnstile bot protection on registration (skipped when not configured).
export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean };
  return json.success === true;
}
