import { addDays, formatTime, parseTime, todayKey } from './dates'
import { median } from './sleep'
import { safeTargetTime } from './alarmTime'
import type { SleepEntry, Settings } from './types'

/**
 * Reading a sleep history back, and turning it into one recommendation.
 *
 * The app only ever asks for hours and quality — never a bedtime. But the wake
 * time is fixed by the target, so every logged night *implies* a lights-out,
 * and that implied time is what turns a column of numbers into a schedule. It
 * is a derivation, not a measurement, and the copy says so.
 *
 * The recommendation is deliberately built from the person's own best nights
 * rather than a generic eight hours. A target you have already hit is a target
 * you can hit again; a number off a poster is just a number off a poster.
 */

export const MIN_NIGHTS_FOR_STATS = 5
export const MIN_GOOD_NIGHTS = 3
/** Quality 4–5. The nights worth trying to reproduce. */
export const GOOD_QUALITY = 4

export type Consistency = 'tight' | 'good' | 'loose' | 'irregular'

export const CONSISTENCY_LABEL: Record<Consistency, string> = {
  tight: 'Tight',
  good: 'Steady',
  loose: 'Loose',
  irregular: 'Irregular',
}

export interface SleepStats {
  /** Nights actually logged in the window. */
  nights: number
  /** Days in the window that could have been logged. */
  possible: number
  average: number | null
  medianHours: number | null
  shortest: SleepEntry | null
  longest: SleepEntry | null
  /** Spread of nightly hours, expressed in minutes. The regularity proxy. */
  variationMinutes: number | null
  consistency: Consistency | null
  /** "HH:MM" — lights-out implied by the median night against the target wake. */
  typicalLightsOut: string | null
  /** Mean quality, 1–5. */
  averageQuality: number | null
}

export interface SleepAdvice {
  /** One line, the thing to actually do. */
  headline: string
  /** Where the number came from. Never a claim without its working. */
  detail: string
  /** "HH:MM", or null when there is not enough history to say anything. */
  lightsOut: string | null
  targetHours: number | null
  /** Set when the last seven nights are meaningfully under the personal norm. */
  debtNote: string | null
}

/** "7h 20m" — hours are read as a duration, not as a decimal. */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * The lights-out a night implies, given that the alarm is fixed. Wraps across
 * midnight, so seven hours before a 05:00 alarm is 22:00 the evening before.
 */
