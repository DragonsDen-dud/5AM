import { db } from './db'
import { todayKey } from './dates'
import { upsertLoad } from './load'
import { recordRedDayChoice } from './readiness'
import { recomputeStreak } from './streak'
import { windowForDate, windowPhase } from './window'
import type { RunLog, Settings, VerificationMethod } from './types'

export interface CheckInPayload {
  verificationMethod: VerificationMethod
  photoBlob?: Blob
}

export interface RunDetails {
  distanceKm?: number
  durationMin?: number
  effort?: number
  note?: string
}

export class WindowClosedError extends Error {
  constructor() {
    super('The check-in window is not open.')
    this.name = 'WindowClosedError'
  }
}

/**
 * Records today's run. Refuses outside the window — there is no retroactive
 * check-in, which is the point of having a window at all.
 */
export async function checkIn(
  settings: Settings,
  payload: CheckInPayload,
  now: Date = new Date(),
): Promise<void> {
  const date = todayKey(now)
  const phase = windowPhase(windowForDate(settings, date), now)
  if (phase !== 'open') throw new WindowClosedError()

  const existing = await db.runLogs.where('date').equals(date).first()
  if (existing?.status === 'completed') return

  const entry: RunLog = {
    date,
    status: 'completed',
    verificationMethod: payload.verificationMethod,
    checkInTime: now.toISOString(),
    photoBlob: payload.photoBlob,
  }

  if (existing?.id !== undefined) {
    await db.runLogs.update(existing.id, entry)
  } else {
    await db.runLogs.add(entry)
  }

  await recomputeStreak(settings)
}

/**
 * Records a deliberate rest day. Only reachable from the red-readiness screen,
 * and only inside the window — it is a choice you make at the moment you would
 * otherwise run, not a retroactive excuse. The streak carries across it
 * (phase-2 §1.4) but lifetime run count does not move.
 */
export async function takeRestDay(
  settings: Settings,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const date = todayKey(now)
  const phase = windowPhase(windowForDate(settings, date), now)
  if (phase !== 'open') throw new WindowClosedError()

  const existing = await db.runLogs.where('date').equals(date).first()
  if (existing && existing.status !== 'missed') return

  const entry: RunLog = {
    date,
    status: 'rest',
    checkInTime: now.toISOString(),
    restReason: reason,
  }

  if (existing?.id !== undefined) await db.runLogs.update(existing.id, entry)
  else await db.runLogs.add(entry)

  await recordRedDayChoice(date, 'rest')
  await recomputeStreak(settings)
}

/**
 * Attaches the optional post-run detail fields. Only ever writes to today's
 * entry — past days are immutable.
 */
export async function saveRunDetails(details: RunDetails, now: Date = new Date()): Promise<void> {
  const date = todayKey(now)
  const existing = await db.runLogs.where('date').equals(date).first()
  if (!existing?.id) return

  await db.runLogs.update(existing.id, {
    distanceKm: details.distanceKm,
    durationMin: details.durationMin,
    effort: details.effort,
    note: details.note,
  })

  // Duration × effort is the session-RPE load proxy that feeds ACWR (§2.2).
  if (details.durationMin && details.effort) {
    await upsertLoad(date, { durationMin: details.durationMin, effort: details.effort })
  }
}
