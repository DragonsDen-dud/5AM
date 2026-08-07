import { stageOneExtensionDays } from './chronotype'
import { daysBetween, todayKey } from './dates'
import type { MessageStage, Settings } from './types'

export type Stage = 1 | 2 | 3

export const STAGE_LABELS: Record<Stage, string> = {
  1: 'Schedule-building',
  2: 'Routine-automating',
  3: 'Fortifying',
}

export const BASE_STAGE_ONE_END = 21
export const BASE_STAGE_TWO_END = 70

/**
 * Stage boundaries, adjusted for chronotype (phase-2 §1.2). An evening type
 * gets a longer schedule-building runway rather than being measured against a
 * morning type's pace and told they are behind.
 */
export function stageBoundaries(settings: Settings): { stageOneEnd: number; stageTwoEnd: number } {
  const extension = stageOneExtensionDays(settings.chronotypeBand)
  return {
    stageOneEnd: BASE_STAGE_ONE_END + extension,
    stageTwoEnd: BASE_STAGE_TWO_END + extension,
  }
}

export function stageDescription(stage: Stage, settings: Settings): string {
  const { stageOneEnd, stageTwoEnd } = stageBoundaries(settings)
  const extended = stageOneEnd > BASE_STAGE_ONE_END
  switch (stage) {
    case 1:
      return `Days 1–${stageOneEnd}. The work is protecting the fixed time and writing the plan.${
        extended ? ' Extended for your chronotype — the runway is longer, not the standard lower.' : ''
      }`
    case 2:
      return `Days ${stageOneEnd + 1}–${stageTwoEnd}. The work is identity and accumulated evidence.`
    default:
      return `Day ${stageTwoEnd + 1} onward. The work is holding the line through the bad weeks.`
  }
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
  const { stageOneEnd, stageTwoEnd } = stageBoundaries(settings)
  if (days <= stageOneEnd) return 1
  if (days <= stageTwoEnd) return 2
  return 3
}

export function stageMatches(messageStage: MessageStage, stage: Stage): boolean {
  return messageStage === 'any' || messageStage === stage
}