export function impliedLightsOut(targetTime: string, hours: number): string {
  return formatTime(parseTime(safeTargetTime(targetTime)) - Math.round(hours * 60))
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Regularity bands. Sleep/wake *regularity* — not duration — is the single
 * strongest finding in the research file, so this is the number the screen
 * leads with rather than an hours average.
 */
export function consistencyBand(variationMinutes: number): Consistency {
  if (variationMinutes < 30) return 'tight'
  if (variationMinutes < 45) return 'good'
  if (variationMinutes < 75) return 'loose'
  return 'irregular'
}

export function summariseSleepHistory(
  entries: SleepEntry[],
  settings: Settings,
  windowDays = 28,
  now: Date = new Date(),
): SleepStats {
  const today = todayKey(now)
  const from = addDays(today, -(windowDays - 1))
  const start = from > settings.trackingStartsOn ? from : settings.trackingStartsOn
  const inWindow = entries
    .filter((e) => e.date >= start && e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const hours = inWindow.map((e) => e.hoursSlept)
  const possible = Math.max(daysBetweenInclusive(start, today), 0)

  if (inWindow.length === 0) {
    return {
      nights: 0,
      possible,
      average: null,
      medianHours: null,
      shortest: null,
      longest: null,
      variationMinutes: null,
      consistency: null,
      typicalLightsOut: null,
      averageQuality: null,
    }
  }

  const average = hours.reduce((s, h) => s + h, 0) / hours.length
  const medianHours = median(hours)
  const spread = stdev(hours)
  const variationMinutes = spread === null ? null : Math.round(spread * 60)

  return {
    nights: inWindow.length,
    possible,
    average,
    medianHours,
    shortest: inWindow.reduce((a, b) => (b.hoursSlept < a.hoursSlept ? b : a)),
    longest: inWindow.reduce((a, b) => (b.hoursSlept > a.hoursSlept ? b : a)),
    variationMinutes,
    // Below a handful of nights the spread is noise, not a pattern.
    consistency:
      variationMinutes !== null && inWindow.length >= MIN_NIGHTS_FOR_STATS
        ? consistencyBand(variationMinutes)
        : null,
    typicalLightsOut:
      medianHours === null ? null : impliedLightsOut(settings.targetTime, medianHours),
    averageQuality: inWindow.reduce((s, e) => s + e.quality, 0) / inWindow.length,
  }
}

/**
 * The recommendation. Built from the nights this person rated well, because a
 * target already hit is one that can be hit again — and falling back to their
 * own median rather than to a generic eight hours, which is an aspiration
 * dressed up as a prescription.
 */
export function sleepAdvice(
  entries: SleepEntry[],
  settings: Settings,
  stats: SleepStats,
  rollingAverage: number | null,
  baseline: number | null,
): SleepAdvice {
  const target = safeTargetTime(settings.targetTime)

  if (stats.nights < MIN_NIGHTS_FOR_STATS) {
    return {
      headline: `Log a few more nights.`,
      detail: `${stats.nights} of the last ${stats.possible} nights are in. From ${MIN_NIGHTS_FOR_STATS} this screen can tell you what time to actually go to bed, worked out from your own nights rather than a generic eight hours.`,
      lightsOut: null,
      targetHours: null,
      debtNote: null,
    }
  }

  const good = entries.filter((e) => e.quality >= GOOD_QUALITY).map((e) => e.hoursSlept)
  const fromGoodNights = good.length >= MIN_GOOD_NIGHTS
  const targetHours = fromGoodNights
    ? good.reduce((s, h) => s + h, 0) / good.length
    : (stats.medianHours ?? null)

  if (targetHours === null) {
    return {
      headline: 'Not enough to go on yet.',
      detail: 'Keep logging — the recommendation needs a few more nights.',
      lightsOut: null,
      targetHours: null,
      debtNote: null,
    }
  }

  const lightsOut = impliedLightsOut(target, targetHours)

  const source = fromGoodNights
    ? `Your ${good.length} best-rated nights average ${formatHours(targetHours)}.`
    : `Your typical night is ${formatHours(targetHours)}.`

  const consistencyNote =
    stats.consistency === 'loose' || stats.consistency === 'irregular'
      ? ` Your nights swing by about ${stats.variationMinutes} minutes — holding the same lights-out matters more than the total.`
      : stats.consistency === 'tight'
        ? ' Your timing is already tight; that regularity is doing more for you than another half hour would.'
        : ''

  const debt =
    rollingAverage !== null && baseline !== null && rollingAverage - baseline <= -0.5
      ? `The last seven nights are running ${formatHours(baseline - rollingAverage)} under your own norm.`
      : null

  return {
    headline: `Lights out by ${lightsOut}.`,
    detail: `${source} Against your ${formatTime(parseTime(target))} alarm that means asleep by ${lightsOut}.${consistencyNote}`,
    lightsOut,
    targetHours,
    debtNote: debt,
  }
}

/**
 * Where a night sits against the person's own norm. Drives the calendar tint —
 * deliberately relative, because "seven hours" means different things to
 * different people and the app already knows which one you are.
 */
export type SleepBand = 'over' | 'normal' | 'under' | 'short'

export function bandForNight(hours: number, baseline: number | null): SleepBand {
  // Without a personal baseline, fall back to bands around a broadly healthy
  // seven hours rather than refusing to say anything at all.
  const centre = baseline ?? 7
  const delta = hours - centre
  if (delta >= 0.5) return 'over'
  if (delta >= -0.5) return 'normal'
  if (delta >= -1.5) return 'under'
  return 'short'
}

function daysBetweenInclusive(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000) + 1
}
