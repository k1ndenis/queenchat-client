import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

const messaging = getMessaging(app);

let subscriptionPromise: Promise<string | null> | null = null;
let isSubscribed = false;

export async function requestFCMToken() {
  if (isSubscribed) {
    return null;
  }
  
  if (subscriptionPromise) {
    return subscriptionPromise;
  }

  subscriptionPromise = (async () => {
    try {
      if (!("Notification" in window)) return null;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return null;

      const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js")
        || await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration,
      });

      console.log("FCM TOKEN:", token);

      if (token) {
        await fetch("/api/notifications/fcm-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        isSubscribed = true;
      }

      return token;
    } finally {
      subscriptionPromise = null;
    }
  })();

  return subscriptionPromise;
}

export function onFCMListener() {
  onMessage(messaging, (payload) => {
    console.log("📩 FOREGROUND PUSH:", payload);
  });
}