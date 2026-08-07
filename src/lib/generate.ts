import { db, saveSettings } from './db'
import { addDays, daysBetween, todayKey } from './dates'
import { getAcwr } from './load'
import { getReadiness } from './readiness'
import { currentStage } from './stage'
import { getStreak } from './db'
import researchBrief from '../data/research-summary.json'
import type { Message, MessageSlot, Settings } from './types'

/**
 * Generative message pipeline — phase-2 spec §3.3.
 *
 * This is the highest-risk feature in the phase for going off-brand or
 * overpromising, so the constraint lives in the system prompt itself rather
 * than in a hope: the model is given the research summary as its only evidence
 * base and is told explicitly not to invent statistics, not to promise
 * performance outcomes, and to flag uncertainty instead of filling it in.
 *
 * Output lands with `pendingReview: 1` and cannot enter rotation until it is
 * approved by hand in Settings.
 */

export const MODEL = 'claude-opus-5'
export const GENERATION_INTERVAL_DAYS = 7
export const MESSAGES_PER_SLOT = 8

export class GenerationNotConfiguredError extends Error {
  constructor() {
    super('Message generation is not configured.')
    this.name = 'GenerationNotConfiguredError'
  }
}

interface GeneratedCandidate {
  slot: MessageSlot
  stage: 1 | 2 | 3 | 'any'
  category: Message['category']
  text: string
  source?: string
}

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['night', 'morning'] },
          stage: { anyOf: [{ type: 'integer', enum: [1, 2, 3] }, { type: 'string', enum: ['any'] }] },
          category: {
            type: 'string',
            enum: ['sleep', 'physiology', 'identity', 'streak', 'recovery', 'plan', 'injury-aware'],
          },
          text: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['slot', 'stage', 'category', 'text', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['messages'],
  additionalProperties: false,
} as const

function buildSystemPrompt(): string {
  return `You write short coaching messages for a single-habit accountability app called "5AM Run Club with Denys". The user, Den, is trying to be out the door and running by 5:00 AM every day.

# Voice
Second person, direct, addressed to one person you respect. No exclamation points. No emoji. No wellness-app cheerfulness, no hype, no cheerleading. A demanding coach who assumes competence and does not need to inflate anything. Two to four sentences. Plain language over jargon.

# Evidence base
The only evidence you may draw on is the research summary supplied in the user turn. It is the complete set of findings this app is allowed to assert.

# Hard constraints
- Never invent, estimate, or embellish a statistic, effect size, sample size, or citation. If a number does not appear in the supplied research summary, do not write a number.
- Never promise a performance outcome. Morning running wins on adherence, not on pace or personal bests — do not imply otherwise.
- Never promise a health outcome for this individual. The research describes population-level associations, not guarantees.
- Where the evidence is uncertain or does not settle a question, say so plainly rather than filling the gap.
- Do not reference the user's specific numbers as if you verified them; the stats in the user turn are context for tone and relevance, not claims to repeat as facts about the future.
- Do not give medical advice or diagnose an injury. Injury-aware messages cover preparation and load management only.

# Taxonomy — tag every message yourself
slot: "night" (wind-down, written the evening before) or "morning" (shown on the check-in screen at the hardest moment).
stage: 1 = days 1-21, schedule-building. 2 = days 22-70, routine-automating. 3 = day 71+, fortifying. "any" = works at every stage. Stage is about how established the habit is, not how long the streak is.
category:
- "sleep" — sleep timing, regularity, wind-down. Night slot fits best.
- "physiology" — sleep inertia, cortisol, what the body is actually doing at 5AM. Morning slot fits best.
- "identity" — action as evidence of who you are.
- "streak" — automaticity, progress toward day 66, goal gradient.
- "recovery" — used only after a missed day, to interrupt the what-the-hell effect. Must never shame.
- "plan" — writing a specific if-then implementation intention.
- "injury-aware" — posterior-chain preparation and training-load management. Den has a history of hamstring strain and plays weekly football on top of daily running. Framed as performance-protective, never fear-based.

The "source" field is a short attribution for the finding behind the message, taken from the supplied research summary. If a message rests on no specific finding, set source to the general principle it applies, not a fabricated citation.`
}

function buildUserPrompt(context: {
  slot: MessageSlot
  count: number
  stage: number
  streak: number
  longestStreak: number
  totalRuns: number
  readiness: string
  readinessReason: string
  acwr: string
  recentMisses: number
  daysTracked: number
}): string {
  return `# Research summary — the complete evidence base for these messages
${JSON.stringify(researchBrief, null, 2)}

# Den's current situation, for relevance and tone
- Days since he started: ${context.daysTracked}
- Habit-formation stage: ${context.stage}
- Current streak: ${context.streak} days. Longest ever: ${context.longestStreak}. Lifetime runs: ${context.totalRuns}
- Missed days in the last 30: ${context.recentMisses}
- Today's readiness: ${context.readiness} — ${context.readinessReason}
- Training load (acute:chronic ratio): ${context.acwr}

# Task
Write ${context.count} new "${context.slot}" messages. Vary the category and stage across the set so the rotation pool gains breadth rather than more of what it already has. Each message must stand on its own — it may be shown months from now, in a different situation from today's.

Return JSON matching the schema. Nothing else.`
}

