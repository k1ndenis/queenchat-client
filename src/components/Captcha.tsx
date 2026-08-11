import { useEffect, useRef } from 'react';

interface CaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function Captcha({ onVerify, onExpire }: CaptchaProps) {
  const target = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !target.current) return;
    const render = () => {
      const turnstile = (window as Window & { turnstile?: { render: (node: Element, options: object) => string } }).turnstile;
      if (turnstile && target.current) turnstile.render(target.current, {
        sitekey: siteKey, callback: onVerify, 'expired-callback': onExpire,
        'error-callback': onExpire, theme: 'dark',
      });
    };
    const existing = document.querySelector('script[data-queenchat-turnstile]');
    if (existing) { render(); return; }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.dataset.queenchatTurnstile = 'true'; script.onload = render;
    document.head.appendChild(script);
  }, [siteKey, onVerify, onExpire]);

  if (!siteKey) return null;
  return <div ref={target} className="flex justify-center" aria-label="Security challenge" />;
}
