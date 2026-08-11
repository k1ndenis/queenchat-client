import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";
import { fetchWithAuth } from "./api";

const NATIVE_DEVICE_ID_KEY = "queenchat_native_push_device_id";
const NATIVE_PUSH_VERSION = "android_capacitor";
const PENDING_INCOMING_CALL_KEY = "queenchat_pending_incoming_call";

let nativePushInitPromise: Promise<string | null> | null = null;
let nativeListenersAttached = false;

type NativePendingCallAction = {
  hasAction: boolean;
  action?: "accept_call";
  call_id?: string;
  chat_id?: string;
  caller_id?: string;
  caller_name?: string;
  caller_avatar?: string;
  call_type?: string;
};

const NativeCall = registerPlugin<{
  getPendingAction(): Promise<NativePendingCallAction>;
  clearPendingAction(): Promise<void>;
}>("NativeCall");

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function getPendingNativeCallAction(): Promise<NativePendingCallAction | null> {
  if (!isNativeAndroid()) return null;
  try {
    const action = await NativeCall.getPendingAction();
    return action.hasAction ? action : null;
  } catch (error) {
    console.warn("[CallResume] native pending action read failed", error);
    return null;
  }
}

export async function clearPendingNativeCallAction() {
  if (!isNativeAndroid()) return;
  try {
    await NativeCall.clearPendingAction();
  } catch (error) {
    console.warn("[CallResume] native pending action clear failed", error);
  }
}

function getNativeDeviceId() {
  let deviceId = localStorage.getItem(NATIVE_DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : `android-${Date.now()}-${Math.random()}`;
    localStorage.setItem(NATIVE_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function normalizeOpenUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "queenchat:" && parsed.hostname === "chat") {
      return `/chat/${parsed.pathname.replace(/^\/+/, "")}${parsed.search}`;
    }
    if (parsed.protocol === "queenchat:" && parsed.pathname.startsWith("/chat/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
    if (parsed.protocol === "https:" && (parsed.hostname === "queenchat.ru" || parsed.hostname === "www.queenchat.ru")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return null;
  }
  return null;
}

function openTrustedUrl(url?: string) {
  if (!url) return;
  const normalized = normalizeOpenUrl(url);
  if (normalized) {
    window.location.assign(normalized);
  }
}

function extractData(notification: PushNotificationSchema) {
  const data = notification.data || {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? undefined : String(value)])
  ) as Record<string, string | undefined>;
}

function saveNativePendingIncomingCall(data: Record<string, string | undefined>) {
  if ((data.event_type || data.type) !== "incoming_call") return;
  const callId = data.call_id;
  const callerId = data.caller_id || data.sender_id;
  const chatId = data.chat_id;
  if (!callId || !callerId || !chatId) return;

  const call = {
    callId,
    from: callerId,
    callerName: data.caller_name || data.sender_name,
    callerAvatar: data.caller_avatar || data.avatar,
    chatId,
    callType: data.call_type || "video",
    expiresAt: Date.now() + 35000,
  };
  localStorage.setItem(PENDING_INCOMING_CALL_KEY, JSON.stringify(call));
  window.dispatchEvent(new CustomEvent("pending_incoming_call_updated", { detail: call }));
}

function attachNativeListeners() {
  if (nativeListenersAttached) return;
  nativeListenersAttached = true;

  App.addListener("appUrlOpen", (event) => {
    window.dispatchEvent(new CustomEvent("native_app_url_open", { detail: { url: event.url } }));
    openTrustedUrl(event.url);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const data = extractData(notification);
    console.info("[NativeFCM] message received", { event_type: data.event_type || data.type, chat_id: data.chat_id });
    saveNativePendingIncomingCall(data);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = extractData(event.notification);
    saveNativePendingIncomingCall({
      ...data,
      event_type: data.event_type || data.type,
    });
    openTrustedUrl(data.url || (data.chat_id ? `https://queenchat.ru/chat/${data.chat_id}` : "https://queenchat.ru/chat"));
  });
}

async function registerNativeToken(token: string, permission: string) {
  console.info("[NativeFCM] backend registration started", {
    device_id: getNativeDeviceId(),
    token_len: token.length,
  });
  const response = await fetchWithAuth("/notifications/fcm-token", {
    method: "POST",
    body: JSON.stringify({
      token,
      device_id: getNativeDeviceId(),
      platform: NATIVE_PUSH_VERSION,
      permission,
      sw_version: NATIVE_PUSH_VERSION,
      settings: {},
    }),
  });
  if (!response.ok) {
    console.warn("[NativeFCM] backend registration failed", { status: response.status });
    throw new Error(`FCM token registration failed: ${response.status}`);
  }
  console.info("[NativeFCM] backend registration success", { status: response.status });
}

export async function requestNativePushToken() {
  if (!isNativeAndroid()) return null;
  if (nativePushInitPromise) return nativePushInitPromise;

  nativePushInitPromise = (async () => {
    attachNativeListeners();

    console.info("[NativeFCM] registration started");

    await PushNotifications.createChannel({
      id: "queenchat_calls",
      name: "QueenChat calls",
      description: "Incoming video calls",
      importance: 5,
      visibility: 1,
      sound: "ringtone",
      vibration: true,
      lights: true,
      lightColor: "#D946EF",
    });
    await PushNotifications.createChannel({
      id: "queenchat_messages",
      name: "QueenChat messages",
      description: "New messages, replies and reactions",
      importance: 3,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#D946EF",
    });

    const current = await PushNotifications.checkPermissions();
    const permission = current.receive === "granted"
      ? current.receive
      : (await PushNotifications.requestPermissions()).receive;
    console.info("[NativeFCM] permission", { permission });
    if (permission !== "granted") {
      console.warn("[NativeFCM] registration skipped: notification permission is not granted", { permission });
      return null;
    }

    return new Promise<string | null>((resolve) => {
      let settled = false;
      const settle = (token: string | null) => {
        if (settled) return;
        settled = true;
        resolve(token);
      };

      PushNotifications.addListener("registration", async ({ value }) => {
        try {
          console.info("[NativeFCM] token received", { token_len: value.length });
          await registerNativeToken(value, permission);
          settle(value);
        } catch (error) {
          console.warn("[NativeFCM] backend registration failed", { error: error instanceof Error ? error.message : String(error) });
          settle(null);
        }
      });
      PushNotifications.addListener("registrationError", (error) => {
        console.warn("[NativeFCM] registration error", error);
        settle(null);
      });
      PushNotifications.register();
      window.setTimeout(() => settle(null), 10000);
    });
  })();

  try {
    return await nativePushInitPromise;
  } finally {
    nativePushInitPromise = null;
  }
}

export async function removeNativePushToken() {
  if (!isNativeAndroid()) return;
  await fetchWithAuth(`/notifications/fcm-token?device_id=${encodeURIComponent(getNativeDeviceId())}`, {
    method: "DELETE",
  });
}
