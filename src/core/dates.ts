/** Date helpers. Business dates (report dates, planned dates) are calendar dates stored at UTC midnight. */

export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** Today's calendar date in India (IST) as a UTC-midnight Date — the "report date" of a DPR filed now. */
export function istToday(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
export const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS);
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
export const isSameDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);
