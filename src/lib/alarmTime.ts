import { addDays, parseTime, toDateKey } from './dates'
import { windowForDate } from './window'
import type { ChronotypeBand, Settings } from './types'
import type { Stage } from './stage'

/**
 * Alarm-nudge core (alarm-nudge spec §1, §4). Everything here is pure and
 * timezone-explicit so the awkward cases — DST, travel, midnight rollover,
 * malformed settings — can be tested directly rather than only through the UI.
 *
 * Nothing in this file sets an alarm. No web API can. It decides the right time
 * and labels it unambiguously; the phone's Clock app does the waking.
 */

/**
 * Last-resort target when `Settings.targetTime` is missing or malformed (§4.10).
 * The night lock screen must never be the thing that throws — it being
 * unreachable would lock the whole app.
 */
export const HARD_DEFAULT_TARGET = '05:00'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidHHMM(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value)
}

/** §4.10. Always returns a usable "HH:MM" — never throws, never returns undefined. */
export function safeTargetTime(raw: unknown): string {
  return isValidHHMM(raw) ? raw : HARD_DEFAULT_TARGET
}

/**
 * §4.3. The device's *current* resolved zone, read at the moment of the prompt —
 * never cached from onboarding, because a user who has flown somewhere still
 * wants tomorrow's alarm in the timezone they will wake up in.
 */
export function resolvedTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && tz.length > 0 ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * §4.9. A short zone label ("BST", "GMT+3") for display. Always shown next to a
 * time so there is no ambiguity about which clock it refers to.
 */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
  } catch {
    return timeZone
  }
}

/** Offset in ms such that `wallClockAsUTC = instant + offset`, for a given zone. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  // Intl renders midnight as hour 24 in some ICU versions; normalise it.
  const hour = get('hour') % 24
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return asUTC - instant
}

export type ZonedResolution = 'exact' | 'nonexistent' | 'ambiguous'

export interface ZonedInstant {
  instant: Date
  /**
   * `nonexistent` — the wall-clock time is inside a spring-forward gap; the
   * instant returned is shifted forward past the gap.
   * `ambiguous` — it falls in a fall-back duplicate hour; the *earlier* of the
   * two instants is returned, which is the one that arrives first and is
   * therefore the one an alarm should fire at.
   */
  resolution: ZonedResolution
}

/**
 * §4.2. Converts a local wall-clock time on a local calendar date into a real
 * instant, correctly, across DST boundaries.
 *
 * This exists because the two obvious shortcuts are both wrong on transition
 * nights: "now + 24h" lands on the wrong wall clock, and manual UTC-offset
 * arithmetic uses today's offset for tomorrow's date. Instead both plausible
 * offsets are tried and each is checked by round-tripping it back through the
 * zone, which is the only way to tell a real time from one that does not exist.
 */
export function zonedTimeToInstant(dateKey: string, hhmm: string, timeZone: string): ZonedInstant {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const [h, mi] = safeTargetTime(hhmm).split(':').map(Number)
  const wantUTC = Date.UTC(y, mo - 1, d, h, mi, 0)

  // The offsets in force a day either side bracket any transition in between.
  const offsetBefore = zoneOffsetMs(wantUTC - 86_400_000, timeZone)
  const offsetAfter = zoneOffsetMs(wantUTC + 86_400_000, timeZone)

  const candidates = [wantUTC - offsetBefore, wantUTC - offsetAfter]
  const valid = candidates.filter((t) => zoneOffsetMs(t, timeZone) === wantUTC - t)
  const unique = [...new Set(valid)].sort((a, b) => a - b)

  if (unique.length === 0) {
    // Spring-forward gap: the requested wall clock never occurs. Shift forward
    // past it rather than silently landing an hour early.
    return { instant: new Date(wantUTC - offsetBefore), resolution: 'nonexistent' }
  }
  if (unique.length > 1) {
    return { instant: new Date(unique[0]), resolution: 'ambiguous' }
  }
  return { instant: new Date(unique[0]), resolution: 'exact' }
}

/**
 * §4.1. The calendar date of the next run the plan is actually for, computed
 * from the device's local clock at render time.
 *
 * Deliberately *not* `today + 1`. If the wind-down screen is open at 23:58 and
 * midnight passes, a naive "tomorrow" jumps a day and silently starts planning
 * for the morning after the one five hours away. Anchoring on the next
 * check-in window that has not yet opened keeps the target stable across the
 * rollover and correct if the app is opened at 2am.
 */
