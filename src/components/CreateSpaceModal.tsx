import { useState } from 'react';
import { fetchWithAuth } from '../lib/api';

export default function CreateSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false);
  if (!open) return null;
  const create = async () => { setBusy(true); const r = await fetchWithAuth('/spaces/invites', { method: 'POST', body: JSON.stringify({}) }); if (r.ok) setUrl((await r.json()).invite_url); setBusy(false); };
  const share = async () => { if (navigator.share) await navigator.share({ title: 'QueenChat', text: 'Я создал для нас пространство в QueenChat 💜\nПрисоединяйся:', url }); else await navigator.clipboard.writeText(url); };
  return <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center"><div className="w-full max-w-md rounded-3xl border border-white/15 bg-gradient-to-br from-violet-900 to-pink-900 p-6 text-white shadow-2xl"><button onClick={onClose} className="float-right text-white/70">×</button><div className="text-4xl">💜</div><h2 className="mt-3 text-2xl font-bold">Пригласить в QueenChat</h2><p className="mt-2 text-purple-100">Создайте ваше место для общения, воспоминаний и планов.</p>{url ? <><input readOnly value={url} className="mt-5 w-full rounded-xl bg-black/20 p-3 text-sm"/><div className="mt-3 flex gap-3"><button onClick={() => navigator.clipboard.writeText(url)} className="flex-1 rounded-xl bg-white/15 p-3">Копировать ссылку</button><button onClick={share} className="flex-1 rounded-xl bg-pink-500 p-3">Поделиться</button></div></> : <button disabled={busy} onClick={create} className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 p-3 font-semibold">{busy ? 'Создаём…' : 'Создать invite'}</button>}</div></div>;
}
