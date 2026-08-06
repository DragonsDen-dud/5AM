import { useId, useState } from 'react'
import { saveRunDetails } from '../lib/checkin'
import type { RunLog } from '../lib/types'

interface Props {
  log: RunLog
  onSaved?: () => void
  submitLabel?: string
}

const EFFORT_LABELS = ['Easy', 'Steady', 'Solid', 'Hard', 'Everything']

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** Optional post-run detail. Ten seconds to fill, never required. */
export function RunDetailsForm({ log, onSaved, submitLabel = 'Save log' }: Props) {
  const [distance, setDistance] = useState(log.distanceKm?.toString() ?? '')
  const [duration, setDuration] = useState(log.durationMin?.toString() ?? '')
  const [effort, setEffort] = useState<number | undefined>(log.effort)
  const [note, setNote] = useState(log.note ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')

  // This form can be mounted twice at once (Home behind the check-in sheet), so
  // field ids have to be instance-scoped or the labels bind to the wrong inputs.
  const uid = useId()

  const save = async () => {
    setState('saving')
    await saveRunDetails({
      distanceKm: numberOrUndefined(distance),
      durationMin: numberOrUndefined(duration),
      effort,
      note: note.trim() || undefined,
    })
    setState('saved')
    onSaved?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-distance`} className="label">
            Distance (km)
          </label>
          <input
            id={`${uid}-distance`}
            inputMode="decimal"
            value={distance}
            onChange={(e) => {
              setDistance(e.target.value)
              setState('idle')
            }}
            className="field tnum mt-2"
            placeholder="—"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-duration`} className="label">
            Duration (min)
          </label>
          <input
            id={`${uid}-duration`}
            inputMode="numeric"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value)
              setState('idle')
            }}
            className="field tnum mt-2"
            placeholder="—"
          />
        </div>
      </div>

      <div>
        <span className="label">Effort</span>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {EFFORT_LABELS.map((label, index) => {
            const value = index + 1
            const active = effort === value
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setEffort(active ? undefined : value)
                  setState('idle')
                }}
                className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-signal bg-signal-dim text-ink'
                    : 'border-base-600 bg-base-800 text-ink-dim'
                }`}
              >
                <span className="tnum block text-sm">{value}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          {effort ? EFFORT_LABELS[effort - 1] : '1 easy — 5 everything'}
        </p>
      </div>

      <div>
        <label htmlFor={`${uid}-note`} className="label">
          Note
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          maxLength={140}
          onChange={(e) => {
            setNote(e.target.value)
            setState('idle')
          }}
          className="field mt-2"
          placeholder="One line."
        />
      </div>

      <button type="button" onClick={save} className="btn-secondary w-full">
        {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : submitLabel}
      </button>
    </div>
  )
}
