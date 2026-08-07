import { db } from './db'
import { refreshPerformance, weightsForSlot, type BanditWeights } from './bandit'
import { addDays, todayKey } from './dates'
import { currentStage, stageMatches, type Stage } from './stage'
import { lastResolvedDate } from './window'
import type { Message, MessageSlot, Settings } from './types'

/** Spec §10.3 step 4. */
export const NO_REPEAT_DAYS = 10

/** Spec §10.3 step 5 — `plan` is the highest-leverage category, night slot only. */
export const PLAN_WEIGHT = 2

/**
 * Phase 2 §2.3 — `injury-aware` is boosted when the load system is actually
 * flagging something. Outside those conditions it sits in normal rotation
 * rather than nagging about a hamstring every morning.
 */
export const INJURY_AWARE_WEIGHT = 3

export interface RotationContext {
  /** ACWR is elevated, or football landed on a running day. */
  injuryRiskFlagged?: boolean
}

/**
 * Weighted random pick. Kept pure and exported so the rotation rules can be
 * reasoned about (and tested) without touching IndexedDB.
 */
export function weightedPick(
  pool: Message[],
  slot: MessageSlot,
  bandit?: BanditWeights,
  context: RotationContext = {},
  roll: number = Math.random(),
): Message | null {
  if (pool.length === 0) return null

  const weights = pool.map((m) => {
    let weight = 1
    if (slot === 'night' && m.category === 'plan') weight *= PLAN_WEIGHT
    if (context.injuryRiskFlagged && m.category === 'injury-aware') weight *= INJURY_AWARE_WEIGHT
    // Bandit weighting is applied last and only re-scales inside the pool the
    // hard rules already produced.
    if (bandit && !bandit.exploring) weight *= bandit.byCategory.get(m.category) ?? 1
    return weight
  })

  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return pool[0]

  let remaining = roll * total
  for (let i = 0; i < pool.length; i += 1) {
    remaining -= weights[i]
    if (remaining <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

/**
 * Recovery override — spec §10.3 step 3, and the single highest-priority rule in
 * the system. If the last settled day was a miss, the very next message in any
 * slot is forced to a `recovery` message, so the what-the-hell spiral gets
 * interrupted before it starts. Once one recovery message has gone out for that
 * miss, the override releases and normal rotation resumes.
 */
export async function shouldForceRecovery(
  settings: Settings,
  now: Date = new Date(),
): Promise<boolean> {
  const resolved = lastResolvedDate(settings, now)
  if (resolved < settings.trackingStartsOn) return false

  const log = await db.runLogs.where('date').equals(resolved).first()
  if (!log || log.status !== 'missed') return false

  // Has a recovery message already been delivered since the miss?
  const since = await db.messageHistory.where('shownDate').aboveOrEqual(resolved).toArray()
  if (since.length === 0) return true

  const shownIds = [...new Set(since.map((h) => h.messageId))]
  const shown = await db.messages.bulkGet(shownIds)
  return !shown.some((m) => m?.category === 'recovery')
}

interface SelectionContext {
  slot: MessageSlot
  stage: Stage
  forceRecovery: boolean
  /** Message ids shown within the no-repeat window. */
  recentIds: Set<string>
  bandit?: BanditWeights
  rotation?: RotationContext
}

export function selectMessage(all: Message[], ctx: SelectionContext): Message | null {
  // Generated messages awaiting review never enter rotation.
  const inSlot = all.filter((m) => m.slot === ctx.slot && m.pendingReview !== 1)

  // Step 3 runs ahead of steps 1–2: on a forced recovery the stage filter is skipped.
  let pool = ctx.forceRecovery
    ? inSlot.filter((m) => m.category === 'recovery')
    : inSlot.filter((m) => stageMatches(m.stage, ctx.stage))

  // A slot with no recovery copy falls back to normal rotation rather than nothing.
  if (pool.length === 0 && ctx.forceRecovery) {
    pool = inSlot.filter((m) => stageMatches(m.stage, ctx.stage))
  }
  if (pool.length === 0) pool = inSlot
  if (pool.length === 0) return null

  // Step 4: drop the no-repeat exclusion rather than return nothing.
  const fresh = pool.filter((m) => !ctx.recentIds.has(m.id))
  const finalPool = fresh.length > 0 ? fresh : pool

  return weightedPick(finalPool, ctx.slot, ctx.bandit, ctx.rotation)
}

/**
 * Returns the message for a slot on a given date, picking and logging it on the
 * first call of the day and returning the same one on every call after that —
 * so the morning card does not reshuffle each time the screen re-renders.
 */
export async function getDailyMessage(
  settings: Settings,
  slot: MessageSlot,
  now: Date = new Date(),
  rotation: RotationContext = {},
): Promise<Message | null> {
  const dateKey = todayKey(now)

  const alreadyShown = await db.messageHistory
    .where('[slot+shownDate]')
    .equals([slot, dateKey])
    .first()

  if (alreadyShown) {
    const existing = await db.messages.get(alreadyShown.messageId)
    if (existing) return existing
  }

  const [all, forceRecovery, recent, performance] = await Promise.all([
    db.messages.toArray(),
    shouldForceRecovery(settings, now),
    db.messageHistory.where('shownDate').aboveOrEqual(addDays(dateKey, -NO_REPEAT_DAYS)).toArray(),
    refreshPerformance(now),
  ])

  const picked = selectMessage(all, {
    slot,
    stage: currentStage(settings, now),
    forceRecovery,
    recentIds: new Set(recent.map((h) => h.messageId)),
    bandit: weightsForSlot(performance, slot),
    rotation,
  })

  if (!picked) return null

  // Step 6.
  await db.messageHistory.add({ messageId: picked.id, shownDate: dateKey, slot })
  return picked
}
