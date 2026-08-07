import { db, getSettings } from './db'
import { addDays, daysBetween, todayKey } from './dates'
import { lastResolvedDate } from './window'
import type { RunLog, Settings, StreakState } from './types'

/** Lally et al. (2010): median 66 days to automaticity. The bar on Home tracks this. */
export const AUTOMATICITY_TARGET_DAYS = 66

/** Ceiling on the streak walk-back, so a corrupt store cannot spin forever. */
const MAX_STREAK_WALK_DAYS = 3650

export function computeStreakFromLogs(
  logs: RunLog[],
  anchorDate: string,
): Omit<StreakState, 'id'> {
  const byDate = new Map<string, RunLog>()
  for (const log of logs) byDate.set(log.date, log)

  const totalRuns = logs.filter((l) => l.status === 'completed').length

  /*
   * Phase 2: a `rest` day is a deliberate red-readiness call, not a failure.
   * It bridges the streak — the count carries across it — but it does not add
   * to it, because you did not run. Only a `missed` day breaks the chain.
   */
  let currentStreak = 0
  let cursor = anchorDate
  for (let guard = 0; guard < MAX_STREAK_WALK_DAYS; guard += 1) {
    const status = byDate.get(cursor)?.status
    if (status === 'completed') currentStreak += 1
    else if (status !== 'rest') break
    cursor = addDays(cursor, -1)
  }

  // Longest streak: longest chain of completed days, bridged by rest days.
  const dated = logs
    .filter((l) => l.status === 'completed' || l.status === 'rest')
    .map((l) => ({ date: l.date, status: l.status }))
    .sort((a, b) => a.date.localeCompare(b.date))

  let longestStreak = 0
  let run = 0
  let previous: string | null = null
  for (const entry of dated) {
    const contiguous = previous !== null && daysBetween(previous, entry.date) === 1
    if (!contiguous) run = 0
    if (entry.status === 'completed') run += 1
    longestStreak = Math.max(longestStreak, run)
    previous = entry.date
  }

  const completedDates = logs
    .filter((l) => l.status === 'completed')
    .map((l) => l.date)
    .sort()

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
  const todayStatus = logs.find((l) => l.date === today)?.status
  const anchor =
    todayStatus === 'completed' || todayStatus === 'rest'
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

/**
 * Completion rate over a trailing window. Rest days are excluded from both
 * numerator and denominator — a day you deliberately took off is not a day you
 * failed, and counting it as one would punish the exact behaviour the readiness
 * system exists to encourage.
 */
export function completionRate(logs: RunLog[], days: number, now: Date = new Date()): number | null {
  const today = todayKey(now)
  const from = addDays(today, -(days - 1))
  const inRange = logs.filter((l) => l.date >= from && l.date <= today && l.status !== 'rest')
  if (inRange.length === 0) return null
  const completed = inRange.filter((l) => l.status === 'completed').length
  return completed / inRange.length
}
