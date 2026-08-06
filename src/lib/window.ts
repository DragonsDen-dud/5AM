import { atMinutes, formatTime, parseTime, toDateKey } from './dates'
import type { Settings } from './types'

/**
 * The window opens this many minutes before the target run time, so the default
 * 05:00 target with a 75-minute window runs 04:45 → 06:00 (spec §9.2).
 */
export const WINDOW_LEAD_MINUTES = 15

/** How far ahead of window-open the "opens in 5 minutes" nudge fires (spec §3.6). */
export const PRE_OPEN_NOTICE_MINUTES = 5

export interface CheckInWindow {
  dateKey: string
  opensAt: Date
  closesAt: Date
  /** Minute-of-day the window opens — useful for scheduling. */
  opensAtMinutes: number
}

export function windowForDate(settings: Settings, dateKey: string): CheckInWindow {
  const opensAtMinutes = parseTime(settings.targetTime) - WINDOW_LEAD_MINUTES
  return {
    dateKey,
    opensAt: atMinutes(dateKey, opensAtMinutes),
    closesAt: atMinutes(dateKey, opensAtMinutes + settings.windowMinutes),
    opensAtMinutes,
  }
}

export function windowLabel(settings: Settings): string {
  const open = parseTime(settings.targetTime) - WINDOW_LEAD_MINUTES
  return `${formatTime(open)}–${formatTime(open + settings.windowMinutes)}`
}

export type WindowPhase = 'before' | 'open' | 'closed'

export function windowPhase(w: CheckInWindow, now: Date): WindowPhase {
  if (now < w.opensAt) return 'before'
  if (now <= w.closesAt) return 'open'
  return 'closed'
}

/**
 * The most recent date whose check-in window has fully closed. Anything on or
 * before this date has a settled outcome; anything after it is still live or in
 * the future. Reconciliation and the recovery override both key off this.
 */
export function lastResolvedDate(settings: Settings, now: Date = new Date()): string {
  const today = toDateKey(now)
  const todayWindow = windowForDate(settings, today)
  if (now > todayWindow.closesAt) return today
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return toDateKey(yesterday)
}

/** Fraction of the window still remaining, 1 → 0. Drives the depleting time-bar. */
export function windowRemainingFraction(w: CheckInWindow, now: Date): number {
  const total = w.closesAt.getTime() - w.opensAt.getTime()
  if (total <= 0) return 0
  const left = w.closesAt.getTime() - now.getTime()
  return Math.max(0, Math.min(1, left / total))
}
