import { db, getSettings } from './db'
import { addDays, daysBetween, todayKey } from './dates'
import { lastResolvedDate } from './window'
import type { RunLog, Settings, StreakState } from './types'

/** Lally et al. (2010): median 66 days to automaticity. The bar on Home tracks this. */
export const AUTOMATICITY_TARGET_DAYS = 66

export function computeStreakFromLogs(
  logs: RunLog[],
  anchorDate: string,
): Omit<StreakState, 'id'> {
  const byDate = new Map<string, RunLog>()
  for (const log of logs) byDate.set(log.date, log)

  const totalRuns = logs.filter((l) => l.status === 'completed').length

  // Current streak: walk back from the anchor while days are consecutive completions.
  let currentStreak = 0
  let cursor = anchorDate
  while (byDate.get(cursor)?.status === 'completed') {
    currentStreak += 1
    cursor = addDays(cursor, -1)
  }

  // Longest streak: longest contiguous run of completed dates anywhere in history.
  const completedDates = logs
    .filter((l) => l.status === 'completed')
    .map((l) => l.date)
    .sort()

  let longestStreak = 0
  let run = 0
  let previous: string | null = null
  for (const date of completedDates) {
    run = previous !== null && daysBetween(previous, date) === 1 ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    previous = date
  }

  const lastCheckInDate = completedDates.length
    ? completedDates[completedDates.length - 1]
    : null

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    lastCheckInDate,
    totalRuns,
  }
}

/**
 * Recomputes the cached StreakState from the RunLog table, which is the single
 * source of truth. Called after every mutation so the cache can never drift.
 */
export async function recomputeStreak(settings?: Settings): Promise<StreakState> {
  const s = settings ?? (await getSettings())
  const logs = await db.runLogs.toArray()
  const today = todayKey()
  const anchor =
    logs.find((l) => l.date === today)?.status === 'completed'
      ? today
      : s
        ? lastResolvedDate(s)
        : today

  const next: StreakState = { id: 'streak', ...computeStreakFromLogs(logs, anchor) }
  await db.streak.put(next)
  return next
}

export interface AutomaticityProgress {
  day: number
  target: number
  fraction: number
  label: string
}

/**
 * Progress toward Day 66 — spec §9.3. This replaces the "cost of a miss" stat
 * entirely: it is framed as building toward automatic, never as loss.
 */
export function automaticityProgress(currentStreak: number): AutomaticityProgress {
  const day = Math.min(currentStreak, AUTOMATICITY_TARGET_DAYS)
  const fraction = day / AUTOMATICITY_TARGET_DAYS
  const label =
    currentStreak >= AUTOMATICITY_TARGET_DAYS
      ? 'Past day 66 — this is automatic now.'
      : `Day ${day} of ${AUTOMATICITY_TARGET_DAYS} — building toward automatic.`
  return { day, target: AUTOMATICITY_TARGET_DAYS, fraction, label }
}

export function completionRate(logs: RunLog[], days: number, now: Date = new Date()): number | null {
  const today = todayKey(now)
  const from = addDays(today, -(days - 1))
  const inRange = logs.filter((l) => l.date >= from && l.date <= today)
  if (inRange.length === 0) return null
  const completed = inRange.filter((l) => l.status === 'completed').length
  return completed / inRange.length
}
