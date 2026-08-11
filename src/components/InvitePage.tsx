import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../lib/redux/hooks';
import { fetchWithAuth } from '../lib/api';
import Logo from './Logo';

type Preview = { status: string; creator?: { display_name: string; avatar?: string | null }; expires_at?: number };

export default function InvitePage() {
  const { token = '' } = useParams(); const navigate = useNavigate();
  const user = useAppSelector(state => state.user.user); const [preview, setPreview] = useState<Preview | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetchWithAuth(`/spaces/invites/${encodeURIComponent(token)}/preview`).then(r => r.json()).then(setPreview).catch(() => setPreview({ status: 'invalid' })); }, [token]);
  const accept = async () => {
    if (!user) { sessionStorage.setItem('queenchat_pending_invite', token); navigate('/register'); return; }
    setBusy(true); const r = await fetchWithAuth(`/spaces/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
    if (r.ok) { const data = await r.json(); sessionStorage.removeItem('queenchat_pending_invite'); navigate(`/chat/${data.chat_id}/space`, { replace: true }); }
    else { setPreview({ status: (await r.json()).detail || 'invalid' }); setBusy(false); }
  };
  const stateText: Record<string, string> = { expired: 'Срок действия приглашения истёк', used: 'Приглашение уже использовано', revoked: 'Приглашение больше не действительно', invalid: 'Такого приглашения нет' };
  return <main className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-fuchsia-950 flex items-center justify-center p-5 text-center text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-8 flex justify-center"><Logo variant="full" /></div>
      {preview?.status === 'active' ? <><div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-400 to-violet-500 text-3xl">{preview.creator?.avatar ? <img src={preview.creator.avatar} className="h-full w-full object-cover" /> : '💜'}</div><h1 className="text-2xl font-bold">{preview.creator?.display_name} приглашает вас</h1><p className="mt-2 text-lg text-purple-100">в личное пространство QueenChat</p><p className="mt-6 text-sm leading-6 text-purple-200">Создайте своё место для общения, воспоминаний и совместных планов.</p><button onClick={accept} disabled={busy} className="mt-8 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-pink-500 px-5 py-3 font-semibold shadow-lg disabled:opacity-60">{busy ? 'Подключаем…' : 'Принять приглашение'}</button>{!user && <button onClick={() => { sessionStorage.setItem('queenchat_pending_invite', token); navigate('/login'); }} className="mt-4 text-sm text-purple-200 underline">У меня уже есть аккаунт</button>}</> : <><div className="text-5xl">💌</div><h1 className="mt-5 text-2xl font-bold">{stateText[preview?.status || 'invalid']}</h1><button onClick={() => navigate('/')} className="mt-8 rounded-xl bg-white/10 px-5 py-3">На главную</button></>}
    </section>
  </main>;
}
