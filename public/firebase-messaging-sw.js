// Handle raw push before Firebase SDK can fall back to the browser default
// "This site has been updated in the background" notification.
self.addEventListener("push", (event) => {
  event.stopImmediatePropagation();

  event.waitUntil((async () => {
    console.log("[QueenChat SW] push received", {
      hasData: !!event.data,
    });
    const payload = parsePushPayload(event);
    console.log("[QueenChat SW] push parsed", {
      type: payload?.data?.type,
      event_type: payload?.data?.event_type,
      data: payload?.data,
    });
    if (!payload) {
      console.warn("[QueenChat SW] push skipped", {
        reason: "payload_parse_failed",
      });
      return;
    }
    await showQueenChatNotification(payload);
  })());
});

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBYuTgtcei69s6c7ihmVeaJ1pAOcCmA8RE",
  authDomain: "queenchat-af2bf.firebaseapp.com",
  projectId: "queenchat-af2bf",
  storageBucket: "queenchat-af2bf.firebasestorage.app",
  messagingSenderId: "948177681269",
  appId: "1:948177681269:web:ba0400c8fcf32e1c67f13c"
});

const clientState = new Map();
const seenNotifications = new Map();
const TEN_MINUTES = 10 * 60 * 1000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "QUEENCHAT_CLIENT_STATE") return;
  if (event.source?.id) {
    clientState.set(event.source.id, {
      ...event.data,
      updatedAt: Date.now(),
    });
  }
});

function cleanupSeen() {
  const now = Date.now();
  for (const [id, timestamp] of seenNotifications.entries()) {
    if (now - timestamp > TEN_MINUTES) seenNotifications.delete(id);
  }
}

function remember(id) {
  cleanupSeen();
  if (!id) return true;
  if (seenNotifications.has(id)) return false;
  seenNotifications.set(id, Date.now());
  return true;
}

function parsePushPayload(event) {
  if (!event.data) return null;

  try {
    const rawPayload = event.data.json();
    const data = rawPayload.data || rawPayload;
    const notification = rawPayload.notification;
    return { data, notification };
  } catch (error) {
    console.warn("[QueenChat SW] Failed to parse push payload", {
      error_type: error?.name || "Error",
      error: error?.message || String(error),
    });
    return null;
  }
}

function normalizePreferences(preferences = {}) {
  return {
    enabled: preferences.enabled !== false,
    messages: preferences.messages !== false,
    directMessages: preferences.directMessages !== false,
    groups: preferences.groups !== false,
    channels: preferences.channels !== false,
    calls: preferences.calls !== false,
    reactions: preferences.reactions !== false,
    sound: preferences.sound !== false,
    vibration: preferences.vibration !== false,
    previewText: preferences.previewText !== false,
    doNotDisturbUntil: preferences.doNotDisturbUntil || null,
    mutedUntil: preferences.mutedUntil || null,
    chatOverrides: preferences.chatOverrides || {},
  };
}

function preferencesAllow(preferences, data) {
  const prefs = normalizePreferences(preferences);
  const now = Date.now();
  const eventType = data.event_type || "message";
  const chatType = data.chat_type || "private";
  const chatId = data.chat_id;

  if (!prefs.enabled) return false;
  if (prefs.mutedUntil && prefs.mutedUntil > now) return false;
  if (prefs.doNotDisturbUntil && prefs.doNotDisturbUntil > now) return false;
  if (chatId) {
    const override = prefs.chatOverrides[chatId];
    if (override?.muted && (!override.mutedUntil || override.mutedUntil > now)) return false;
  }
  if ((eventType.startsWith("call") || eventType === "incoming_call") && !prefs.calls) return false;
  if (eventType === "message_reaction" && !prefs.reactions) return false;
  if (["message", "reply", "mention"].includes(eventType)) {
    if (!prefs.messages) return false;
    if (chatType === "private" && !prefs.directMessages) return false;
    if (chatType === "group" && !prefs.groups) return false;
    if (chatType === "channel" && !prefs.channels) return false;
  }
  return true;
}

