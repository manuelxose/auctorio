/**
 * Reads what a person pasted into the connect box and says which destination it is.
 * Websites go to discovery with the URL; Instagram and X go to authorization,
 * carrying the handle only as a label (OAuth decides which account connects).
 */
export type ConnectTarget =
  | { kind: 'website'; url: string; label: string }
  | { kind: 'instagram' | 'x'; handle: string | null; label: string }
  | { kind: 'handle'; handle: string; label: string };

const HANDLE = /^@([A-Za-z0-9._]{1,30})$/;
const SOCIAL_HOSTS: Record<string, 'instagram' | 'x'> = {
  'instagram.com': 'instagram',
  'instagr.am': 'instagram',
  'x.com': 'x',
  'twitter.com': 'x',
};

export function detectConnectTarget(raw: string): ConnectTarget | null {
  const input = (raw ?? '').trim();
  if (!input || /\s/.test(input)) return null;

  const handle = HANDLE.exec(input);
  if (handle) return { kind: 'handle', handle: handle[1], label: `@${handle[1]}` };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
  if (!host.includes('.') || host.endsWith('.')) return null;

  const social = SOCIAL_HOSTS[host];
  if (social) {
    const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
    const name = /^[A-Za-z0-9._]{1,30}$/.test(first) && !['p', 'reel', 'stories', 'explore', 'home', 'i', 'intent', 'search'].includes(first) ? first : null;
    const platform = social === 'instagram' ? 'Instagram' : 'X';
    return { kind: social, handle: name, label: name ? `${platform} · @${name}` : platform };
  }

  return { kind: 'website', url: `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`, label: host };
}