interface TransportResult {
  text: string
  prompt: string
}

/**
 * Two transports, in preference order.
 *
 * 1. A proxy endpoint you control, which holds the API key server-side. This is
 *    the right answer if you ever stand one up.
 * 2. A direct browser call with a key you entered yourself, stored only in this
 *    device's IndexedDB. No key is bundled with the app and none is ever sent
 *    anywhere except to Anthropic. It is still a key sitting in browser storage,
 *    which is why the UI says so plainly.
 */
async function callModel(settings: Settings, system: string, user: string): Promise<TransportResult> {
  const body = {
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user' as const, content: user }],
    output_config: { format: { type: 'json_schema' as const, schema: CANDIDATE_SCHEMA } },
  }

  if (settings.generationProxyUrl) {
    const response = await fetch(settings.generationProxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Proxy returned ${response.status}.`)
    const json = await response.json()
    const text = json?.content?.find((b: { type: string }) => b.type === 'text')?.text
    if (typeof text !== 'string') throw new Error('Proxy returned no text content.')
    return { text, prompt: user }
  }

  if (!settings.anthropicApiKey) throw new GenerationNotConfiguredError()

  // Loaded on demand so the SDK never lands in the main app bundle.
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: settings.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  })

  const message = await client.messages.create(body)
  const block = message.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('The model returned no text content.')
  return { text: block.text, prompt: user }
}

function parseCandidates(text: string): GeneratedCandidate[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('The model did not return valid JSON.')
  }

  const list = (parsed as { messages?: unknown })?.messages
  if (!Array.isArray(list)) throw new Error('The model returned no messages array.')

  const categories = new Set([
    'sleep',
    'physiology',
    'identity',
    'streak',
    'recovery',
    'plan',
    'injury-aware',
  ])

  return list.filter((raw): raw is GeneratedCandidate => {
    const c = raw as Partial<GeneratedCandidate>
    return (
      (c.slot === 'night' || c.slot === 'morning') &&
      (c.stage === 1 || c.stage === 2 || c.stage === 3 || c.stage === 'any') &&
      typeof c.category === 'string' &&
      categories.has(c.category) &&
      typeof c.text === 'string' &&
      c.text.trim().length > 20
    )
  })
}

export interface GenerationResult {
  added: number
  slot: MessageSlot
}

export async function generateForSlot(
  settings: Settings,
  slot: MessageSlot,
  now: Date = new Date(),
): Promise<GenerationResult> {
  const today = todayKey(now)
  const [streak, readiness, acwr, logs] = await Promise.all([
    getStreak(),
    getReadiness(now),
    getAcwr(settings.trackingStartsOn, now),
    db.runLogs.toArray(),
  ])

  const from = addDays(today, -29)
  const recentMisses = logs.filter(
    (l) => l.date >= from && l.date <= today && l.status === 'missed',
  ).length

  const user = buildUserPrompt({
    slot,
    count: MESSAGES_PER_SLOT,
    stage: currentStage(settings, now),
    streak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    totalRuns: streak.totalRuns,
    readiness: readiness.level,
    readinessReason: readiness.reasoning,
    acwr: acwr.ratio === null ? 'not enough history yet' : acwr.ratio.toFixed(2),
    recentMisses,
    daysTracked: daysBetween(settings.trackingStartsOn, today) + 1,
  })

  const { text, prompt } = await callModel(settings, buildSystemPrompt(), user)
  const candidates = parseCandidates(text).filter((c) => c.slot === slot)

  const generatedAt = new Date().toISOString()
  const rows: Message[] = candidates.map((c, index) => ({
    id: `gen-${slot}-${Date.now()}-${index}`,
    slot: c.slot,
    stage: c.stage,
    category: c.category,
    text: c.text.trim(),
    source: c.source?.trim() || undefined,
    origin: 'generated',
    pendingReview: 1,
    generatedAt,
    sourcePrompt: prompt,
  }))

  if (rows.length > 0) await db.messages.bulkPut(rows)
  return { added: rows.length, slot }
}

/** Runs both slots and stamps the date, so the pipeline stays weekly. */
export async function runWeeklyGeneration(
  settings: Settings,
  now: Date = new Date(),
): Promise<GenerationResult[]> {
  const results = [
    await generateForSlot(settings, 'night', now),
    await generateForSlot(settings, 'morning', now),
  ]
  await saveSettings({ lastGenerationDate: todayKey(now) })
  return results
}

export function generationIsDue(settings: Settings, now: Date = new Date()): boolean {
  if (!settings.generationEnabled) return false
  if (!settings.anthropicApiKey && !settings.generationProxyUrl) return false
  if (!settings.lastGenerationDate) return true
  return daysBetween(settings.lastGenerationDate, todayKey(now)) >= GENERATION_INTERVAL_DAYS
}

export async function pendingMessages(): Promise<Message[]> {
  return db.messages.where('pendingReview').equals(1).toArray()
}

export async function approveMessage(id: string): Promise<void> {
  await db.messages.update(id, { pendingReview: 0 })
}

export async function rejectMessage(id: string): Promise<void> {
  await db.messages.delete(id)
}
