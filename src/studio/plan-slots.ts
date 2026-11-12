/**
 * Deterministic editorial slot allocation. The application, not the LLM,
 * decides how many proposals land on which local date and time.
 *
 * Dates are inclusive calendar dates (YYYY-MM-DD) interpreted in the site's
 * IANA timezone; each slot carries the exact UTC instant of its local time,
 * so DST transitions and month boundaries need no special casing.
 */

export const MAX_PLAN_SLOTS = 200;
export const MAX_PLAN_DAYS = 366;
const DEFAULT_TIMES = ["09:00", "13:00", "18:00", "11:00", "16:00", "20:00", "08:00", "21:00"];
const DAY_MS = 86_400_000;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PlanSlotRequest = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  articlesPerDay: number;
  /** 0 = Sunday … 6 = Saturday. Defaults to every day. */
  weekdays?: number[];
  /** Per-weekday override of articlesPerDay, keyed "0".."6". */
  weekdayQuotas?: Record<string, number>;
  excludedDates?: string[];
  /** Local HH:mm publication times; padded with defaults when fewer than the day's quota. */
  publishTimes?: string[];
};

export type PlanSlot = {
  index: number;
  localDate: string;
  localTime: string;
  scheduledFor: Date;
};

function parseLocalDate(value: string): number {
  if (!LOCAL_DATE.test(value)) throw new Error("plan_slots_invalid_date");
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== value) throw new Error("plan_slots_invalid_date");
  return ms;
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
}

/** UTC instant of a wall-clock time in an IANA timezone (non-existent DST times shift forward). */
export function zonedTimeToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [hh, mm] = localTime.split(":").map(Number);
  const wall = parseLocalDate(localDate) + (hh * 60 + mm) * 60_000;
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

export function computePlanSlots(request: PlanSlotRequest): PlanSlot[] {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: request.timezone });
  } catch {
    throw new Error("plan_slots_invalid_timezone");
  }
  const from = parseLocalDate(request.dateFrom);
  const to = parseLocalDate(request.dateTo);
  if (to < from) throw new Error("plan_slots_invalid_date_range");
  // Bound the day loop itself, not just the slot count, so a huge range cannot stall the process.
  if ((to - from) / DAY_MS + 1 > MAX_PLAN_DAYS) throw new Error("plan_slots_range_too_long");
  if (!Number.isInteger(request.articlesPerDay) || request.articlesPerDay < 0 || request.articlesPerDay > DEFAULT_TIMES.length) {
    throw new Error("plan_slots_invalid_articles_per_day");
  }
  // Only an omitted list means "every day"; an explicit empty list is a user error, not a default.
  if (request.weekdays && request.weekdays.length === 0) throw new Error("plan_slots_no_weekdays");
  const weekdays = new Set(request.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const excluded = new Set(request.excludedDates ?? []);
  const times = [...new Set([...(request.publishTimes ?? []).filter((time) => LOCAL_TIME.test(time)), ...DEFAULT_TIMES])];

  const slots: PlanSlot[] = [];
  for (let day = from; day <= to; day += DAY_MS) {
    const localDate = new Date(day).toISOString().slice(0, 10);
    const weekday = new Date(day).getUTCDay();
    if (!weekdays.has(weekday) || excluded.has(localDate)) continue;
    const quota = request.weekdayQuotas?.[String(weekday)] ?? request.articlesPerDay;
    if (!Number.isInteger(quota) || quota < 0 || quota > DEFAULT_TIMES.length) throw new Error("plan_slots_invalid_articles_per_day");
    for (const localTime of times.slice(0, quota).sort()) {
      slots.push({ index: slots.length, localDate, localTime, scheduledFor: zonedTimeToUtc(localDate, localTime, request.timezone) });
      if (slots.length > MAX_PLAN_SLOTS) throw new Error("plan_slots_too_many");
    }
  }
  return slots;
}

/** Inclusive local range → [start of first day, end of last day] as UTC instants. */
export function planRangeBounds(dateFrom: string, dateTo: string, timeZone: string): { from: Date; to: Date } {
  const next = new Date(parseLocalDate(dateTo) + DAY_MS).toISOString().slice(0, 10);
  return { from: zonedTimeToUtc(dateFrom, "00:00", timeZone), to: new Date(zonedTimeToUtc(next, "00:00", timeZone).getTime() - 1) };
}
