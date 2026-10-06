/**
 * AES-256-GCM with key = SHA-256(SETTINGS_KEY). Output: base64url(nonce || ciphertext+tag), the same format core/settings.py
 * reads, so a key saved here can be used by the scheduled Python jobs (they get the same SETTINGS_KEY as a secret).
 */
function settingsSecret(): string | null {
  const s = process.env.SETTINGS_KEY?.trim(); // a pasted secret may carry a trailing newline
  return s && s.length >= 16 ? s : null;
}

export function encryptionReady(): boolean {
  return settingsSecret() !== null;
}

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export async function encrypt(plain: string, secret = settingsSecret()): Promise<string> {
  if (!secret) throw new Error("SETTINGS_KEY is not set");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64url(out);
}

export async function decrypt(token: string, secret = settingsSecret()): Promise<string> {
  if (!secret) throw new Error("SETTINGS_KEY is not set");
  const raw = unb64url(token);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aesKey(secret), raw.slice(12));
  return new TextDecoder().decode(pt);
}
