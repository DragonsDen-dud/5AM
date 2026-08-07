import { db } from './db'
import { addDays, daysBetween, todayKey } from './dates'
import type {
  Message,
  MessageCategory,
  MessageHistory,
  MessagePerformance,
  MessageSlot,
  RunLog,
} from './types'

/**
 * Adaptive Content Engine — phase-2 spec §3.2.
 *
 * A deliberately small epsilon-greedy bandit over message *categories*, not
 * individual messages. It re-weights inside whatever pool the Phase 1 rules
 * already produced; it never selects the pool. The recovery override and the
 * 10-day no-repeat window run first and are hard constraints — personalisation
 * does not get to overrule the two evidence-backed guardrails.
 *
 * Everything here is explainable on purpose. A black box that quietly decides
 * what Den reads every morning would be the wrong tool for this job.
 */

/** 15% of picks are uniform, to keep exploring rather than locking onto noise. */
export const EPSILON = 0.15

/** Weights are recomputed weekly, not per message — ~1–2 data points a day. */
export const RECOMPUTE_INTERVAL_DAYS = 7

/** Below this many exposures a category's own rate is not trusted. */
export const MIN_SAMPLE = 5

/** How far back exposures are counted. */
export const PERFORMANCE_WINDOW_DAYS = 120

/** Floor so a cold category never drops out of rotation entirely. */
const WEIGHT_FLOOR = 0.25

function keyFor(slot: MessageSlot, category: MessageCategory): string {
  return `${slot}:${category}`
}

/**
 * The day a slot's message is meant to influence: a morning message is aimed at
 * that same morning's run; a night message is aimed at the next morning's.
 */
export function outcomeDateFor(slot: MessageSlot, shownDate: string): string {
  return slot === 'night' ? addDays(shownDate, 1) : shownDate
}

export function computePerformance(
  history: MessageHistory[],
  messages: Message[],
  runLogs: RunLog[],
  now: Date = new Date(),
): MessagePerformance[] {
  const today = todayKey(now)
  const from = addDays(today, -PERFORMANCE_WINDOW_DAYS)

  const messageById = new Map(messages.map((m) => [m.id, m]))
  const statusByDate = new Map(runLogs.map((l) => [l.date, l.status]))

  const tally = new Map<string, { slot: MessageSlot; category: MessageCategory; hits: number; total: number }>()

  for (const entry of history) {
    if (entry.shownDate < from) continue

    const message = messageById.get(entry.messageId)
    if (!message) continue

    const status = statusByDate.get(outcomeDateFor(entry.slot, entry.shownDate))
    // Unresolved days and deliberate rest days are not evidence either way.
    if (status !== 'completed' && status !== 'missed') continue

    const key = keyFor(entry.slot, message.category)
    const bucket = tally.get(key) ?? {
      slot: entry.slot,
      category: message.category,
      hits: 0,
      total: 0,
    }
    bucket.total += 1
    if (status === 'completed') bucket.hits += 1
    tally.set(key, bucket)
  }

  const recomputedAt = today
  return [...tally.entries()].map(([id, b]) => ({
    id,
    slot: b.slot,
    category: b.category,
    rollingCompletionRate: b.total > 0 ? b.hits / b.total : 0,
    sampleSize: b.total,
    lastRecomputed: recomputedAt,
  }))
}

/** Recomputes at most weekly. Returns the current table either way. */
export async function refreshPerformance(now: Date = new Date()): Promise<MessagePerformance[]> {
  const existing = await db.messagePerformance.toArray()
  const today = todayKey(now)

  const freshest = existing.reduce<string | null>(
    (latest, row) => (latest === null || row.lastRecomputed > latest ? row.lastRecomputed : latest),
    null,
  )

  if (freshest !== null && daysBetween(freshest, today) < RECOMPUTE_INTERVAL_DAYS) {
    return existing
  }

  const [history, messages, runLogs] = await Promise.all([
    db.messageHistory.toArray(),
    db.messages.toArray(),
    db.runLogs.toArray(),
  ])

  const next = computePerformance(history, messages, runLogs, now)
  await db.messagePerformance.clear()
  if (next.length > 0) await db.messagePerformance.bulkPut(next)
  return next
}

export interface BanditWeights {
  /** Multiplier per category, ≥ WEIGHT_FLOOR. Categories absent get 1. */
  byCategory: Map<MessageCategory, number>
  /** True when this pick is an exploration draw and weights are ignored. */
  exploring: boolean
}

/**
 * Turns the performance table into per-category multipliers for one slot.
 * Categories under the minimum sample size fall back to the observed mean, so
 * a brand-new category is neither punished nor privileged.
 */
export function weightsForSlot(
  performance: MessagePerformance[],
  slot: MessageSlot,
  roll: number = Math.random(),
): BanditWeights {
  const inSlot = performance.filter((p) => p.slot === slot)

  if (roll < EPSILON || inSlot.length === 0) {
    return { byCategory: new Map(), exploring: true }
  }

  const trusted = inSlot.filter((p) => p.sampleSize >= MIN_SAMPLE)
  if (trusted.length === 0) return { byCategory: new Map(), exploring: true }

  const mean =
    trusted.reduce((sum, p) => sum + p.rollingCompletionRate, 0) / trusted.length

  const byCategory = new Map<MessageCategory, number>()
  for (const row of inSlot) {
    const rate = row.sampleSize >= MIN_SAMPLE ? row.rollingCompletionRate : mean
    byCategory.set(row.category, Math.max(WEIGHT_FLOOR, rate))
  }

  return { byCategory, exploring: false }
}

export interface PerformanceInsight {
  category: MessageCategory
  slot: MessageSlot
  rate: number
  sampleSize: number
}

/** Plain-language transparency for Settings — no hidden manipulation. */
export function describePerformance(performance: MessagePerformance[]): {
  best: PerformanceInsight | null
  rows: PerformanceInsight[]
} {
  const rows = performance
    .filter((p) => p.sampleSize >= MIN_SAMPLE)
    .map((p) => ({
      category: p.category,
      slot: p.slot,
      rate: p.rollingCompletionRate,
      sampleSize: p.sampleSize,
    }))
    .sort((a, b) => b.rate - a.rate)

  return { best: rows[0] ?? null, rows }
}
