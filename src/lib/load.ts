import { db } from './db'
import { addDays, todayKey } from './dates'
import type { LoadEntry, RunLog } from './types'

/**
 * Acute:chronic workload ratio — phase-2 spec §2.2.
 *
 * Load is a session-RPE proxy (duration × effort). That is the method applied
 * sports science actually uses when GPS and heart-rate data are not available;
 * it needs no wearable and no extra logging beyond the two fields the Phase 1
 * check-in already collects.
 *
 * Everything here is advisory. Nothing in this file may gate a check-in.
 */

export const ACUTE_WINDOW_DAYS = 7
export const CHRONIC_WINDOW_DAYS = 28

/** Commonly cited moderate-elevated-risk threshold. */
export const ACWR_ELEVATED = 1.5
/** Above this the signal is strong enough to say so plainly. */
export const ACWR_HIGH = 1.8

/**
 * Football is one tap, so it needs a fixed load proxy. 90 minutes at effort 4
 * is a deliberately stated assumption — it is surfaced in the UI rather than
 * hidden, because a wrong constant would quietly distort the ratio.
 */
export const FOOTBALL_MINUTES = 90
export const FOOTBALL_EFFORT = 4
export const FOOTBALL_LOAD = FOOTBALL_MINUTES * FOOTBALL_EFFORT

/** ACWR is meaningless until the chronic window has real history behind it. */
export const MIN_DAYS_FOR_ACWR = 14

export function sessionLoad(durationMin: number, effort: number): number {
  return Math.max(0, durationMin) * Math.max(0, effort)
}

/**
 * Writes the day's load. Run load and football load accumulate on the same
 * date — that stacking is exactly the pattern this system exists to see.
 */
export async function upsertLoad(
  date: string,
  patch: { durationMin?: number; effort?: number; footballPlayed?: boolean },
): Promise<void> {
  const existing = await db.loadEntries.where('date').equals(date).first()

  const durationMin = patch.durationMin ?? existing?.durationMin ?? 0
  const effort = patch.effort ?? existing?.effort ?? 0
  const footballPlayed = patch.footballPlayed ?? existing?.footballPlayed ?? false

  const entry: LoadEntry = {
    date,
    durationMin,
    effort,
    footballPlayed,
    sessionLoad: sessionLoad(durationMin, effort) + (footballPlayed ? FOOTBALL_LOAD : 0),
  }

  if (existing?.id !== undefined) await db.loadEntries.update(existing.id, entry)
  else await db.loadEntries.add(entry)
}

export async function toggleFootball(date: string): Promise<boolean> {
  const existing = await db.loadEntries.where('date').equals(date).first()
  const next = !(existing?.footballPlayed ?? false)
  await upsertLoad(date, { footballPlayed: next })
  return next
}

export interface AcwrResult {
  /** Mean daily load over the last 7 days. */
  acute: number
  /** Mean daily load over the last 28 days. */
  chronic: number
  /** acute / chronic. Null while there is not enough history to mean anything. */
  ratio: number | null
  /** Days of tracked history the ratio is based on. */
  daysTracked: number
  zone: 'insufficient' | 'normal' | 'elevated' | 'high'
}

/** Mean daily load across a window, counting unlogged days as zero. */
function meanDailyLoad(entries: LoadEntry[], from: string, to: string, days: number): number {
  const total = entries
    .filter((e) => e.date >= from && e.date <= to)
    .reduce((sum, e) => sum + e.sessionLoad, 0)
  return days > 0 ? total / days : 0
}

export function computeAcwr(
  entries: LoadEntry[],
  trackingStartsOn: string,
  now: Date = new Date(),
): AcwrResult {
  const today = todayKey(now)
  const acute = meanDailyLoad(entries, addDays(today, -(ACUTE_WINDOW_DAYS - 1)), today, ACUTE_WINDOW_DAYS)
  const chronic = meanDailyLoad(
    entries,
    addDays(today, -(CHRONIC_WINDOW_DAYS - 1)),
    today,
    CHRONIC_WINDOW_DAYS,
  )

  const startOfChronic = addDays(today, -(CHRONIC_WINDOW_DAYS - 1))
  const effectiveStart = trackingStartsOn > startOfChronic ? trackingStartsOn : startOfChronic
  const daysTracked =
    Math.round(
      (new Date(today).getTime() - new Date(effectiveStart).getTime()) / 86_400_000,
    ) + 1

  if (daysTracked < MIN_DAYS_FOR_ACWR || chronic <= 0) {
    return { acute, chronic, ratio: null, daysTracked, zone: 'insufficient' }
  }

  const ratio = acute / chronic
  const zone = ratio >= ACWR_HIGH ? 'high' : ratio >= ACWR_ELEVATED ? 'elevated' : 'normal'
  return { acute, chronic, ratio, daysTracked, zone }
}

