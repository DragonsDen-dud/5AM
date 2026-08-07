import { db } from './db'
import { addDays, fromDateKey, todayKey } from './dates'
import { lastResolvedDate } from './window'
import type { Settings } from './types'

/**
 * Fresh-start re-engagement — phase-2 spec §4.4.
 *
 * Distinct from the daily recovery override in both trigger and tone. Recovery
 * says "one miss doesn't break a habit" the morning after a single lapse. This
 * fires only after a real dormancy (3+ consecutive missed days), and its job is
 * to reframe the coming period as a clean start rather than the continuation of
 * a broken streak.
 *
 * The copy lives here rather than in the rotation bank on purpose: it must not
 * be diluted by the no-repeat window, re-weighted by the bandit, or drawn on an
 * ordinary morning.
 */

export const DORMANCY_DAYS = 3

export interface FreshStartTrigger {
  /** Consecutive missed days ending at the last settled day. */
  dormantDays: number
  /** The temporal landmark that makes today a credible restart point. */
  landmark: 'monday' | 'first-of-month' | 'return'
  message: string
}

const LANDMARK_COPY: Record<FreshStartTrigger['landmark'], (days: number) => string> = {
  monday: (days) =>
    `${days} days gone and a new week starting. That coincidence is worth more than it sounds: people restart lapsed habits far more successfully at a temporal landmark than on an arbitrary Wednesday. The old streak is closed. This is day one of a different one, and day one has never been the hard part for you.`,
  'first-of-month': (days) =>
    `${days} days gone, and a new month on the calendar. Use it. The evidence on fresh starts is that a clean dividing line genuinely raises the odds of re-committing — not because the date is magic, but because it lets you stop negotiating with the last three weeks. Draw the line here.`,
  return: (days) =>
    `You have been away ${days} days, and you opened this anyway. That is the whole signal. Nothing about the last ${days} days needs explaining or making up. The only question is whether you are out the door tomorrow, and you already know the answer or you would not be reading this.`,
}

function landmarkFor(dateKey: string): FreshStartTrigger['landmark'] {
  const d = fromDateKey(dateKey)
  if (d.getDate() === 1) return 'first-of-month'
  if (d.getDay() === 1) return 'monday'
  return 'return'
}

/**
 * Detects a dormant streak and returns the re-engagement content, or null.
 * Fires at most once per dormancy episode — `lastFreshStartDate` is only
 * cleared by a completed run, so it cannot repeat every morning of a long lapse.
 */
export async function detectFreshStart(
  settings: Settings,
  now: Date = new Date(),
): Promise<FreshStartTrigger | null> {
  const today = todayKey(now)
  if (settings.lastFreshStartDate === today) return null

  const resolved = lastResolvedDate(settings, now)
  if (resolved < settings.trackingStartsOn) return null

  const logs = await db.runLogs.toArray()
  const byDate = new Map(logs.map((l) => [l.date, l.status]))

  let dormantDays = 0
  let cursor = resolved
  while (byDate.get(cursor) === 'missed' && dormantDays < 365) {
    dormantDays += 1
    cursor = addDays(cursor, -1)
  }

  if (dormantDays < DORMANCY_DAYS) return null

  // Already shown during this same dormancy episode.
  if (settings.lastFreshStartDate && settings.lastFreshStartDate > cursor) return null

  const landmark = landmarkFor(today)
  return { dormantDays, landmark, message: LANDMARK_COPY[landmark](dormantDays) }
}
