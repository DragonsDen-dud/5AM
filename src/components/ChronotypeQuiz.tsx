import { useState } from 'react'
import {
  BAND_LABELS,
  BAND_NOTES,
  CHRONOTYPE_QUESTIONS,
  bandForScore,
  scoreChronotype,
} from '../lib/chronotype'

interface Props {
  onComplete: (score: number, band: ReturnType<typeof bandForScore>) => void
  onSkip?: () => void
  skipLabel?: string
}

/**
 * Condensed morningness–eveningness assessment (§1.2). Informational, never
 * gatekeeping: an evening type is not refused, they get a longer, clearly
 * flagged adaptation runway instead of being measured against someone else's
 * clock and told they are failing.
 */
export function ChronotypeQuiz({ onComplete, onSkip, skipLabel = 'Skip' }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [index, setIndex] = useState(0)

  const question = CHRONOTYPE_QUESTIONS[index]
  const isLast = index === CHRONOTYPE_QUESTIONS.length - 1
  const answered = answers[question.id] !== undefined

  const choose = (value: number) => {
    const next = { ...answers, [question.id]: value }
    setAnswers(next)
    if (isLast) {
      const score = scoreChronotype(next)
      onComplete(score, bandForScore(score))
    } else {
      setIndex((i) => i + 1)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1.5">
        {CHRONOTYPE_QUESTIONS.map((q, i) => (
          <span
            key={q.id}
            className={`h-0.5 flex-1 rounded-full ${i <= index ? 'bg-ember' : 'bg-base-700'}`}
          />
        ))}
      </div>

      <div>
        <span className="label">
          Question {index + 1} of {CHRONOTYPE_QUESTIONS.length}
        </span>
        <p className="mt-2 text-lg leading-snug font-semibold tracking-tight">{question.prompt}</p>
      </div>

      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const active = answers[question.id] === option.value
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => choose(option.value)}
              className={`rounded-lg border px-4 py-3.5 text-left text-sm transition-colors ${
                active
                  ? 'border-ember bg-base-850 text-ember'
                  : 'border-base-600 bg-base-850/50 text-ink'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        {index > 0 && (
          <button type="button" onClick={() => setIndex((i) => i - 1)} className="btn-ghost">
            Back
          </button>
        )}
        {onSkip && (
          <button type="button" onClick={onSkip} className="btn-ghost ml-auto text-xs">
            {skipLabel}
          </button>
        )}
      </div>

      {!answered && index === 0 && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Six questions. This calibrates how the app paces you — it does not decide whether you are
          allowed to do this.
        </p>
      )}
    </div>
  )
}

export function ChronotypeResult({
  band,
}: {
  band: ReturnType<typeof bandForScore>
}) {
  return (
    <div className="card">
      <span className="label">Chronotype</span>
      <p className="mt-2 font-semibold">{BAND_LABELS[band]}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">{BAND_NOTES[band]}</p>
    </div>
  )
}