async function shouldSuppress(data) {
  const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const chatId = data.chat_id;

  for (const client of allClients) {
    const url = new URL(client.url);
    const pathChatMatch = url.pathname.match(/^\/chat\/([^/?#]+)/);
    const pathChatId = pathChatMatch ? decodeURIComponent(pathChatMatch[1]) : null;
    const state = clientState.get(client.id);
    const activeChatId = state?.activeChatId || pathChatId;
    const isVisible = state?.visible || client.visibilityState === "visible" || client.focused;

    if (chatId && activeChatId === chatId && isVisible) {
      return true;
    }
  }

  return false;
}

function getLatestPreferences() {
  let latest = null;
  for (const state of clientState.values()) {
    if (!latest || state.updatedAt > latest.updatedAt) latest = state;
  }
  return latest?.preferences || {};
}

function buildNotificationOptions(data) {
  const preferences = normalizePreferences(getLatestPreferences());
  const url = data.url || (data.chat_id ? `/chat/${data.chat_id}` : "/chat");
  const body = preferences.previewText ? (data.body || "") : (data.hidden_body || "New message");
  const isCall = (data.event_type || "").startsWith("call") || data.event_type === "incoming_call";
  const isIncomingCall = data.event_type === "incoming_call";

  return {
    body,
    icon: data.icon || data.avatar || data.chat_avatar || "/web-app-manifest-192x192.png",
    badge: data.badge || "/favicon-96x96.png",
    image: data.image || undefined,
    tag: data.tag || (data.chat_id ? `chat:${data.chat_id}` : "queenchat"),
    renotify: data.renotify === "true" || isCall,
    requireInteraction: data.require_interaction === "true" || isCall,
    silent: data.event_type === "incoming_call" || preferences.sound === false || data.silent === "true",
    timestamp: Number(data.created_at || Date.now()),
    vibrate: preferences.vibration === false
      ? undefined
      : (isCall ? [200, 100, 200, 100, 400] : [80, 40, 80]),
    data: {
      url,
      chatId: data.chat_id,
      messageId: data.message_id,
      callId: data.call_id,
      callerId: data.caller_id || data.sender_id,
      callerName: data.caller_name || data.sender_name,
      callType: data.call_type || "video",
      eventType: data.event_type,
    },
    actions: isIncomingCall
      ? [
          { action: "accept_call", title: "Принять" },
          { action: "decline_call", title: "Отклонить" },
        ]
      : [
          { action: "open", title: "Open" },
        ],
  };
}

async function showQueenChatNotification(payload) {
  const data = payload.data || {};
  const eventType = data.event_type || data.type || "message";
  const isIncomingCall = eventType === "incoming_call";
  const id = data.notification_id || data.message_id || `${data.event_type}:${data.chat_id}:${data.created_at}`;
  console.log("[QueenChat SW] notification flow started", {
    event_type: eventType,
    notification_id: id,
    chat_id: data.chat_id,
    call_id: data.call_id,
  });

  if (!isIncomingCall && !remember(id)) {
    console.warn("[QueenChat SW] notification skipped", {
      reason: "duplicate_notification",
      event_type: eventType,
      notification_id: id,
    });
    return;
  }

  if (!isIncomingCall && !preferencesAllow(getLatestPreferences(), data)) {
    console.warn("[QueenChat SW] notification skipped", {
      reason: "preferences_disallow",
      event_type: eventType,
      notification_id: id,
    });
    return;
  }

  if (!isIncomingCall && await shouldSuppress(data)) {
    console.warn("[QueenChat SW] notification skipped", {
      reason: "active_chat_suppression",
      event_type: eventType,
      notification_id: id,
      chat_id: data.chat_id,
    });
    return;
  }

  const title = isIncomingCall
    ? "Входящий звонок"
    : eventType === "message_reaction"
      ? "Новая реакция"
    : (data.title || payload.notification?.title || "QueenChat");
  console.log("[QueenChat SW] showNotification", {
    event_type: eventType,
    title,
    notification_id: id,
    chat_id: data.chat_id,
    call_id: data.call_id,
  });
  await self.registration.showNotification(title, buildNotificationOptions(data));
  if (isIncomingCall) {
    console.log("[QueenChat SW] incoming_call notification created", {
      notification_id: id,
      chat_id: data.chat_id,
      call_id: data.call_id,
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const url = notificationData.url || "/chat";
  const action = event.action || "open";
  event.waitUntil((async () => {
    const targetUrl = new URL(url, self.location.origin);
    if (notificationData.eventType === "incoming_call" && notificationData.callId) {
      targetUrl.searchParams.set("incoming_call", "1");
      targetUrl.searchParams.set("call_action", action);
      targetUrl.searchParams.set("call_id", notificationData.callId);
      if (notificationData.callerId) targetUrl.searchParams.set("caller_id", notificationData.callerId);
      if (notificationData.callerName) targetUrl.searchParams.set("caller_name", notificationData.callerName);
      if (notificationData.callType) targetUrl.searchParams.set("call_type", notificationData.callType);
    }
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of allClients) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === self.location.origin) {
        await client.focus();
        client.postMessage({
          type: "QUEENCHAT_OPEN_NOTIFICATION",
          url: `${targetUrl.pathname}${targetUrl.search}`,
          chatId: notificationData.chatId,
          messageId: notificationData.messageId,
          callId: notificationData.callId,
          callerId: notificationData.callerId,
          callerName: notificationData.callerName,
          callType: notificationData.callType,
          eventType: notificationData.eventType,
          callAction: action,
        });
        return;
      }
    }

    await self.clients.openWindow(targetUrl.href);
  })());
});
