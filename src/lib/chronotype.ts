import type { ChronotypeBand } from './types'

export type { ChronotypeBand }

/**
 * A condensed morningness–eveningness assessment (phase-2 spec §1.2). Six
 * questions in the spirit of the Horne–Östberg MEQ, not the validated
 * instrument itself — it is used to calibrate expectations and messaging pace,
 * never to gate anything.
 *
 * Scoring follows the MEQ convention: higher totals mean more morning-typed.
 */

export interface ChronotypeOption {
  label: string
  value: number
}

export interface ChronotypeQuestion {
  id: string
  prompt: string
  options: ChronotypeOption[]
}

export const CHRONOTYPE_QUESTIONS: ChronotypeQuestion[] = [
  {
    id: 'bedtime',
    prompt: 'With no obligations at all, when would you choose to go to bed?',
    options: [
      { label: 'Before 21:00', value: 5 },
      { label: '21:00 – 22:15', value: 4 },
      { label: '22:15 – 00:30', value: 3 },
      { label: '00:30 – 01:45', value: 2 },
      { label: 'After 01:45', value: 1 },
    ],
  },
  {
    id: 'wake',
    prompt: 'With no obligations, when would you choose to get up?',
    options: [
      { label: 'Before 06:30', value: 5 },
      { label: '06:30 – 07:45', value: 4 },
      { label: '07:45 – 09:45', value: 3 },
      { label: '09:45 – 11:00', value: 2 },
      { label: 'After 11:00', value: 1 },
    ],
  },
  {
    id: 'morning-ease',
    prompt: 'How hard is the first half hour after waking, normally?',
    options: [
      { label: 'Not hard at all', value: 5 },
      { label: 'Slightly hard', value: 4 },
      { label: 'Fairly hard', value: 2 },
      { label: 'Very hard', value: 1 },
    ],
  },
  {
    id: 'alarm-dependence',
    prompt: 'If you had to get up at 05:00, how would that go?',
    options: [
      { label: 'Fine — no alarm needed', value: 5 },
      { label: 'One alarm, no real trouble', value: 4 },
      { label: 'Doable but unpleasant', value: 2 },
      { label: 'Very difficult', value: 1 },
    ],
  },
  {
    id: 'peak',
    prompt: 'When do you feel sharpest — mentally and physically?',
    options: [
      { label: '05:00 – 09:00', value: 5 },
      { label: '09:00 – 12:00', value: 4 },
      { label: '12:00 – 17:00', value: 3 },
      { label: '17:00 – 22:00', value: 2 },
      { label: 'Late at night', value: 1 },
    ],
  },
  {
    id: 'evening-tiredness',
    prompt: 'How tired are you by 22:00 on a normal day?',
    options: [
      { label: 'Ready for bed', value: 5 },
      { label: 'Noticeably winding down', value: 4 },
      { label: 'Still going', value: 2 },
      { label: 'Wide awake', value: 1 },
    ],
  },
]

export const CHRONOTYPE_MIN = CHRONOTYPE_QUESTIONS.length // all 1s
export const CHRONOTYPE_MAX = CHRONOTYPE_QUESTIONS.reduce(
  (total, q) => total + Math.max(...q.options.map((o) => o.value)),
  0,
)

export function scoreChronotype(answers: Record<string, number>): number {
  return CHRONOTYPE_QUESTIONS.reduce((total, q) => total + (answers[q.id] ?? 0), 0)
}

export function bandForScore(score: number): ChronotypeBand {
  if (score >= 26) return 'definite-morning'
  if (score >= 22) return 'moderate-morning'
  if (score >= 16) return 'intermediate'
  if (score >= 11) return 'moderate-evening'
  return 'definite-evening'
}

export const BAND_LABELS: Record<ChronotypeBand, string> = {
  'definite-evening': 'Definite evening type',
  'moderate-evening': 'Moderate evening type',
  intermediate: 'Intermediate type',
  'moderate-morning': 'Moderate morning type',
  'definite-morning': 'Definite morning type',
}

export const BAND_NOTES: Record<ChronotypeBand, string> = {
  'definite-evening':
    'Five in the morning is genuinely further from your natural clock than it is for most people. That is not an excuse and it is not a disqualification — it means your adaptation runway is longer, and the app will pace you accordingly rather than pretend you are behind.',
  'moderate-evening':
    'You lean late. The schedule-building phase is extended for you, with more weight on sleep timing, because protecting the bedtime is the part that will decide this.',
  intermediate:
    'You sit in the middle of the range. Standard pacing — the fixed time is still the lever that matters most.',
  'moderate-morning':
    'You lean early. The clock is on your side; the work is consistency rather than adaptation.',
  'definite-morning':
    'You are already built for this. Expect the schedule to settle faster than average, and do not mistake that for it being automatic yet.',
}

/**
 * Extra days added to Stage 1 for evening types. An evening-typed user should
 * not be told they are failing at a pace calibrated for a morning type.
 */
export function stageOneExtensionDays(band: ChronotypeBand | undefined): number {
  switch (band) {
    case 'definite-evening':
      return 14
    case 'moderate-evening':
      return 7
    default:
      return 0
  }
}
