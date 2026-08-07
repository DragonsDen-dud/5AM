import { addDays, todayKey } from './dates'
import { computeAcwr } from './load'
import type { LoadEntry, ReadinessScore, RunLog } from './types'

/**
 * Descriptive series for Stats v2 (phase-2 §5). Descriptive only: these
 * functions state patterns that exist in the data. They never prescribe — the
 * Content Engine already owns that job.
 */

export interface TrendPoint {
  date: string
  value: number | null
}

export function dateRange(days: number, now: Date = new Date()): string[] {
  const today = todayKey(now)
  return Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)))
}

/**
 * Trailing completion rate, as a percentage. Rest days are excluded from the
 * window entirely — same rule as the headline stat, for the same reason.
 */
export function completionTrend(
  logs: RunLog[],
  days: number,
  window: number,
  now: Date = new Date(),
): TrendPoint[] {
  const byDate = new Map(logs.map((l) => [l.date, l.status]))

  return dateRange(days, now).map((date) => {
    let hits = 0
    let total = 0
    for (let i = 0; i < window; i += 1) {
      const status = byDate.get(addDays(date, -i))
      if (status === 'completed') {
        hits += 1
        total += 1
      } else if (status === 'missed') {
        total += 1
      }
    }
    return { date, value: total === 0 ? null : (hits / total) * 100 }
  })
}

export function acwrTrend(
  entries: LoadEntry[],
  trackingStartsOn: string,
  days: number,
  now: Date = new Date(),
): TrendPoint[] {
  return dateRange(days, now).map((date) => {
    const asOf = new Date(`${date}T12:00:00`)
    const result = computeAcwr(entries, trackingStartsOn, asOf)
    return { date, value: result.ratio }
  })
}

export interface ReadinessCell {
  date: string
  level: ReadinessScore['level'] | null
  choice?: ReadinessScore['choice']
  status?: RunLog['status']
}

export function readinessTrend(
  scores: ReadinessScore[],
  logs: RunLog[],
  days: number,
  now: Date = new Date(),
): ReadinessCell[] {
  const byDate = new Map(scores.map((s) => [s.date, s]))
  const statusByDate = new Map(logs.map((l) => [l.date, l.status]))

  return dateRange(days, now).map((date) => {
    const score = byDate.get(date)
    return {
      date,
      level: score?.level ?? null,
      choice: score?.choice,
      status: statusByDate.get(date),
    }
  })
}

/**
 * The correlation Stats v2 actually asks about: does running through a red day
 * predict a miss shortly after? Stated as a plain count, never as a claim about
 * cause — the sample is one person and it will be small for a long time.
 */
export function redDayFollowThrough(
  scores: ReadinessScore[],
  logs: RunLog[],
  lookaheadDays = 2,
): { redDaysRun: number; followedByMiss: number; sentence: string } | null {
  const statusByDate = new Map(logs.map((l) => [l.date, l.status]))

  const redRun = scores.filter(
    (s) => s.level === 'red' && statusByDate.get(s.date) === 'completed',
  )

  if (redRun.length < 3) return null

  let followedByMiss = 0
  for (const score of redRun) {
    for (let i = 1; i <= lookaheadDays; i += 1) {
      if (statusByDate.get(addDays(score.date, i)) === 'missed') {
        followedByMiss += 1
        break
      }
    }
  }

  const sentence =
    followedByMiss === 0
      ? `You have run through ${redRun.length} red days and none was followed by a miss within ${lookaheadDays} days. No pattern here so far.`
      : `Of ${redRun.length} red days you ran through, ${followedByMiss} were followed by a miss within ${lookaheadDays} days. That is a pattern worth noticing, not a verdict — the sample is small.`

  return { redDaysRun: redRun.length, followedByMiss, sentence }
}
