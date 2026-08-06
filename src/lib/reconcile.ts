import { db } from './db'
import { addDays, daysBetween } from './dates'
import { recomputeStreak } from './streak'
import { lastResolvedDate } from './window'
import type { Settings } from './types'

const MAX_BACKFILL_DAYS = 3650

/**
 * Writes a `missed` RunLog for every settled day since onboarding that has no
 * entry. Without this a closed window with no check-in would simply be absent,
 * and an absent day is indistinguishable from a future one.
 *
 * Only ever fills gaps — it never touches or rewrites an existing entry, because
 * history is immutable by design (spec §3.4).
 */
export async function reconcileMissedDays(
  settings: Settings,
  now: Date = new Date(),
): Promise<number> {
  const resolvedThrough = lastResolvedDate(settings, now)
  const start = settings.trackingStartsOn

  if (daysBetween(start, resolvedThrough) < 0) return 0

  const existing = new Set((await db.runLogs.toArray()).map((l) => l.date))
  const gaps: string[] = []

  let cursor = start
  let guard = 0
  while (cursor <= resolvedThrough && guard < MAX_BACKFILL_DAYS) {
    if (!existing.has(cursor)) gaps.push(cursor)
    cursor = addDays(cursor, 1)
    guard += 1
  }

  if (gaps.length > 0) {
    await db.runLogs.bulkAdd(gaps.map((date) => ({ date, status: 'missed' as const })))
  }

  await recomputeStreak(settings)
  return gaps.length
}
