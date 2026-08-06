import { daysBetween, todayKey } from './dates'
import type { MessageStage, Settings } from './types'

export type Stage = 1 | 2 | 3

export const STAGE_LABELS: Record<Stage, string> = {
  1: 'Schedule-building',
  2: 'Routine-automating',
  3: 'Fortifying',
}

export const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  1: 'Days 1–21. The work is protecting the fixed time and writing the plan.',
  2: 'Days 22–70. The work is identity and accumulated evidence.',
  3: 'Day 71 onward. The work is holding the line through the bad weeks.',
}

/** Day 1 is the onboarding day itself. */
export function daysSinceOnboarding(settings: Settings, now: Date = new Date()): number {
  return daysBetween(settings.onboardedAt, todayKey(now)) + 1
}

/**
 * Stage is a function of days since onboarding, never of streak length — a reset
 * streak does not send you back to beginner messaging (spec §10.4).
 */
export function currentStage(settings: Settings, now: Date = new Date()): Stage {
  const days = daysSinceOnboarding(settings, now)
  if (days <= 21) return 1
  if (days <= 70) return 2
  return 3
}

export function stageMatches(messageStage: MessageStage, stage: Stage): boolean {
  return messageStage === 'any' || messageStage === stage
}
