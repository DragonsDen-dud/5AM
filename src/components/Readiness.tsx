import { useState } from 'react'
import { READINESS_LABELS } from '../lib/readiness'
import type { ReadinessLevel, ReadinessScore } from '../lib/types'

/**
 * Three small muted dots, in-palette (spec §7). Deliberately not traffic-light
 * bright and deliberately quiet — it sits near the streak number without ever
 * competing with it.
 */
const DOT_TONE: Record<ReadinessLevel, string> = {
  green: 'bg-signal',
  amber: 'bg-ember-soft/70',
  red: 'bg-miss',
}

const ORDER: ReadinessLevel[] = ['green', 'amber', 'red']

export function ReadinessDots({ level }: { level: ReadinessLevel }) {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {ORDER.map((l) => (
        <span
          key={l}
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            l === level ? DOT_TONE[l] : 'bg-base-600'
          }`}
        />
      ))}
    </span>
  )
}

export function ReadinessRow({ score }: { score: ReadinessScore }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1.5">
        <ReadinessDots level={score.level} />
      </span>
      <p className="flex-1 text-[11px] leading-relaxed text-ink-faint">
        <span className="sr-only">Readiness: {READINESS_LABELS[score.level]}. </span>
        {score.reasoning}
      </p>
    </div>
  )
}

export type RedChoice = 'ran' | 'easy' | 'rest'

interface GateProps {
  score: ReadinessScore
  onChoose: (choice: RedChoice) => void
  onBack: () => void
}

const CHOICES: { id: RedChoice; title: string; body: string }[] = [
  {
    id: 'ran',
    title: 'Run it anyway',
    body: 'You have read the signal and you are going regardless. That is a legitimate answer and the app will not argue with it.',
  },
  {
    id: 'easy',
    title: 'Easy version',
    body: 'Out the door, but genuinely easy — shorter, slower, conversational. The time is protected and the load is not.',
  },
  {
    id: 'rest',
    title: 'Rest, keep the streak',
    body: 'A deliberate rest day. It holds your streak and is recorded permanently as a rest, not a miss. Backing off inside a plan is the plan working.',
  },
]

/**
 * The one place in the whole app where friction is deliberately added. Research
 * on ego depletion says removing willpower-dependent decisions helps — so this
 * is the single moment worth spending that friction on, and only on a red day.
 * It never blocks: every path leads onward, including running anyway.
 */
export function ReadinessGate({ score, onChoose, onBack }: GateProps) {
  const [selected, setSelected] = useState<RedChoice | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-miss/40 bg-miss-dim/20 p-5">
        <span className="label text-miss">Readiness: red</span>
        <p className="mt-2 leading-relaxed text-ink">{score.reasoning}</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-dim">
          This is information, not permission. Pick one and the app records what you chose.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CHOICES.map((choice) => {
          const active = selected === choice.id
          return (
            <button
              key={choice.id}
              type="button"
              onClick={() => setSelected(choice.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active ? 'border-ember bg-base-850' : 'border-base-600 bg-base-850/50'
              }`}
            >
              <span className={`font-semibold ${active ? 'text-ember' : 'text-ink'}`}>
                {choice.title}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-ink-dim">
                {choice.body}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onChoose(selected)}
          className="btn-primary flex-1"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
