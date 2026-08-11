import { useEffect, useRef, useState } from 'react';
import { claimPlayback, releasePlayback } from '../../lib/playback';

type Props = { src: string; poster?: string; duration: number; className?: string };

export default function VideoNote({ src, poster, duration, className = '' }: Props) {
  const video = useRef<HTMLVideoElement>(null), frame = useRef<number | null>(null), lastPaint = useRef(0);
  const [playing, setPlaying] = useState(false), [progress, setProgress] = useState(0);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const sync = () => { const element = video.current; if (!element) return; const now = performance.now(); if (now - lastPaint.current >= 33) { lastPaint.current = now; setProgress(safeDuration ? element.currentTime / safeDuration : 0); } frame.current = requestAnimationFrame(sync); };
  useEffect(() => { if (!playing) return; frame.current = requestAnimationFrame(sync); return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }; }, [playing, safeDuration]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); if (video.current) { video.current.pause(); releasePlayback(video.current); } }, []);
  const toggle = async () => { const element = video.current; if (!element) return; if (element.paused) { try { claimPlayback(element); await element.play(); setPlaying(true); } catch { setPlaying(false); } } else element.pause(); };
  const circumference = 2 * Math.PI * 46, offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  return <div className={`relative block h-40 w-40 max-w-full sm:h-52 sm:w-52 md:h-56 md:w-56 ${className}`}>
    <svg aria-hidden="true" viewBox="0 0 100 100" className={`pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)] -rotate-90 ${playing ? 'drop-shadow-[0_0_4px_rgba(236,72,153,.45)]' : ''}`}><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2"/><circle cx="50" cy="50" r="46" fill="none" stroke="url(#video-note-progress)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-75"/><defs><linearGradient id="video-note-progress" x1="0" y1="0" x2="100" y2="100"><stop stopColor="#c084fc"/><stop offset="1" stopColor="#f472b6"/></linearGradient></defs></svg>
    <button type="button" aria-label={playing ? 'Pause video message' : 'Play video message'} onClick={() => void toggle()} className="relative block h-full w-full overflow-hidden rounded-full bg-black shadow-lg"><video ref={video} src={src} poster={poster} playsInline preload="metadata" className="h-full w-full object-cover" onError={() => setPlaying(false)} onTimeUpdate={event => { if (!playing) setProgress(safeDuration ? event.currentTarget.currentTime / safeDuration : 0); }} onPause={() => setPlaying(false)} onEnded={event => { event.currentTarget.currentTime = 0; setPlaying(false); setProgress(0); }} />{!playing && <span className="absolute inset-0 flex items-center justify-center bg-black/20"><svg viewBox="0 0 24 24" className="h-11 w-11 fill-white drop-shadow"><path d="m8 5 11 7-11 7z" /></svg></span>}</button>
  </div>;
}
