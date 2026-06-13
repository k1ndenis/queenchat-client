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

const messaging = firebase.messaging();

// Firebase сам покажет уведомление автоматически — не нужно вызывать showNotification
messaging.onBackgroundMessage((payload) => {
  console.log("Background push received:", payload);
});