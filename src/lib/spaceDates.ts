export type Elapsed = { years: number; days: number; totalDays: number };

const DAY = 86_400_000;

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function todayAtNoon(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function anniversaryFor(event: Date, year: number): Date {
  // 29 February is observed on the last day of February in non-leap years.
  const lastDay = new Date(year, event.getMonth() + 1, 0).getDate();
  return new Date(year, event.getMonth(), Math.min(event.getDate(), lastDay), 12);
}

export function plural(value: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(value) % 100;
  const last = Math.abs(value) % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const daysLabel = (value: number) => `${value} ${plural(value, 'день', 'дня', 'дней')}`;
export const yearsLabel = (value: number) => `${value} ${plural(value, 'год', 'года', 'лет')}`;

export function daysUntil(value: string, now = new Date(), repeatsYearly = false): number {
  const today = todayAtNoon(now);
  let target = localDate(value);
  if (repeatsYearly) {
    target = anniversaryFor(target, today.getFullYear());
    if (target < today) target = anniversaryFor(target, today.getFullYear() + 1);
  }
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / DAY));
}

/** Completed calendar years and remaining full days since an event. */
export function elapsedSince(value: string, now = new Date()): Elapsed {
  const event = localDate(value);
  const today = todayAtNoon(now);
  if (event >= today) return { years: 0, days: 0, totalDays: 0 };
  let years = today.getFullYear() - event.getFullYear();
  if (anniversaryFor(event, today.getFullYear()) > today) years -= 1;
  const anniversary = anniversaryFor(event, event.getFullYear() + years);
  return {
    years,
    days: Math.max(0, Math.round((today.getTime() - anniversary.getTime()) / DAY)),
    totalDays: Math.max(0, Math.round((today.getTime() - event.getTime()) / DAY)),
  };
}

export function elapsedLabel(value: string, now = new Date()): string {
  const elapsed = elapsedSince(value, now);
  if (!elapsed.years) return daysLabel(elapsed.totalDays);
  return elapsed.days ? `${yearsLabel(elapsed.years)} ${daysLabel(elapsed.days)}` : yearsLabel(elapsed.years);
}

export function formatEventDate(value: string): string {
  return localDate(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export type DatePresentation = { isPast: boolean; elapsed?: string; countdown?: string };

export function presentSpaceDate(value: string, repeatsYearly: boolean, now = new Date()): DatePresentation {
  const isPast = localDate(value) < todayAtNoon(now);
  if (!isPast) return { isPast: false, countdown: daysUntil(value, now) ? `Через ${daysLabel(daysUntil(value, now))}` : 'Сегодня' };
  if (!repeatsYearly) return { isPast: true, elapsed: `${daysLabel(elapsedSince(value, now).totalDays)} назад` };
  const until = daysUntil(value, now, true);
  return { isPast: true, elapsed: elapsedLabel(value, now), countdown: until ? `Годовщина через ${daysLabel(until)}` : 'Сегодня годовщина' };
}
