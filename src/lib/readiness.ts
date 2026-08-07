import { db } from './db'
import { addDays, todayKey } from './dates'
import { getSleepSummary, type SleepSummary } from './sleep'
import type { ReadinessLevel, ReadinessScore, RunLog } from './types'

/**
 * Physiological readiness — phase-2 spec §1.4.
 *
 * Transparent by construction: a small number of named factors, each with a
 * plain-language reason, producing Green / Amber / Red. Never a raw number the
 * user has to interpret, and never a gate — Green and Amber do not touch the
 * check-in flow at all, and Red only inserts a choice, not a refusal.
 *
 * The copy rule that matters: Amber and Red are diagnostic, not disapproving.
 * A coach who tells you to back off is not calling you weak.
 */

export interface ReadinessFactor {
  key: 'sleep' | 'consecutive' | 'effort'
  /** 0 = no concern, 2 = strong concern. */
  weight: number
  reason: string
}

export interface ReadinessInputs {
  sleep: SleepSummary
  /** Consecutive training-adjacent days ending yesterday (runs and football). */
  consecutiveTrainingDays: number
  /** Effort of the most recent logged run, if any. */
  lastEffort: number | null
}

export function scoreReadiness(inputs: ReadinessInputs): {
  level: ReadinessLevel
  reasoning: string
  factors: ReadinessFactor[]
} {
  const factors: ReadinessFactor[] = []

  const { delta } = inputs.sleep
  if (delta !== null) {
    if (delta <= -1.5) {
      factors.push({
        key: 'sleep',
        weight: 2,
        reason: `sleep is running ${Math.abs(delta).toFixed(1)}h under your own average`,
      })
    } else if (delta <= -0.75) {
      factors.push({
        key: 'sleep',
        weight: 1,
        reason: "sleep's been a little under your average",
      })
    }
  }

  if (inputs.consecutiveTrainingDays >= 10) {
    factors.push({
      key: 'consecutive',
      weight: 2,
      reason: `${inputs.consecutiveTrainingDays} straight days with load and no easy one`,
    })
  } else if (inputs.consecutiveTrainingDays >= 6) {
    factors.push({
      key: 'consecutive',
      weight: 1,
      reason: `${inputs.consecutiveTrainingDays}th day in a row`,
    })
  }

  if (inputs.lastEffort === 5) {
    factors.push({ key: 'effort', weight: 2, reason: 'you emptied the tank last session' })
  } else if (inputs.lastEffort === 4) {
    factors.push({ key: 'effort', weight: 1, reason: 'last session was hard' })
  }

  const total = factors.reduce((sum, f) => sum + f.weight, 0)
  const level: ReadinessLevel = total >= 4 ? 'red' : total >= 2 ? 'amber' : 'green'

  return { level, reasoning: buildReasoning(level, factors, inputs), factors }
}

function buildReasoning(
  level: ReadinessLevel,
  factors: ReadinessFactor[],
  inputs: ReadinessInputs,
): string {
  const ranked = [...factors].sort((a, b) => b.weight - a.weight)
  const named = ranked.slice(0, 2).map((f) => f.reason)

  if (level === 'green') {
    if (inputs.sleep.rollingAverage === null) {
      return 'Green — nothing flagged. Log your sleep for a few nights and this gets a lot sharper.'
    }
    return 'Green — sleep and load are both where they should be. Normal session.'
  }

  if (level === 'amber') {
    return `Amber — ${named.join(', and ')}. Not a reason to skip. A reason to run it easy.`
  }

  return `Red — ${named.join(', and ')}. This is the day a good coach tells you to back off.`
}

/**
 * Consecutive days ending yesterday that carried training load — runs or
 * football. Rest days and misses both break the count, because both mean the
 * posterior chain got a day.
 */
export async function consecutiveTrainingDays(now: Date = new Date()): Promise<number> {
  const today = todayKey(now)
  const [runs, loads] = await Promise.all([db.runLogs.toArray(), db.loadEntries.toArray()])

  const ran = new Set(runs.filter((r) => r.status === 'completed').map((r) => r.date))
  const football = new Set(loads.filter((l) => l.footballPlayed).map((l) => l.date))

  let count = 0
  let cursor = addDays(today, -1)
  // A year is a generous ceiling and stops a corrupt store spinning forever.
  for (let guard = 0; guard < 365; guard += 1) {
    if (!ran.has(cursor) && !football.has(cursor)) break
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

async function lastLoggedEffort(now: Date = new Date()): Promise<number | null> {
  const today = todayKey(now)
  const logs = await db.runLogs.toArray()
  const withEffort = logs
    .filter((l): l is RunLog & { effort: number } => l.date < today && typeof l.effort === 'number')
    .sort((a, b) => a.date.localeCompare(b.date))
  return withEffort.length > 0 ? withEffort[withEffort.length - 1].effort : null
}

/**
 * Computes today's readiness and caches it, so the reasoning shown at check-in
 * is the reasoning that was true at check-in — it does not silently re-rate
 * itself as the morning goes on.
 */
export async function getReadiness(now: Date = new Date()): Promise<ReadinessScore> {
  const date = todayKey(now)
  const cached = await db.readinessScores.get(date)
  if (cached) return cached

  const [sleep, consecutive, lastEffort] = await Promise.all([
    getSleepSummary(now),
    consecutiveTrainingDays(now),
    lastLoggedEffort(now),
  ])

  const { level, reasoning } = scoreReadiness({
    sleep,
    consecutiveTrainingDays: consecutive,
    lastEffort,
  })

  const score: ReadinessScore = {
    date,
    level,
    reasoning,
    computedAt: new Date().toISOString(),
  }
  await db.readinessScores.put(score)
  return score
}

export async function recordRedDayChoice(
  date: string,
  choice: ReadinessScore['choice'],
): Promise<void> {
  const existing = await db.readinessScores.get(date)
  if (!existing) return
  await db.readinessScores.put({ ...existing, choice })
}

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
}
