/**
 * Yayın takvimi (Bölüm 7.4): seçilen günlerde ve saatte, sitenin saat diliminde.
 * Yeni sitelerde ilk 4 hafta haftada en fazla 3 yazı (aşırı yayın riski, Bölüm 1).
 */
export const NEW_SITE_WEEKLY_CAP = 3;
const NEW_SITE_WEEKS = 4;

/** Verilen anda saat diliminin UTC'den farkı (dakika). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Saat dilimindeki yerel tarih/saati UTC `Date`'e çevirir (yaz saati geçişleri dahil). */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - offsetMinutes(guess, timeZone) * 60_000;
  result = guess - offsetMinutes(result, timeZone) * 60_000;
  return new Date(result);
}

/** Saat diliminde bugünün tarihi ve haftanın günü (0 = Pazar). */
export function localDate(now: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * `count` adet yayın zamanı üretir: yarından (ya da `after` gününden sonra) başlayarak `days` günlerinde
 * `time` saatinde.
 * `newSite` ise ilk 4 hafta haftada en fazla 3 yazı.
 */
export function planPublishDates(opts: {
  count: number;
  days: number[];
  time: string;
  timeZone: string;
  now?: Date;
  newSite?: boolean;
  /** Bu andan sonraki ilk uygun günden başlar (takvimin sonuna ekleme); verilmezse yarından */
  after?: Date | null;
}): Date[] {
  const days = [...new Set(opts.days)].filter((d) => d >= 0 && d <= 6).sort();
  if (opts.count <= 0 || days.length === 0) return [];
  const timeZone = isValidTimeZone(opts.timeZone) ? opts.timeZone : 'UTC';
  const [hour, minute] = opts.time.split(':').map(Number) as [number, number];
  const now = opts.now ?? new Date();
  const from = opts.after && opts.after.getTime() > now.getTime() ? opts.after : now;
  const today = localDate(from, timeZone);
  const start = Date.UTC(today.year, today.month - 1, today.day);

  const dates: Date[] = [];
  const perWeek = new Map<number, number>();
  for (let offset = 1; dates.length < opts.count && offset < 400; offset++) {
    const d = new Date(start + offset * 86_400_000);
    if (!days.includes(d.getUTCDay())) continue;
    const week = Math.floor((offset - 1) / 7);
    if (opts.newSite && week < NEW_SITE_WEEKS && (perWeek.get(week) ?? 0) >= NEW_SITE_WEEKLY_CAP) continue;
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
    dates.push(zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute, timeZone));
  }
  return dates;
}

/** Bir anın saat dilimindeki saat ve dakikası. */
export function localTime(at: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { hour: get('hour') % 24, minute: get('minute') };
}

/**
 * Takvimde sürükle-bırak (Bölüm 7.13): yazıyı sitenin saat diliminde başka bir güne taşır, saat
 * korunur (yoksa sitenin yayın saati). Geçmiş bir ana düşerse null.
 */
export function moveToDate(opts: { date: string; current: Date | null; publishTime: string; timeZone: string; now?: Date }): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opts.date);
  if (!m) return null;
  const timeZone = isValidTimeZone(opts.timeZone) ? opts.timeZone : 'UTC';
  const [publishHour, publishMinute] = opts.publishTime.split(':').map(Number) as [number, number];
  const { hour, minute } = opts.current ? localTime(opts.current, timeZone) : { hour: publishHour, minute: publishMinute };
  const result = zonedTime(Number(m[1]), Number(m[2]), Number(m[3]), hour, minute, timeZone);
  return result.getTime() > (opts.now ?? new Date()).getTime() ? result : null;
}

/** Haftalık sıklığa göre önerilen günler (Pzt, Çar, Cum...); site günleri seçilmemişse. */
export function defaultPublishDays(perWeek: number): number[] {
  const order = [1, 3, 5, 2, 4, 6, 0];
  return order.slice(0, Math.min(Math.max(perWeek, 1), 7)).sort();
}
