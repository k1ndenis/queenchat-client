import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";
import { fetchWithAuth } from "./api";
import { isNativeAndroid, removeNativePushToken, requestNativePushToken } from "./native";

type NotificationPreferences = {
  enabled: boolean;
  messages: boolean;
  directMessages: boolean;
  groups: boolean;
  channels: boolean;
  calls: boolean;
  reactions: boolean;
  sound: boolean;
  vibration: boolean;
  previewText: boolean;
  doNotDisturbUntil: number | null;
  mutedUntil: number | null;
  chatOverrides: Record<string, { muted: boolean; mutedUntil: number | null }>;
};

type PendingIncomingCall = {
  callId: string;
  from: string;
  callerName?: string;
  chatId: string;
  callType: string;
  offer?: unknown;
  expiresAt: number;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  messages: true,
  directMessages: true,
  groups: true,
  channels: true,
  calls: true,
  reactions: true,
  sound: true,
  vibration: true,
  previewText: true,
  doNotDisturbUntil: null,
  mutedUntil: null,
  chatOverrides: {},
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const PENDING_INCOMING_CALL_KEY = "queenchat_pending_incoming_call";
const FCM_SW_VERSION = "firebase-messaging-sw-v2";

let subscriptionPromise: Promise<string | null> | null = null;
let foregroundUnsubscribe: (() => void) | null = null;
let messagingPromise: ReturnType<typeof getMessagingAsync> | null = null;

async function getMessagingAsync() {
  if (!(await isSupported())) {
    return null;
  }
  return getMessaging(app);
}

function getDeviceId() {
  const key = "queenchat_push_device_id";
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

export function getNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem("queenchat_notification_preferences");
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
      chatOverrides: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.chatOverrides,
        ...(parsed.chatOverrides || {}),
      },
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(preferences: Partial<NotificationPreferences>) {
  const next = { ...getNotificationPreferences(), ...preferences };
  localStorage.setItem("queenchat_notification_preferences", JSON.stringify(next));
  updateServiceWorkerState();
  syncNotificationSettings().catch((error) => {
    console.warn("Notification settings sync failed:", error);
  });
  return next;
}

function getActiveChatIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/chat\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function savePendingIncomingCall(call: PendingIncomingCall) {
  if (!call.callId || !call.from || !call.chatId) return;
  localStorage.setItem(PENDING_INCOMING_CALL_KEY, JSON.stringify(call));
  window.dispatchEvent(new CustomEvent("pending_incoming_call_updated", { detail: call }));
}

export function savePendingIncomingCallFromData(data: Record<string, string | undefined>) {
  if (data.event_type !== "incoming_call") return;
  const callId = data.call_id;
  const callerId = data.caller_id || data.sender_id;
  const chatId = data.chat_id;
  if (!callId || !callerId || !chatId) return;
  savePendingIncomingCall({
    callId,
    from: callerId,
    callerName: data.caller_name || data.sender_name,
    chatId,
    callType: data.call_type || "video",
    expiresAt: Date.now() + 35000,
  });
}

function isAllowedByPreferences(data: Record<string, string | undefined>) {
  const preferences = getNotificationPreferences();
  const now = Date.now();
  const chatId = data.chat_id;
  const eventType = data.event_type || "message";
  const chatType = data.chat_type || "private";

  if (!preferences.enabled) return false;
  if (preferences.mutedUntil && preferences.mutedUntil > now) return false;
  if (preferences.doNotDisturbUntil && preferences.doNotDisturbUntil > now) return false;
  if (chatId) {
    const chatOverride = preferences.chatOverrides[chatId];
    if (chatOverride?.muted && (!chatOverride.mutedUntil || chatOverride.mutedUntil > now)) return false;
  }
  if ((eventType.startsWith("call") || eventType === "incoming_call") && !preferences.calls) return false;
  if (eventType === "message_reaction" && !preferences.reactions) return false;
  if (eventType === "message" || eventType === "reply" || eventType === "mention") {
    if (!preferences.messages) return false;
    if (chatType === "private" && !preferences.directMessages) return false;
    if (chatType === "group" && !preferences.groups) return false;
    if (chatType === "channel" && !preferences.channels) return false;
  }
  return true;
}

function rememberNotification(id: string) {
  const key = "queenchat_seen_push_ids";
  const now = Date.now();
  const raw = localStorage.getItem(key);
  const seen: Record<string, number> = raw ? JSON.parse(raw) : {};
  Object.entries(seen).forEach(([seenId, timestamp]) => {
    if (now - timestamp > 10 * 60 * 1000) delete seen[seenId];
  });
  if (seen[id]) return false;
  seen[id] = now;
  localStorage.setItem(key, JSON.stringify(seen));
  return true;
}

function canShowForeground(payload: MessagePayload) {
  const data = payload.data || {};
  const notificationId = data.notification_id || data.message_id || `${data.event_type}:${data.chat_id}:${data.created_at}`;
  if (!notificationId || !rememberNotification(notificationId)) return false;
  if (!isAllowedByPreferences(data)) return false;
  if (document.visibilityState !== "visible") return false;

  const activeChatId = getActiveChatIdFromPath();
  if (activeChatId && data.chat_id === activeChatId) return false;
  return Notification.permission === "granted";
}

function getNotificationBody(data: Record<string, string | undefined>, fallback?: string) {
  return getNotificationPreferences().previewText ? (data.body || fallback || "") : "New message";
}

function showForegroundNotification(payload: MessagePayload) {
  savePendingIncomingCallFromData(payload.data || {});
  if (!canShowForeground(payload)) return;

  const data = payload.data || {};
  const title = data.title || payload.notification?.title || "QueenChat";
  const body = getNotificationBody(data, payload.notification?.body);
  const options: NotificationOptions & { renotify?: boolean; timestamp?: number } = {
    body,
    icon: data.icon || data.avatar || "/web-app-manifest-192x192.png",
    badge: data.badge || "/favicon-96x96.png",
    tag: data.tag || (data.chat_id ? `chat:${data.chat_id}` : "queenchat"),
    renotify: data.renotify === "true",
    silent: data.event_type === "incoming_call" || getNotificationPreferences().sound === false,
    timestamp: Number(data.created_at || Date.now()),
    data: {
      url: data.url || (data.chat_id ? `/chat/${data.chat_id}` : "/chat"),
    },
  };
  const notification = new Notification(title, options);

  notification.onclick = () => {
    window.focus();
    const url = notification.data?.url || "/chat";
    window.location.assign(url);
    notification.close();
  };
}

export async function syncNotificationSettings() {
  const preferences = getNotificationPreferences();
  await fetchWithAuth(`/notifications/fcm-settings?device_id=${encodeURIComponent(getDeviceId())}`, {
    method: "PUT",
    body: JSON.stringify({
      device_id: getDeviceId(),
      enabled: preferences.enabled,
      messages: preferences.messages,
      direct_messages: preferences.directMessages,
      groups: preferences.groups,
      channels: preferences.channels,
      calls: preferences.calls,
      reactions: preferences.reactions,
      preview_text: preferences.previewText,
      sound: preferences.sound,
      vibration: preferences.vibration,
      do_not_disturb_until: preferences.doNotDisturbUntil,
      muted_until: preferences.mutedUntil,
      chat_overrides: preferences.chatOverrides,
    }),
  });
}

export async function requestFCMToken() {
  if (isNativeAndroid()) {
    return requestNativePushToken();
  }

  if (subscriptionPromise) {
    console.log("[FCM Debug] reuse pending token subscription");
    return subscriptionPromise;
  }

  subscriptionPromise = (async () => {
    try {
      console.log("[FCM Debug] token registration started", {
        hasNotification: "Notification" in window,
        hasServiceWorker: "serviceWorker" in navigator,
      });
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        console.warn("[FCM Debug] token registration skipped: unsupported browser");
        return null;
      }
      if (Notification.permission === "denied") {
        console.warn("[FCM Debug] token registration skipped: permission denied");
        return null;
      }

      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      console.log("[FCM Debug] notification permission result", { permission });
      if (permission !== "granted") {
        console.warn("[FCM Debug] token registration skipped: permission not granted", { permission });
        return null;
      }

      const messaging = await (messagingPromise || (messagingPromise = getMessagingAsync()));
      if (!messaging) {
        console.warn("[FCM Debug] token registration skipped: firebase messaging unsupported");
        return null;
      }

      const existingRegistration = await navigator.serviceWorker.getRegistration("/");
      const activeScriptUrl = existingRegistration?.active?.scriptURL
        || existingRegistration?.waiting?.scriptURL
        || existingRegistration?.installing?.scriptURL
        || "";
      console.log("[FCM Debug] service worker registration resolved", {
        existing_script: activeScriptUrl,
        needs_register: !activeScriptUrl.endsWith("/firebase-messaging-sw.js"),
      });
      const registration = activeScriptUrl.endsWith("/firebase-messaging-sw.js")
        ? existingRegistration
        : await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });

      await navigator.serviceWorker.ready;
      updateServiceWorkerState(registration);
      console.log("[FCM Debug] service worker ready", {
        active_script: registration?.active?.scriptURL,
        scope: registration?.scope,
        sw_version: FCM_SW_VERSION,
      });

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration,
      });
      console.log("[FCM Debug] getToken result", {
        has_token: !!token,
        token_len: token?.length || 0,
      });

      if (token) {
        const response = await fetchWithAuth("/notifications/fcm-token", {
          method: "POST",
          body: JSON.stringify({
            token,
            device_id: getDeviceId(),
            platform: navigator.userAgent,
            permission,
            sw_version: FCM_SW_VERSION,
            settings: getNotificationPreferences(),
          }),
        });
        console.log("[FCM Debug] fcm-token POST result", {
          status: response.status,
          ok: response.ok,
          device_id: getDeviceId(),
          sw_version: FCM_SW_VERSION,
        });
      }

      return token || null;
    } catch (error) {
      console.warn("FCM token registration failed:", error);
      return null;
    } finally {
      subscriptionPromise = null;
    }
  })();

  return subscriptionPromise;
}