export function nextRunDate(settings: Settings, now: Date = new Date()): string {
  const today = toDateKey(now)
  const safe = { ...settings, targetTime: safeTargetTime(settings.targetTime) }
  return now < windowForDate(safe, today).opensAt ? today : addDays(today, 1)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Chronotype ramp — spec §1. Built complete, shipped disabled.
 * ──────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_RAMP_STEP_MINUTES = 15
export const DEFAULT_RAMP_INTERVAL_DAYS = 6

/**
 * Where the ramp starts, in minutes *later* than the final target.
 *
 * The spec fixes the step size, the interval, the cap and the stage/streak
 * conditions but does not say where the ramp begins, so this is derived from
 * the chronotype band and can be overridden per-user via
 * `Settings.chronotypeRampStartOffsetMin`. An evening type starts an hour later
 * than target and walks in; everyone else has no ramp to walk.
 */
export function defaultRampStartOffset(band: ChronotypeBand | undefined): number {
  switch (band) {
    case 'definite-evening':
      return 60
    case 'moderate-evening':
      return 45
    default:
      return 0
  }
}

export interface RampContext {
  /** Local calendar date of the run being planned. */
  runDate: string
  /** Where the ramp is measured from — onboarding-adjacent, i.e. tracking start. */
  anchorDate: string
  stage: Stage
  currentStreak: number
  /** First date of the active streak, or null when there is no streak. */
  streakStartDate: string | null
}

export interface AlarmSuggestion {
  /** "HH:MM" — what to suggest tonight. */
  time: string
  /** True only when the ramp actually moved the time off `Settings.targetTime`. */
  rampApplied: boolean
  /** Minutes later than target. 0 whenever the ramp is off, capped, or ineligible. */
  offsetMinutes: number
}

function daysApart(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/**
 * §1. The suggested alarm time for a given night.
 *
 * The 95% case is one line: it is `Settings.targetTime`, read live, unchanged.
 * Regularity is the mechanism the whole app is built on, so nothing — not
 * readiness, not ACWR — is allowed to jitter this. The single exception is the
 * opt-in chronotype ramp, which is off by default.
 */
export function suggestedAlarmTime(settings: Settings, ctx: RampContext): AlarmSuggestion {
  const target = safeTargetTime(settings.targetTime)
  const off: AlarmSuggestion = { time: target, rampApplied: false, offsetMinutes: 0 }

  if (settings.chronotypeRampEnabled !== true) return off

  // Stage 1 only — this is onboarding-adjacent adaptation, not an ongoing
  // renegotiation of the wake time.
  if (ctx.stage !== 1) return off

  const startOffset =
    settings.chronotypeRampStartOffsetMin ?? defaultRampStartOffset(settings.chronotypeBand)
  if (startOffset <= 0) return off

  const step = settings.chronotypeRampStep ?? DEFAULT_RAMP_STEP_MINUTES
  const interval = settings.chronotypeRampIntervalDays ?? DEFAULT_RAMP_INTERVAL_DAYS
  if (step <= 0 || interval <= 0) return off

  /*
   * "Never fires while a streak is active mid-ramp." A live streak freezes the
   * ramp where it stood when the streak began rather than snapping the wake
   * time forward under someone who is currently succeeding at the old one.
   */
  const effectiveDate =
    ctx.currentStreak > 0 && ctx.streakStartDate !== null && ctx.streakStartDate < ctx.runDate
      ? ctx.streakStartDate
      : ctx.runDate

  const elapsed = daysApart(ctx.anchorDate, effectiveDate)
  if (elapsed < 0) return { time: minutesToHHMM(parseTime(target) + startOffset), rampApplied: true, offsetMinutes: startOffset }

  const stepsTaken = Math.floor(elapsed / interval)
  // Capped at the final target and never past it — the ramp only ever walks
  // the offset down to zero.
  const offsetMinutes = Math.max(0, startOffset - stepsTaken * step)
  if (offsetMinutes === 0) return off

  return {
    time: minutesToHHMM(parseTime(target) + offsetMinutes),
    rampApplied: true,
    offsetMinutes,
  }
}

/** Wraps within a day, so a ramp offset can never produce "25:15". */
function minutesToHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** First date of the current streak, derived rather than stored. */
export function streakStartDate(lastCheckInDate: string | null, currentStreak: number): string | null {
  if (!lastCheckInDate || currentStreak <= 0) return null
  return addDays(lastCheckInDate, -(currentStreak - 1))
}

/* ────────────────────────────────────────────────────────────────────────────
 * Display + platform handoff
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clock and period apart, so only the digits get tabular figures. */
export function formatAlarmParts(hhmm: string): { clock: string; period: string } {
  const [h, m] = safeTargetTime(hhmm).split(':').map(Number)
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return { clock: `${hour12}:${String(m).padStart(2, '0')}`, period: h < 12 ? 'AM' : 'PM' }
}

/** "5:00 AM" — the human-readable form used in the copy. */
export function formatAlarmDisplay(hhmm: string): string {
  const { clock, period } = formatAlarmParts(hhmm)
  return `${clock} ${period}`
}

/**
 * §4.8. An Android `intent:` handoff to the Clock app. This is best-effort by
 * nature: whether it resolves depends on the browser and on a compatible clock
 * app being installed, and web code cannot detect either. It is offered as a
 * shortcut alongside the written instructions, never instead of them.
 */
export function androidAlarmIntentUrl(hhmm: string, label = '5AM Run Club'): string {
  const [h, m] = safeTargetTime(hhmm).split(':').map(Number)
  return [
    'intent://alarm/#Intent',
    'scheme=alarm',
    'action=android.intent.action.SET_ALARM',
    `i.android.intent.extra.alarm.HOUR=${h}`,
    `i.android.intent.extra.alarm.MINUTES=${m}`,
    'B.android.intent.extra.alarm.SKIP_UI=false',
    `S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)}`,
    'end',
  ].join(';')
}

/**
 * Whether to *offer* the intent shortcut. Never used to decide whether to show
 * the manual instructions — those are unconditional (§4.8).
 */
export function supportsAlarmIntent(userAgent: string = navigator.userAgent): boolean {
  return /Android/i.test(userAgent) && /Chrome|Chromium/i.test(userAgent) && !/Firefox/i.test(userAgent)
}
