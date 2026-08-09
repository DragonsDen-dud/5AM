/** All dates in this app are local calendar dates in YYYY-MM-DD form. */

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now)
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Whole calendar days between two date keys (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Parses "HH:MM" into minutes since local midnight. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function formatTime(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** A local Date at a given minute-of-day on a given date key. */
export function atMinutes(dateKey: string, minutesSinceMidnight: number): Date {
  const d = fromDateKey(dateKey)
  d.setMinutes(minutesSinceMidnight)
  return d
}

/** "4h 12m" / "12m" / "48s" — used for countdowns, so seconds matter near zero. */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatDateKey(key: string): string {
  const d = fromDateKey(key)
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

/** "Saturday" — the header's overline. */
export function formatWeekday(key: string): string {
  return WEEKDAYS[fromDateKey(key).getDay()]
}

/** "8 August" — the header's headline. The year is never in doubt on a today screen. */
export function formatDayMonth(key: string): string {
  const d = fromDateKey(key)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`
}

export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