export async function removeFCMToken() {
  if (isNativeAndroid()) {
    await removeNativePushToken();
    return;
  }

  try {
    await fetchWithAuth(`/notifications/fcm-token?device_id=${encodeURIComponent(getDeviceId())}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.warn("FCM token removal failed:", error);
  }
}

export function onFCMListener() {
  if (isNativeAndroid()) {
    return () => {};
  }

  if (foregroundUnsubscribe) return foregroundUnsubscribe;

  getMessagingAsync().then((messaging) => {
    if (!messaging || foregroundUnsubscribe) return;
    foregroundUnsubscribe = onMessage(messaging, showForegroundNotification);
  }).catch((error) => {
    console.warn("FCM foreground listener failed:", error);
  });

  return () => {
    foregroundUnsubscribe?.();
    foregroundUnsubscribe = null;
  };
}

export function updateServiceWorkerState(registration?: ServiceWorkerRegistration) {
  if (!("serviceWorker" in navigator)) return;
  const target = registration?.active || navigator.serviceWorker.controller;
  target?.postMessage({
    type: "QUEENCHAT_CLIENT_STATE",
    path: window.location.pathname,
    activeChatId: getActiveChatIdFromPath(),
    visible: document.visibilityState === "visible",
    focused: document.hasFocus(),
    preferences: getNotificationPreferences(),
  });
}

export function updateAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0 && nav.setAppBadge) {
    nav.setAppBadge(count).catch(() => {});
  } else if (count <= 0 && nav.clearAppBadge) {
    nav.clearAppBadge().catch(() => {});
  }
}
