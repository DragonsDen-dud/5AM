import { db } from './db'
import { addDays, daysBetween } from './dates'
import { recomputeStreak } from './streak'
import { lastResolvedDate } from './window'
import type { Settings, StakeFollowUp } from './types'

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
  const gaps: string[] = []

  // Nothing has settled yet when tracking starts tomorrow — but the derived
  // streak still gets refreshed below, so the cached row always exists after a
  // reconcile rather than only appearing at the first mutation.
  if (daysBetween(start, resolvedThrough) >= 0) {
    const existing = new Set((await db.runLogs.toArray()).map((l) => l.date))

    let cursor = start
    let guard = 0
    while (cursor <= resolvedThrough && guard < MAX_BACKFILL_DAYS) {
      if (!existing.has(cursor)) gaps.push(cursor)
      cursor = addDays(cursor, 1)
      guard += 1
    }

    if (gaps.length > 0) {
      await db.runLogs.bulkAdd(gaps.map((date) => ({ date, status: 'missed' as const })))
      await raiseStakeFollowUps(settings, gaps)
    }
  }

  await recomputeStreak(settings)
  return gaps.length
}

/**
 * Phase 2 §4.3. If a commitment stake is set, each newly settled miss raises one
 * follow-up for it. Honor-system only: the app records the promise and asks
 * whether you kept it. It never automates, charges, or contacts anyone.
 */
async function raiseStakeFollowUps(settings: Settings, missedDates: string[]): Promise<void> {
  const stake = settings.commitmentStake?.trim()
  if (!stake) return

  const existing = new Set((await db.stakeFollowUps.toArray()).map((f) => f.date))
  const rows: StakeFollowUp[] = missedDates
    .filter((date) => !existing.has(date))
    .map((date) => ({ date, stake }))

  if (rows.length > 0) await db.stakeFollowUps.bulkAdd(rows)
}
