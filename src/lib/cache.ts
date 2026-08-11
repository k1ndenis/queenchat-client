import type { Chat, ChatInfo } from '../types/chat';
import type { Message, LastMessage } from '../types/message';
import type { User } from '../types/user';

// v2 invalidates pre-display-name participant snapshots so stale private-chat
// titles cannot continue showing usernames after this UI rule changed.
export const CACHE_VERSION = 2;
const DB_NAME = 'queenchat-cache';
const STORE = `v${CACHE_VERSION}`;

type Cached<T> = { data: T; cachedAt: number };
export type CachedChatList = {
  chats: Chat[];
  lastMessages: Array<[string, LastMessage]>;
  unreadCounts: Array<[string, number]>;
  unreadReactions: Array<[string, number]>;
};
export type CachedChatRoom = {
  chat: ChatInfo;
  messages: Message[];
  background: { background_type: 'default' | 'gradient' | 'image'; background_value: string | null; updated_at?: number | null };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, CACHE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as Cached<T> | undefined)?.data ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[cache] read failed', error);
    return null;
  }
}

async function write<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ data, cachedAt: Date.now() } satisfies Cached<T>, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[cache] write failed', error);
  }
}

const userKey = (userId: string) => `user:${userId}`;
const chatListKey = (userId: string) => `chat-list:${userId}`;
const roomKey = (userId: string, chatId: string) => `chat:${userId}:${chatId}`;

export const getCachedUser = (userId: string) => read<User>(userKey(userId));
export const setCachedUser = (user: User) => write(userKey(user.id), user);
export const getCachedChatList = (userId: string) => read<CachedChatList>(chatListKey(userId));
export const setCachedChatList = (userId: string, value: CachedChatList) => write(chatListKey(userId), value);
export const getCachedChatRoom = (userId: string, chatId: string) => read<CachedChatRoom>(roomKey(userId, chatId));
export const setCachedChatRoom = (userId: string, chatId: string, value: CachedChatRoom) => write(roomKey(userId, chatId), value);

export async function clearUserCache(userId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        if (String(cursor.key).includes(`:${userId}`)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) { console.warn('[cache] clear failed', error); }
}

export function currentSessionUserId(): string | null {
  try {
    const token = document.cookie.split('; ').find(row => row.startsWith('access_token='))?.split('=')[1];
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=');
    return JSON.parse(atob(padded)).user_id ?? null;
  } catch { return null; }
}
