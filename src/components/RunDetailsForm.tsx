import { useId, useState } from 'react'
import { saveRunDetails } from '../lib/checkin'
import type { RunLog } from '../lib/types'

interface Props {
  log: RunLog
  onSaved?: () => void
  submitLabel?: string
}

const EFFORT_LABELS = ['Easy', 'Steady', 'Solid', 'Hard', 'Everything']
const FELT_LABELS = ['Grim', 'Flat', 'Fine', 'Good', 'Flying']

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Optional post-run detail. Ten seconds to fill, never required, and nothing
 * here can affect the streak.
 *
 * The three fields that feed something downstream — distance, duration, effort
 * — stay on the surface, because effort × duration is the session-RPE load that
 * drives ACWR. Everything else sits behind a disclosure: at 5am the cost of a
 * longer form is that it stops getting filled at all, so the extra fields have
 * to be there for the mornings you want them and invisible for the ones you
 * don't.
 */
export function RunDetailsForm({ log, onSaved, submitLabel = 'Save log' }: Props) {
  const [distance, setDistance] = useState(log.distanceKm?.toString() ?? '')
  const [duration, setDuration] = useState(log.durationMin?.toString() ?? '')
  const [effort, setEffort] = useState<number | undefined>(log.effort)
  const [note, setNote] = useState(log.note ?? '')

  const [route, setRoute] = useState(log.routeName ?? '')
  const [felt, setFelt] = useState<number | undefined>(log.feltScore)
  const [heartRate, setHeartRate] = useState(log.avgHeartRate?.toString() ?? '')
  const [niggle, setNiggle] = useState(log.niggle === true)
  const [niggleNote, setNiggleNote] = useState(log.niggleNote ?? '')

  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  // Open on its own if there is already something in there to see.
  const [expanded, setExpanded] = useState(
    Boolean(log.routeName || log.feltScore || log.avgHeartRate || log.niggle),
  )

  // This form can be mounted twice at once (Home behind the check-in sheet), so
  // field ids have to be instance-scoped or the labels bind to the wrong inputs.
  const uid = useId()
  const touch = () => setState('idle')

  const save = async () => {
    setState('saving')
    await saveRunDetails({
      distanceKm: numberOrUndefined(distance),
      durationMin: numberOrUndefined(duration),
      effort,
      note: note.trim() || undefined,
      routeName: route.trim() || undefined,
      feltScore: felt,
      avgHeartRate: numberOrUndefined(heartRate),
      niggle: niggle || undefined,
      niggleNote: niggle ? niggleNote.trim() || undefined : undefined,
    })
    setState('saved')
    onSaved?.()
  }

  const extraCount = [route.trim(), felt, heartRate.trim(), niggle || null].filter(Boolean).length

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
              touch()
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
              touch()
            }}
            className="field tnum mt-2"
            placeholder="—"
          />
        </div>
      </div>

      <Scale
        uid={`${uid}-effort`}
        label="Effort"
        labels={EFFORT_LABELS}
        hint="1 easy — 5 everything"
        value={effort}
        tone="signal"
        onChange={(v) => {
          setEffort(v)
          touch()
        }}
      />

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
            touch()
          }}
          className="field mt-2"
          placeholder="One line."
        />
      </div>

      <div className="rounded-lg border border-base-700">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-3.5 py-3 text-left"
        >
          <span className="text-sm text-ink-dim">
            More detail
            {extraCount > 0 && !expanded && (
              <span className="tnum ml-2 text-[11px] text-ink-faint">{extraCount} filled</span>
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-ink-faint transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            <path
              d="M6 9.5 12 15.5 18 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {expanded && (
          <div className="animate-rise flex flex-col gap-4 border-t border-base-700 px-3.5 pt-4 pb-4">
            <div>
              <label htmlFor={`${uid}-route`} className="label">
                Route
              </label>
              <input
                id={`${uid}-route`}
                value={route}
                maxLength={60}
                onChange={(e) => {
                  setRoute(e.target.value)
                  touch()
                }}
                className="field mt-2"
                placeholder="Canal loop, park, treadmill…"
              />
            </div>

            {/*
              Not the same axis as effort. Effort is how hard it was; this is
              whether you'd want to do it again — the affective response, which
              is the better predictor of whether the habit survives.
            */}
            <Scale
              uid={`${uid}-felt`}
              label="How it felt"
              labels={FELT_LABELS}
              hint="1 grim — 5 flying. Not the same as effort."
              value={felt}
              tone="neutral"
              onChange={(v) => {
                setFelt(v)
                touch()
              }}
            />

            <div>
              <label htmlFor={`${uid}-hr`} className="label">
                Average heart rate (bpm)
              </label>
              <input
                id={`${uid}-hr`}
                inputMode="numeric"
                value={heartRate}
                onChange={(e) => {
                  setHeartRate(e.target.value)
                  touch()
                }}
                className="field tnum mt-2"
                placeholder="—"
              />
              <p className="mt-2 text-[11px] text-ink-faint">
                Typed in by hand if your watch tells you. Nothing syncs.
              </p>
            </div>

            {/*
              The one field with a downstream reason to exist beyond the record:
              onboarding asks about posterior-chain history, and a niggle logged
              on the day is worth far more later than one remembered in March.
            */}
            <div>
              <label
                htmlFor={`${uid}-niggle`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-600 bg-base-900 px-3.5 py-3"
              >
                <input
                  id={`${uid}-niggle`}
                  type="checkbox"
                  checked={niggle}
                  onChange={(e) => {
                    setNiggle(e.target.checked)
                    touch()
                  }}
                  className="size-4 shrink-0 accent-[#FF6B35]"
                />
                <span className="text-sm">Something twinged</span>
              </label>
              {niggle && (
                <input
                  value={niggleNote}
                  maxLength={140}
                  onChange={(e) => {
                    setNiggleNote(e.target.value)
                    touch()
                  }}
                  className="field animate-rise mt-2"
                  placeholder="Where, and how bad."
                  aria-label="Niggle detail"
                />
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Logged, not diagnosed. A niggle recorded on the day is worth more later than one
                remembered months from now.
              </p>
            </div>
          </div>
        )}
      </div>

      <button type="button" onClick={save} className="btn-secondary w-full">
        {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : submitLabel}
      </button>
    </div>
  )
}

/** The 1–5 row used for both effort and felt, so they read as the same kind of thing. */
function Scale({
  uid,
  label,
  labels,
  hint,
  value,
  tone,
  onChange,
}: {
  uid: string
  label: string
  labels: string[]
  hint: string
  value: number | undefined
  tone: 'signal' | 'neutral'
  onChange: (value: number | undefined) => void
}) {
  /*
   * Two scales, one family, no amber. Amber is reserved for the streak number
   * and the primary CTA — so the second scale separates itself by weight
   * instead of by hue, which also keeps it from reading as more important than
   * the effort value that actually feeds training load.
   */
  const active =
    tone === 'signal'
      ? 'border-signal bg-signal-dim text-ink'
      : 'border-base-500 bg-base-700 text-ink'

  return (
    <div>
      <span className="label" id={`${uid}-label`}>
        {label}
      </span>
      <div className="mt-2 grid grid-cols-5 gap-2" role="group" aria-labelledby={`${uid}-label`}>
        {labels.map((name, index) => {
          const v = index + 1
          const on = value === v
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              aria-label={`${label}: ${v}, ${name}`}
              onClick={() => onChange(on ? undefined : v)}
              className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                on ? active : 'border-base-600 bg-base-800 text-ink-dim'
              }`}
            >
              <span className="tnum block text-sm">{v}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">{value ? labels[value - 1] : hint}</p>
    </div>
  )
}
