import { db } from './db'
import { addDays, todayKey } from './dates'
import type { SleepEntry, SleepSourceId } from './types'

/**
 * Sleep data access, phase-2 spec §1.3.
 *
 * Tier A (built): manual self-report. Tier B (interface only): device sleep
 * data from HealthKit / Google Fit / the Android Sleep API. Everything above
 * this layer calls `SleepSource`, so adding a device implementation later is a
 * new file and a registry entry — not a schema migration and not a change to
 * any caller.
 */
export interface SleepSource {
  readonly id: SleepSourceId
  readonly label: string
  /** Whether this source can be used on this device right now. */
  isAvailable(): Promise<boolean>
  /** Entries covering [from, to] inclusive, in YYYY-MM-DD terms. */
  read(from: string, to: string): Promise<SleepEntry[]>
}

const manualSource: SleepSource = {
  id: 'manual',
  label: 'Self-reported',
  async isAvailable() {
    return true
  },
  async read(from, to) {
    return db.sleepEntries.where('date').between(from, to, true, true).toArray()
  },
}

/**
 * Registry. A `healthkit` / `googlefit` implementation slots in here and
 * `activeSleepSource()` starts returning it — no calling code changes.
 */
const SOURCES: SleepSource[] = [manualSource]

export async function activeSleepSource(): Promise<SleepSource> {
  for (const source of SOURCES) {
    if (await source.isAvailable()) return source
  }
  return manualSource
}

export async function logSleep(
  date: string,
  hoursSlept: number,
  quality: number,
  source: SleepSourceId = 'manual',
): Promise<void> {
  const existing = await db.sleepEntries.where('date').equals(date).first()
  const entry: SleepEntry = {
    date,
    hoursSlept,
    quality,
    source,
    loggedAt: new Date().toISOString(),
  }
  if (existing?.id !== undefined) await db.sleepEntries.update(existing.id, entry)
  else await db.sleepEntries.add(entry)
}

export interface SleepSummary {
  /** Mean hours across the last 7 logged-or-not days, null if nothing logged. */
  rollingAverage: number | null
  /**
   * Your own median, not a generic 8-hour target. Computed over the last 60
   * days so it tracks your actual pattern rather than an aspiration.
   */
  baseline: number | null
  /** rollingAverage − baseline. Negative means you are down on your own norm. */
  delta: number | null
  entriesInWindow: number
  latest: SleepEntry | null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function summariseSleep(entries: SleepEntry[], now: Date = new Date()): SleepSummary {
  const today = todayKey(now)
  const weekFrom = addDays(today, -6)
  const baselineFrom = addDays(today, -59)

  const recent = entries.filter((e) => e.date >= weekFrom && e.date <= today)
  const baselinePool = entries.filter((e) => e.date >= baselineFrom && e.date <= today)

  const rollingAverage =
    recent.length > 0 ? recent.reduce((sum, e) => sum + e.hoursSlept, 0) / recent.length : null

  // Needs a few nights before it means anything; below that, a single short
  // night would masquerade as your normal.
  const baseline =
    baselinePool.length >= 5 ? median(baselinePool.map((e) => e.hoursSlept)) : null

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))

  return {
    rollingAverage,
    baseline,
    delta: rollingAverage !== null && baseline !== null ? rollingAverage - baseline : null,
    entriesInWindow: recent.length,
    latest: sorted.length > 0 ? sorted[sorted.length - 1] : null,
  }
}

export async function getSleepSummary(now: Date = new Date()): Promise<SleepSummary> {
  const source = await activeSleepSource()
  const today = todayKey(now)
  const entries = await source.read(addDays(today, -59), today)
  return summariseSleep(entries, now)
}
