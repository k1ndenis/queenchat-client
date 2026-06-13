import { useEffect, useState } from "react";
import { useAppSelector } from "../lib/redux/hooks";
import {
  requestFCMToken
} from "../lib/firebase";

export default function PushNotification(){
  const { user } =
    useAppSelector(
      state=>state.user
    );

  const [supported,setSupported] =
    useState(false);

  const [subscribed,setSubscribed] =
    useState(false);

  const [loading,setLoading] =
    useState(false);

  useEffect(()=>{
    if(!user)
      return;
    if(
      "Notification" in window &&
      "serviceWorker" in navigator
    ){
      setSupported(true);
    }
  },[user]);

  async function subscribe(){
    try{
      setLoading(true);

      const token =
        await requestFCMToken();

      if(token){
        setSubscribed(true);
      }
    }catch(e){
      console.error(
        e
      );
    }
    finally{
      setLoading(false);
    }
  }

  async function unsubscribe(){
    setLoading(true);

    try{
      await fetch(
        "/api/notifications/push-unsubscribe",
        {
          method:"POST"
        }
      );
      setSubscribed(false);
    }
    finally{
      setLoading(false);
    }
  }

  if(!supported)
    return null;

  if(subscribed){
    return (
      <button
        onClick={unsubscribe}
        disabled={loading}
        className="
        px-4 py-2
        bg-green-500/20
        text-green-400
        rounded-lg
        "
      >
        {loading
          ? "⏳"
          : "✅ Уведомления включены"
        }
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      className="
      px-4 py-2
      bg-purple-500
      text-white
      rounded-lg
      "
    >
      {
        loading
        ? "⏳ Подписка..."
        : "🔔 Включить уведомления"
      }
    </button>
  );
}