export async function getAcwr(trackingStartsOn: string, now: Date = new Date()): Promise<AcwrResult> {
  const entries = await db.loadEntries.toArray()
  return computeAcwr(entries, trackingStartsOn, now)
}

/**
 * The advisory copy for an elevated ratio. Renders in the existing Content
 * Engine card, not a chart — the point is to surface a real signal at the
 * moment it is actionable, not to hand over a number to interpret.
 */
export function acwrAdvisory(result: AcwrResult): string | null {
  if (result.ratio === null) return null
  if (result.zone === 'normal') return null

  const pct = Math.round((result.ratio - 1) * 100)
  const base =
    result.zone === 'high'
      ? `Your last seven days carry about ${pct}% more load than the four weeks your body has adapted to.`
      : `Your load has climbed roughly ${pct}% above your four-week average.`

  return `${base} That is the pattern that precedes soft-tissue strains — the hamstring specifically, given your history. Take an easy day before the calendar makes you take a hard one.`
}

/** Whether football landed on a running day — the posterior-chain stacking case. */
export async function footballCoincidesWithRun(date: string): Promise<boolean> {
  const [load, run] = await Promise.all([
    db.loadEntries.where('date').equals(date).first(),
    db.runLogs.where('date').equals(date).first(),
  ])
  return Boolean(load?.footballPlayed) && (run as RunLog | undefined)?.status === 'completed'
}

export interface MonthlyLoadReview {
  /** Weekly mean daily load, oldest first, four entries. */
  weeklyLoads: number[]
  footballDays: number
  runDays: number
  restDays: number
  /** Longest run of consecutive days with any load logged. */
  longestStack: number
  summary: string
}

/** Monthly, not daily — a load review that nags every morning stops being read. */
export function reviewLoad(
  entries: LoadEntry[],
  runLogs: RunLog[],
  now: Date = new Date(),
): MonthlyLoadReview {
  const today = todayKey(now)
  const byDate = new Map(entries.map((e) => [e.date, e]))

  const weeklyLoads: number[] = []
  for (let week = 3; week >= 0; week -= 1) {
    const to = addDays(today, -week * 7)
    const from = addDays(to, -6)
    weeklyLoads.push(meanDailyLoad(entries, from, to, 7))
  }

  const from28 = addDays(today, -27)
  const windowRuns = runLogs.filter((l) => l.date >= from28 && l.date <= today)
  const runDays = windowRuns.filter((l) => l.status === 'completed').length
  const restDays = windowRuns.filter((l) => l.status === 'rest').length
  const footballDays = entries.filter(
    (e) => e.date >= from28 && e.date <= today && e.footballPlayed,
  ).length

  let longestStack = 0
  let stack = 0
  for (let i = 0; i < 28; i += 1) {
    const date = addDays(from28, i)
    const hasLoad = (byDate.get(date)?.sessionLoad ?? 0) > 0
    stack = hasLoad ? stack + 1 : 0
    longestStack = Math.max(longestStack, stack)
  }

  const trend = weeklyLoads[3] - weeklyLoads[0]
  const direction =
    weeklyLoads[0] === 0
      ? 'building from a standing start'
      : trend > weeklyLoads[0] * 0.25
        ? 'climbing'
        : trend < -weeklyLoads[0] * 0.25
          ? 'easing off'
          : 'holding steady'

  const stackNote =
    longestStack >= 10
      ? ` You went ${longestStack} days without a genuine easy day — that is where the posterior chain starts complaining.`
      : longestStack >= 7
        ? ` Longest unbroken stretch: ${longestStack} days.`
        : ''

  return {
    weeklyLoads,
    footballDays,
    runDays,
    restDays,
    longestStack,
    summary: `Over four weeks: ${runDays} runs, ${footballDays} football days, ${restDays} logged rest days. Load is ${direction}.${stackNote}`,
  }
}
