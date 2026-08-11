import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchWithAuth } from '../lib/api';
import { formatEventDate, presentSpaceDate } from '../lib/spaceDates';

type Person = { id: string; display_name: string; avatar?: string | null };
type SpaceDate = { id: string; title: string; event_date: string; emoji?: string; repeats_yearly: boolean };
type SpaceNote = { id: string; title: string; content: string; type: 'note' | 'plan'; due_date?: string | null; completed: boolean };
type SpaceMemory = { id: string; message_id: string; content?: string | null; images?: string[]; media?: { type?: string; url?: string; thumbnail_url?: string }; created_at: number; author: string };
type Space = { chat_id: string; title: string; created_at: number; participants: Person[]; plans: SpaceNote[] };
type DeleteTarget = { kind: 'date' | 'note' | 'memory'; id: string; title?: string; message_id?: string };
type SpaceForm = { title: string; content?: string; note_type?: 'note' | 'plan'; due_date?: string; completed?: boolean; event_date?: string; emoji?: string; repeats_yearly?: boolean };

const sectionTitle: Record<string, string> = { memories: 'Сохранённое', dates: 'Важные даты', notes: 'Планы и заметки' };
const popupClass = 'absolute right-3 top-14 z-20 w-52 rounded-xl border border-white/10 bg-[#2b1744] p-1 shadow-xl';

