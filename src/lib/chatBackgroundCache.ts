const CACHE_NAME = 'queenchat-chat-backgrounds-v1';
const supported = () => typeof window !== 'undefined' && 'caches' in window;
export const hasChatBackgroundCache = supported;

export async function getCachedChatBackgroundImage(url: string): Promise<string | null> {
  if (!supported()) return null;
  try {
    const response = await caches.open(CACHE_NAME).then(cache => cache.match(url));
    if (!response) return null;
    const blob = await response.blob();
    return blob.size ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}

export async function cacheChatBackgroundImage(url: string): Promise<string | null> {
  if (!supported()) return null;
  try {
    const response = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`background image status ${response.status}`);
    await caches.open(CACHE_NAME).then(cache => cache.put(url, response.clone()));
    const blob = await response.blob();
    return blob.size ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}

export async function deleteCachedChatBackgroundImage(url: string): Promise<void> {
  if (!supported()) return;
  try { await caches.open(CACHE_NAME).then(cache => cache.delete(url)); } catch { /* best effort */ }
}
