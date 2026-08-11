import { useEffect, useRef, useState } from 'react';
import { claimPlayback, releasePlayback } from '../../lib/playback';

type Props = {
  src: string;
  duration: number;
  waveform?: number[];
  className?: string;
  variant?: 'message' | 'preview';
};

const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

export default function VoiceMessage({ src, duration, waveform = [], className = '', variant = 'message' }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef<number | null>(null);
  const lastPaint = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState(1);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = safeDuration ? Math.max(0, Math.min(1, current / safeDuration)) : 0;
  const bars = Array.isArray(waveform) && waveform.length
    ? waveform.filter(value => Number.isFinite(value)).map(value => Math.max(0, Math.min(1, value)))
    : Array.from({ length: variant === 'preview' ? 56 : 44 }, (_, index) => .25 + ((index * 17) % 60) / 100);

  const syncProgress = () => {
    const element = audio.current;
    if (!element) return;
    const now = performance.now();
    if (now - lastPaint.current >= 33) { lastPaint.current = now; setCurrent(element.currentTime || 0); }
    frame.current = requestAnimationFrame(syncProgress);
  };

  useEffect(() => {
    if (!playing) return;
    frame.current = requestAnimationFrame(syncProgress);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; };
  }, [playing]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (audio.current) { audio.current.pause(); releasePlayback(audio.current); }
  }, []);

  const toggle = async () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) {
      try { claimPlayback(element); await element.play(); setPlaying(true); }
      catch { setPlaying(false); }
    } else { element.pause(); setPlaying(false); }
  };

  const seek = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!safeDuration || !audio.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const value = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * safeDuration;
    audio.current.currentTime = value;
    setCurrent(value);
  };

  return <div className={`flex min-w-0 items-center gap-2 ${variant === 'preview' ? 'w-full max-w-none flex-1' : 'w-full max-w-[min(320px,100%)] sm:min-w-[260px]'} ${className}`}>
    <audio ref={audio} src={src} preload="metadata" onError={() => setPlaying(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => { if (!playing) setCurrent(event.currentTarget.currentTime); }} onEnded={() => { setPlaying(false); setCurrent(0); }} />
    <button type="button" aria-label={playing ? 'Pause voice' : 'Play voice'} onClick={() => void toggle()} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 transition hover:bg-white/30 ${playing ? 'animate-pulse shadow-lg shadow-pink-400/40' : ''}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">{playing ? <path d="M7 5h3v14H7zm7 0h3v14h-3z" /> : <path d="m8 5 11 7-11 7z" />}</svg>
    </button>
    <button type="button" aria-label="Seek voice message" disabled={!safeDuration} onPointerDown={seek} className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-px rounded px-0.5 disabled:cursor-default disabled:opacity-60">
      {bars.map((value, index) => <i key={index} className={`min-w-px flex-1 rounded-full transition-colors duration-100 ${safeDuration && index / bars.length <= progress ? 'bg-pink-300 shadow-[0_0_6px_rgba(244,114,182,.8)]' : 'bg-white/35'}`} style={{ height: `${Math.max(16, value * 100)}%` }} />)}
    </button>
    <div className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-white/90">
      <button type="button" aria-label="Change playback rate" onClick={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; if (audio.current) audio.current.playbackRate = next; setRate(next); }} className="rounded px-1 py-0.5 text-[10px] hover:bg-white/15">{rate}×</button>
      <span>{time(current)} / {time(safeDuration)}</span>
    </div>
  </div>;
}