function Pair({ people }: { people: Person[] }) {
  return <div className="flex justify-center -space-x-3">{people.map(person => <div key={person.id} className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-[#24102f] bg-gradient-to-br from-pink-400 to-violet-500 font-semibold">{person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" /> : person.display_name.slice(0, 1)}</div>)}</div>;
}

function CardMenu({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <><button aria-label={label} aria-expanded={open} onClick={onToggle} className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-xl text-violet-100 hover:bg-white/10">⋯</button>{open && <div className={popupClass}>{children}</div>}</>;
}

function MemoryPreview({ item, compact = false, menuOpen = false, onToggleMenu, onRemove }: { item: SpaceMemory; compact?: boolean; menuOpen?: boolean; onToggleMenu?: () => void; onRemove?: () => void }) {
  const date = new Date(item.created_at * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return <article className={`relative ${compact ? 'rounded-2xl bg-white/10 p-3' : 'rounded-2xl bg-white/10 p-4 pr-14'}`}>
    {!compact && <><CardMenu label="Действия с сохранённым" open={menuOpen} onToggle={onToggleMenu!}><button onClick={onRemove} className="w-full rounded-lg px-3 py-3 text-left text-sm text-red-300 hover:bg-red-500/10">Убрать из сохранённого</button></CardMenu><p className="mb-2 text-xs text-violet-200">{date}</p></>}
    <p className="text-sm font-medium text-pink-100">{item.author}</p>
    {item.content && <p className="mt-1 break-words whitespace-pre-wrap text-sm text-white/90">{item.content}</p>}
    {!!item.images?.length && <div className="mt-3 grid grid-cols-2 gap-2">{item.images.slice(0, compact ? 1 : 4).map(url => <img key={url} src={url} alt="Сохранённое изображение" className="max-h-72 w-full rounded-xl object-cover" />)}</div>}
    {item.media?.type === 'video_note' && item.media.url && <video controls playsInline poster={item.media.thumbnail_url} src={item.media.url} className="mt-3 h-40 max-w-full rounded-full bg-black object-cover" />}
    {item.media?.type === 'voice' && item.media.url && <audio controls src={item.media.url} className="mt-3 max-w-full" />}
  </article>;
}

export default function SpacePage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const location = useLocation();
  const section = location.pathname.split('/space/')[1]?.split('/')[0] || '';
  const [space, setSpace] = useState<Space | null>(null); const [items, setItems] = useState<SpaceNote[]>([]); const [memories, setMemories] = useState<SpaceMemory[]>([]); const [dates, setDates] = useState<SpaceDate[]>([]);
  const [loading, setLoading] = useState(true); const [form, setForm] = useState<SpaceForm | null>(null); const [editing, setEditing] = useState<SpaceNote | SpaceDate | null>(null); const [menuFor, setMenuFor] = useState<string | null>(null); const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null); const [error, setError] = useState<string | null>(null);
  const load = async () => { setLoading(true); const response = await fetchWithAuth(`/spaces/${id}`); setSpace(response.ok ? await response.json() : null); setLoading(false); };
  const loadDates = async () => { const response = await fetchWithAuth(`/spaces/${id}/dates`); if (response.ok) setDates(await response.json()); };
  const loadSection = async () => { const resource = section || 'memories'; const response = await fetchWithAuth(`/spaces/${id}/${resource}`); const data = response.ok ? await response.json() : []; if (section) setItems(data); else setMemories(data); };
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { void loadSection(); }, [id, section]);
  useEffect(() => { if (!section || section === 'dates') void loadDates(); }, [id, section]);
  const nav = (next = '') => navigate(`/chat/${id}/space${next ? `/${next}` : ''}`);
  const startCreate = (isDates: boolean) => { setEditing(null); setForm(isDates ? { title: '', event_date: '', emoji: '❤️', repeats_yearly: true } : { title: '', content: '', note_type: 'note', due_date: '', completed: false }); };
  const startEdit = (item: SpaceNote | SpaceDate, isDates: boolean) => { setMenuFor(null); setEditing(item); setForm(isDates ? { title: item.title, event_date: (item as SpaceDate).event_date, emoji: (item as SpaceDate).emoji || '❤️', repeats_yearly: (item as SpaceDate).repeats_yearly !== false } : { title: item.title, content: (item as SpaceNote).content, note_type: (item as SpaceNote).type, due_date: (item as SpaceNote).due_date || '', completed: (item as SpaceNote).completed }); };
  const save = async () => {
    if (!form) return;
    const resource = section === 'notes' ? 'notes' : 'dates'; const url = editing ? `/spaces/${id}/${resource}/${editing.id}` : `/spaces/${id}/${resource}`;
    const response = await fetchWithAuth(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
    if (!response.ok) { setError('Не удалось сохранить. Попробуйте ещё раз.'); return; }
    setForm(null); setEditing(null); await Promise.all([loadSection(), loadDates(), load()]);
  };
  const togglePlan = async (item: SpaceNote) => {
    const response = await fetchWithAuth(`/spaces/${id}/notes/${item.id}`, { method: 'PUT', body: JSON.stringify({ title: item.title, content: item.content, note_type: 'plan', due_date: item.due_date || '', completed: !item.completed }) });
    if (!response.ok) { setError('Не удалось изменить план. Попробуйте ещё раз.'); return; }
    await Promise.all([loadSection(), load()]);
  };
  const remove = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget; setDeleteTarget(null);
    if (target.kind === 'memory') setItems(previous => previous.filter(item => item.id !== target.id));
    else { setDates(previous => previous.filter(item => item.id !== target.id)); setItems(previous => previous.filter(item => item.id !== target.id)); }
    const url = target.kind === 'memory' ? `/spaces/${id}/memories/${target.message_id}` : `/spaces/${id}/${target.kind === 'note' ? 'notes' : 'dates'}/${target.id}`;
    const response = await fetchWithAuth(url, { method: 'DELETE' });
    if (!response.ok) { setError(target.kind === 'memory' ? 'Не удалось убрать из сохранённого. Попробуйте ещё раз.' : 'Не удалось удалить. Попробуйте ещё раз.'); await Promise.all([loadSection(), loadDates()]); return; }
    await load();
  };
  const datePresentation = (item: SpaceDate) => presentSpaceDate(item.event_date, item.repeats_yearly !== false);
  const featuredDate = useMemo(() => [...dates].sort((a, b) => Number(datePresentation(a).countdown?.match(/\d+/)?.[0] ?? (datePresentation(a).isPast ? '999999' : '0')) - Number(datePresentation(b).countdown?.match(/\d+/)?.[0] ?? (datePresentation(b).isPast ? '999999' : '0')))[0], [dates]);
  if (loading) return <main className="min-h-screen bg-[#140b24]" />;
  if (!space) return <main className="flex min-h-screen items-center justify-center bg-[#140b24] p-6 text-center text-violet-100"><div><p>Это пространство ещё не активно.</p><button onClick={() => navigate(`/chat/${id}`)} className="mt-4 rounded-xl bg-white/10 px-4 py-2">Вернуться в чат</button></div></main>;
  if (section && !sectionTitle[section]) { nav(); return null; }
  if (section) {
    const isDates = section === 'dates'; const isNotes = section === 'notes'; const displayed = isDates ? dates : items;
    return <main className="min-h-screen bg-[#140b24] px-4 py-5 text-white"><div className="mx-auto max-w-2xl"><button onClick={() => nav()} className="min-h-11 px-2 py-2 text-sm text-violet-200">← Наше пространство</button><header className="mt-4 flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{sectionTitle[section]}</h1>{section !== 'memories' && <button onClick={() => startCreate(isDates)} className="min-h-11 shrink-0 rounded-xl bg-pink-500 px-4 py-2 text-sm">Добавить</button>}</header>
      {section === 'memories' && !displayed.length ? <section className="py-16 text-center"><p className="text-3xl">♡</p><h2 className="mt-3 text-lg font-medium">Пока ничего не сохранено</h2><p className="mx-auto mt-2 max-w-sm text-sm text-violet-200">Сохраняйте важные сообщения и фотографии прямо из вашего чата.</p><button onClick={() => navigate(`/chat/${id}`)} className="mt-5 min-h-11 rounded-xl bg-pink-500 px-4 py-2 text-sm">Открыть чат</button></section> : <div className="mt-6 space-y-3">{section === 'memories' ? (displayed as unknown as SpaceMemory[]).map(item => <MemoryPreview key={item.id} item={item} menuOpen={menuFor === item.id} onToggleMenu={() => setMenuFor(menuFor === item.id ? null : item.id)} onRemove={() => { setMenuFor(null); setDeleteTarget({ kind: 'memory', id: item.id, message_id: item.message_id }); }} />) : displayed.length ? displayed.map(item => <article key={item.id} className="relative rounded-2xl bg-white/10 p-4 pr-14">{isDates ? <><b className="block break-words">{(item as SpaceDate).emoji || '❤️'} {item.title}</b><p className="mt-1 text-sm text-violet-200">{formatEventDate((item as SpaceDate).event_date)}</p>{(() => { const presentation = datePresentation(item as SpaceDate); return <div className="mt-3 text-sm"><p className="text-pink-100">{presentation.isPast ? (presentation.countdown ? `Прошло ${presentation.elapsed}` : presentation.elapsed) : presentation.countdown}</p>{presentation.isPast && presentation.countdown && <p className="mt-1 text-violet-200">{presentation.countdown}</p>}</div>; })()}</> : <><b className="block break-words">{item.title}</b>{item.content && <p className="mt-2 whitespace-pre-wrap text-sm text-violet-100">{item.content}</p>}{item.type === 'plan' && <><p className="mt-2 text-sm text-violet-200">{item.due_date ? `До ${formatEventDate(item.due_date)}` : 'Без срока'}</p><button onClick={() => void togglePlan(item)} className="mt-3 min-h-11 text-sm text-pink-200">{item.completed ? '✓ Выполнено' : '○ Отметить выполненным'}</button></>}</>}
        <CardMenu label={isDates ? 'Действия с датой' : 'Действия с заметкой'} open={menuFor === item.id} onToggle={() => setMenuFor(menuFor === item.id ? null : item.id)}><button onClick={() => startEdit(item, isDates)} className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-white/10">Изменить</button><button onClick={() => { setMenuFor(null); setDeleteTarget({ kind: isNotes ? 'note' : 'date', id: item.id, title: item.title }); }} className="w-full rounded-lg px-3 py-3 text-left text-sm text-red-300 hover:bg-red-500/10">Удалить</button></CardMenu>
      </article>) : <p className="py-8 text-center text-violet-200">Здесь пока ничего нет.</p>}</div>}
      {form && <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3 sm:items-center sm:justify-center">
        <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-[#2b1744] p-5 pb-5">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Название" className="w-full rounded-xl bg-white/10 p-3" />
          {isDates ? <>
            <input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} className="mt-3 w-full rounded-xl bg-white/10 p-3" />
            <input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} aria-label="Эмодзи" className="mt-3 w-16 rounded-xl bg-white/10 p-3" />
            <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.repeats_yearly} onChange={e => setForm({ ...form, repeats_yearly: e.target.checked })} />Повторяется каждый год</label>
          </> : <>
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Текст" className="mt-3 min-h-28 w-full rounded-xl bg-white/10 p-3" />
            <label className="mt-3 block text-sm text-violet-200">Тип<select value={form.note_type} onChange={e => setForm({ ...form, note_type: e.target.value as 'note' | 'plan' })} className="mt-1 w-full rounded-xl bg-white/10 p-3 text-white"><option value="note">Заметка</option><option value="plan">План</option></select></label>
            {form.note_type === 'plan' && <>
              <label className="mt-3 block text-sm text-violet-200">Срок<input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="mt-1 w-full rounded-xl bg-white/10 p-3 text-white" /></label>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.completed} onChange={e => setForm({ ...form, completed: e.target.checked })} />Выполнено</label>
            </>}
          </>}
          <div className="mt-4 flex gap-3"><button onClick={() => { setForm(null); setEditing(null); }} className="min-h-12 flex-1 rounded-xl bg-white/10 p-3">Отмена</button><button onClick={() => void save()} className="min-h-12 flex-1 rounded-xl bg-pink-500 p-3">Сохранить</button></div>
        </div>
      </div>}
      {deleteTarget && <div className="fixed inset-0 z-[60] flex items-end bg-black/60 p-3 sm:items-center sm:justify-center"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-[#2b1744] p-5"><h2 className="text-lg font-semibold">{deleteTarget.kind === 'memory' ? 'Убрать из сохранённого?' : `Удалить «${deleteTarget.title}»?`}</h2><div className="mt-5 flex gap-3"><button onClick={() => setDeleteTarget(null)} className="min-h-12 flex-1 rounded-xl bg-white/10 p-3">Отмена</button><button onClick={() => void remove()} className="min-h-12 flex-1 rounded-xl bg-red-500 p-3">{deleteTarget.kind === 'memory' ? 'Убрать' : 'Удалить'}</button></div></div></div>}{error && <div role="alert" className="fixed bottom-5 left-1/2 z-[70] w-[min(360px,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-red-500 px-4 py-3 text-center text-sm shadow-xl">{error}<button className="ml-3 underline" onClick={() => setError(null)}>Закрыть</button></div>}
    </div></main>;
  }
  const hasContent = memories.length || featuredDate || space.plans.length;
  return <main className="min-h-screen bg-[#140b24] px-4 py-5 text-white"><section className="mx-auto max-w-2xl"><button onClick={() => navigate(`/chat/${id}`)} className="min-h-11 px-2 py-2 text-sm text-violet-200">← Назад</button><div className="mt-5 text-center"><Pair people={space.participants} /><h1 className="mt-4 text-2xl font-semibold">{space.title}</h1>{featuredDate && datePresentation(featuredDate).isPast && <p className="mt-2 text-sm text-violet-200">{featuredDate.title}: {datePresentation(featuredDate).elapsed}</p>}</div>{!hasContent ? <section className="mt-10 text-center"><p className="text-violet-200">Сохраняйте важное из чата или добавьте важную дату.</p><div className="mt-5 flex justify-center gap-3"><button onClick={() => nav('dates')} className="min-h-11 rounded-xl bg-pink-500 px-4 py-3 text-sm">Добавить дату</button><button onClick={() => navigate(`/chat/${id}`)} className="min-h-11 rounded-xl bg-white/10 px-4 py-3 text-sm">Открыть чат</button></div></section> : <>{memories.length > 0 && <section className="mt-10 border-t border-white/10 pt-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Сохранённое</h2><button onClick={() => nav('memories')} className="min-h-11 text-sm text-pink-200">Посмотреть всё →</button></div><div className="mt-3 space-y-2">{memories.slice(0, 3).map(item => <MemoryPreview key={item.id} item={item} compact />)}</div></section>}{featuredDate && <section className="mt-7 border-t border-white/10 pt-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Важные даты</h2><button onClick={() => nav('dates')} className="min-h-11 text-sm text-pink-200">Все даты →</button></div>{(() => { const presentation = datePresentation(featuredDate); return <button onClick={() => nav('dates')} className="mt-3 w-full rounded-2xl bg-white/10 p-4 text-left"><b className="block break-words">{featuredDate.emoji || '❤️'} {featuredDate.title}</b><p className="mt-1 text-sm text-violet-200">{formatEventDate(featuredDate.event_date)}</p><p className="mt-3 text-sm text-pink-100">{presentation.isPast ? (presentation.countdown ? `Вместе ${presentation.elapsed}` : presentation.elapsed) : presentation.countdown}</p>{presentation.isPast && presentation.countdown && <p className="mt-1 text-sm text-violet-200">{presentation.countdown}</p>}</button>; })()}</section>}{space.plans.length > 0 && <section className="mt-7 border-t border-white/10 pt-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Планы и заметки</h2><button onClick={() => nav('notes')} className="min-h-11 text-sm text-pink-200">Все →</button></div>{space.plans.slice(0, 3).map(plan => <p key={plan.id} className="mt-3 text-sm">{plan.completed ? '✓' : '○'} {plan.title}</p>)}</section>}</>}<nav className="mt-10 flex justify-around border-t border-white/10 py-5 text-sm text-violet-200"><button className="min-h-11 px-2" onClick={() => nav('memories')}>Сохранённое</button><button className="min-h-11 px-2" onClick={() => nav('dates')}>Даты</button><button className="min-h-11 px-2" onClick={() => nav('notes')}>Заметки</button></nav></section></main>;
}
