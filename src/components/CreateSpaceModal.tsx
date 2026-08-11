import { useState } from 'react';
import { fetchWithAuth } from '../lib/api';
import Avatar from './Avatar';

type Person = { user_id: string; display_name?: string | null; username: string; avatar?: string };

export default function CreateSpaceModal({ open, chatId, me, other, onClose, onCreated }: { open: boolean; chatId: string; me?: { display_name?: string | null; username?: string; avatar?: string } | null; other?: Person | null; onClose: () => void; onCreated?: () => void }) {
  const [step, setStep] = useState<'confirm' | 'invite'>('confirm'); const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false);
  if (!open || !other) return null;
  const otherName = other.display_name || other.username;
  const create = async () => { setBusy(true); const r = await fetchWithAuth('/spaces/invites', { method: 'POST', body: JSON.stringify({ chat_id: chatId }) }); if (r.ok) { setUrl((await r.json()).invite_url); setStep('invite'); onCreated?.(); } setBusy(false); };
  const copy = async () => { await navigator.clipboard.writeText(url); };
  const share = async () => { if (navigator.share) await navigator.share({ title: 'Наше пространство в QueenChat', text: 'Я создал для нас личное пространство в QueenChat ♡', url }); else await copy(); };
  return <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center" onClick={onClose}>
    <section onClick={e => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-br from-[#2b1648] via-[#4b205f] to-[#6b1f59] p-6 text-center text-white shadow-2xl animate-in">
      <button onClick={onClose} className="float-right rounded-full px-2 text-xl text-white/60 hover:bg-white/10">×</button>
      <div className="mx-auto mt-3 flex items-center justify-center gap-2"><Avatar name={me?.display_name || me?.username || 'Я'} src={me?.avatar} size="lg" /><span className="text-2xl text-pink-200">♡</span><Avatar name={otherName} src={other.avatar} size="lg" /></div>
      {step === 'confirm' ? <><h2 className="mt-6 text-2xl font-semibold">Создать пространство с {otherName}?</h2><p className="mt-3 leading-6 text-violet-100">Ваше личное место для фотографий, моментов, важных дат, заметок и планов.</p><button disabled={busy} onClick={create} className="mt-7 w-full rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 px-5 py-3.5 font-semibold shadow-lg shadow-pink-950/40 disabled:opacity-60">{busy ? 'Создаём…' : 'Создать и пригласить'}</button><button onClick={onClose} className="mt-3 w-full py-3 text-sm text-violet-100">Отмена</button></> : <><p className="mt-6 text-sm font-medium tracking-wide text-pink-200">ПРОСТРАНСТВО СОЗДАНО</p><h2 className="mt-2 text-2xl font-semibold">Осталось пригласить {otherName}</h2><p className="mt-3 text-violet-100">В QueenChat уже ждёт личное приглашение. Отправьте ссылку, если хотите напомнить.</p><button onClick={share} className="mt-6 w-full rounded-2xl bg-white/15 px-5 py-3 font-medium hover:bg-white/20">Отправить в QueenChat</button><div className="mt-3 grid grid-cols-2 gap-3"><button onClick={share} className="rounded-2xl bg-white/10 p-3 text-sm">Поделиться ссылкой</button><button onClick={copy} className="rounded-2xl bg-white/10 p-3 text-sm">Скопировать ссылку</button></div><button onClick={onClose} className="mt-5 text-sm text-violet-100">Готово</button></>}</section>
  </div>;
}
