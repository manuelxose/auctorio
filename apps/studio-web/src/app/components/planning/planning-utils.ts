import type { PlanEvidenceEntry, PlanItem, PlanOutlineEntry } from '../../models/planning.models';

export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
];

/** Pipeline order of plan item states. */
export const ITEM_STATUSES = ['proposed', 'approved', 'generating', 'content_ready', 'review_required', 'scheduled', 'published', 'rejected', 'canceled'] as const;

const STATUS_LABELS: Record<string, string> = {
  proposed: 'Proposal',
  approved: 'Approved',
  rejected: 'Rejected',
  content_pending: 'Content pending',
  generating: 'Writing draft',
  content_ready: 'Draft ready',
  review_required: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  canceled: 'Canceled',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

export function statusTone(status: string): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' | 'info' {
  switch (status) {
    case 'approved':
    case 'published':
      return 'success';
    case 'rejected':
    case 'canceled':
      return 'danger';
    case 'proposed':
      return 'warning';
    case 'generating':
    case 'content_ready':
    case 'review_required':
      return 'brand';
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

export function channelLabel(channel: string): string {
  return channel === 'x' ? 'X' : channel === 'instagram' ? 'Instagram' : 'Website';
}

export function itemTitle(item: Pick<PlanItem, 'finalSuggestedTitle' | 'workingTitle' | 'title'>): string {
  return item.finalSuggestedTitle || item.workingTitle || item.title;
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function outlineOf(value: unknown): PlanOutlineEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({ heading: String(entry['heading'] ?? ''), subpoints: stringList(entry['subpoints']) }));
}

export function evidenceOf(value: unknown): PlanEvidenceEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      title: String(entry['title'] ?? entry['url'] ?? ''),
      ...(typeof entry['url'] === 'string' && entry['url'] ? { url: entry['url'] as string } : {}),
      ...(typeof entry['sourceType'] === 'string' ? { sourceType: entry['sourceType'] as string } : {}),
    }));
}

// ── Timezone helpers: plans are scheduled in the site's IANA timezone, not the browser's ──

function parts(instant: Date, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)) out[part.type] = part.value;
  return out;
}

/** YYYY-MM-DD of an instant in a timezone. */
export function localDate(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** HH:mm of an instant in a timezone. */
export function localTime(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${p['hour']}:${p['minute']}`;
}

/** UTC instant of a wall-clock date+time in a timezone (mirrors the backend's zonedTimeToUtc). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (instant: number) => {
    const p = parts(new Date(instant), timeZone);
    return Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute'], +p['second']) - instant;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function formatDay(date: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/** Count of slots the generator will create; mirrors the backend rule incl. skipping past slots (30 min lead). */
export function expectedSlotCount(input: { dateFrom: string; dateTo: string; weekdays: number[]; articlesPerDay: number; times: string[]; timeZone: string; now?: Date }): { count: number; past: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) || input.dateTo < input.dateFrom) return { count: 0, past: 0 };
  const defaults = ['09:00', '13:00', '18:00', '11:00', '16:00', '20:00', '08:00', '21:00'];
  const times = [...new Set([...input.times, ...defaults])].slice(0, input.articlesPerDay);
  const notBefore = (input.now ?? new Date()).getTime() + 30 * 60_000;
  let count = 0;
  let past = 0;
  for (let day = input.dateFrom, guard = 0; day <= input.dateTo && guard < 400; day = addDays(day, 1), guard += 1) {
    if (!input.weekdays.includes(weekday(day))) continue;
    for (const time of times) {
      if (zonedToUtc(day, time, input.timeZone).getTime() < notBefore) past += 1;
      else count += 1;
    }
  }
  return { count, past };
}
