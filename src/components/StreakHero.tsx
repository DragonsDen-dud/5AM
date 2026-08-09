import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { addDays, formatDateKey, fromDateKey, todayKey } from '../lib/dates'
import { automaticityProgress } from '../lib/streak'
import { DayDetail } from './DayDetail'
import type { RunLog } from '../lib/types'

const RAIL_DAYS = 14

const RING_SIZE = 220
const RING_RADIUS = 96
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface Props {
  currentStreak: number
  longestStreak: number
  totalRuns: number
  /** The day the app is currently accountable for — today, or the first tracked day. */
  targetDate: string
  trackingStartsOn: string
  now: Date
}

/**
 * The streak, as the one place in the app allowed to look like an achievement.
 *
 * Three readings, one object: the number itself, the ring showing progress
 * toward day 66 (Lally et al., 2010 — the median time to automaticity, which is
 * the honest target rather than "don't break the chain"), and a fortnight rail
 * so a streak of 9 is visibly different from a scrappy 9 with two rest days in
 * it. The rail is the reason this replaced a bare number: the shape of the last
 * two weeks is information the number throws away.
 */
export function StreakHero({
  currentStreak,
  longestStreak,
  totalRuns,
  targetDate,
  trackingStartsOn,
  now,
}: Props) {
  const progress = automaticityProgress(currentStreak)
  const live = currentStreak > 0
  const today = todayKey(now)
  const [selected, setSelected] = useState<string | null>(null)

  const railStart = addDays(today, -(RAIL_DAYS - 1))
  const logs = useLiveQuery(
    async () => db.runLogs.where('date').between(railStart, today, true, true).toArray(),
    [railStart, today],
  )

  // Where the arc currently ends, in SVG coordinates. Twelve o'clock is 0.
  const tipAngle = (progress.fraction * 360 - 90) * (Math.PI / 180)
  const tip = {
    x: RING_SIZE / 2 + RING_RADIUS * Math.cos(tipAngle),
    y: RING_SIZE / 2 + RING_RADIUS * Math.sin(tipAngle),
  }

  const byDate = new Map((logs ?? []).map((l) => [l.date, l]))
  const selectedDay = selected ? { date: selected, log: byDate.get(selected) } : null
  const days = Array.from({ length: RAIL_DAYS }, (_, i) => {
    const date = addDays(railStart, i)
    return { date, log: byDate.get(date), isTarget: date === targetDate, tracked: date >= trackingStartsOn }
  })

  return (
    <section className="relative flex flex-col items-center">
      {/* Ambient pre-dawn light. Purely decorative. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-[58%] rounded-full blur-2xl ${
          live ? 'animate-ember-breathe' : ''
        }`}
        style={{
          background: live
            ? 'radial-gradient(closest-side, rgba(255,107,53,0.20), transparent 72%)'
            : 'radial-gradient(closest-side, rgba(51,64,78,0.28), transparent 72%)',
        }}
      />

      <div className="relative">
        <svg
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="h-[13.75rem] w-[13.75rem]"
          role="img"
          aria-label={progress.label}
        >
          <defs>
            <linearGradient id="streak-ring" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stopColor="var(--color-ember-lift)" />
              <stop offset="50%" stopColor="var(--color-ember)" />
              <stop offset="100%" stopColor="var(--color-ember-deep)" />
            </linearGradient>
          </defs>

          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-base-700)"
            strokeWidth="7"
          />
          {progress.fraction > 0 && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="url(#streak-ring)"
              strokeWidth="7"
              strokeLinecap="round"
              // Start at twelve o'clock and run clockwise, like a clock face.
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress.fraction)}
              className="transition-[stroke-dashoffset] duration-1000 ease-out"
            />
          )}

          {/* The head of the arc. A soft halo plus a bright core reads as a
              point of light travelling round the ring rather than a cut end. */}
          {progress.fraction > 0 && progress.fraction < 1 && (
            <>
              <circle cx={tip.x} cy={tip.y} r="9" fill="var(--color-ember)" opacity="0.18" />
              <circle cx={tip.x} cy={tip.y} r="3.4" fill="var(--color-ember-lift)" />
            </>
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="label">Current streak</span>
          <span
            className={`tnum mt-1 text-[5.5rem] leading-none font-semibold tracking-tight ${
              // Three digits would foul the ring, so the type steps down rather
              // than the ring growing.
              currentStreak > 99 ? 'text-[4rem]' : ''
            } ${live ? 'text-ember-gradient' : 'text-ink-faint'}`}
          >
            {currentStreak}
          </span>
          <span className="mt-1 text-[11px] font-medium tracking-[0.18em] uppercase text-ink-dim">
            {currentStreak === 1 ? 'day' : 'days'}
          </span>
        </div>
      </div>

      {/* Prose, so it is set in the prose face — the mono is for scoreboard
          numbers, not for sentences that happen to contain one. */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-faint">
        {progress.label}
      </p>

      <DayRail days={days} selected={selected} onSelect={setSelected} />

      {selectedDay && (
        <DaySheet dateKey={selectedDay.date} log={selectedDay.log} onClose={() => setSelected(null)} />
      )}

      <div className="mt-5 grid w-full grid-cols-3 gap-2.5">
        <Stat label="Longest" value={longestStreak} unit="d" />
        <Stat label="Lifetime" value={totalRuns} unit="runs" />
        <Stat label="To day 66" value={Math.max(progress.target - progress.day, 0)} unit="left" />
      </div>
    </section>
  )
}

interface RailDay {
  date: string
  log: RunLog | undefined
  isTarget: boolean
  tracked: boolean
}

/**
 * Fourteen days at a glance. Height encodes outcome as well as colour, so the
 * shape of a fortnight is legible without relying on colour vision.
 */
function DayRail({
  days,
  selected,
  onSelect,
}: {
  days: RailDay[]
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const initial = (dateKey: string) => 'SMTWTFS'[fromDateKey(dateKey).getDay()]

  return (
    <div className="mt-5 w-full">
      <div className="flex items-end justify-between gap-1">
        {days.map((d) => {
          const status = d.log?.status
          const pending = d.isTarget && !status

          const tone =
            status === 'completed'
              ? 'h-7 bg-linear-to-t from-signal/70 to-signal'
              : status === 'rest'
                ? 'h-4 bg-base-500'
                : status === 'missed'
                  ? 'h-2.5 bg-miss/80'
                  : pending
                    ? 'h-7 border border-dashed border-ember/70 bg-ember/10'
                    : 'h-2.5 bg-base-700'

          const title = `${formatDateKey(d.date)} — ${
            status === 'completed'
              ? 'ran'
              : status === 'rest'
                ? 'rest day'
                : status === 'missed'
                  ? 'missed'
                  : pending
                    ? 'today, still open'
                    : d.tracked
                      ? 'no entry'
                      : 'before tracking started'
          }`

          // Only days with a record are worth opening; the rest have nothing
          // to show and should not offer a tap that does nothing.
          const openable = Boolean(status)

          return (
            <button
              key={d.date}
              type="button"
              disabled={!openable}
              onClick={() => onSelect(selected === d.date ? null : d.date)}
              aria-label={title}
              className="pressable flex flex-1 flex-col items-center justify-end gap-1.5 pt-4 disabled:cursor-default"
            >
              <span className={`w-full rounded-[3px] ${tone}`} />
              <span
                className={`h-0.5 w-full rounded-full transition-colors ${
                  selected === d.date ? 'bg-ember' : 'bg-transparent'
                }`}
              />
              <span
                className={`text-[9px] leading-none ${
                  d.isTarget ? 'font-semibold text-ink-dim' : 'text-ink-faint/70'
                }`}
              >
                {initial(d.date)}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-center text-[10px] tracking-[0.14em] uppercase text-ink-faint">
        Last {RAIL_DAYS} days — tap one
      </p>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="surface px-2.5 py-3 text-center">
      <p className="leading-none">
        <span className="tnum text-2xl font-semibold">{value}</span>
        <span className="ml-0.5 text-[11px] text-ink-dim">{unit}</span>
      </p>
      <p className="mt-1.5 text-[10px] leading-tight tracking-[0.1em] uppercase text-ink-faint">
        {label}
      </p>
    </div>
  )
}

/**
 * A day pulled up from the rail. Escape and a tap outside both close it, and
 * the page behind is locked while it is open so the sheet is not scrolled off
 * by accident on a phone.
 */
function DaySheet({
  dateKey,
  log,
  onClose,
}: {
  dateKey: string
  log: RunLog | undefined
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close day detail"
        onClick={onClose}
        className="absolute inset-0 bg-base-900/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Record for ${formatDateKey(dateKey)}`}
        className="animate-rise relative mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto px-5 pb-5 safe-b"
      >
        <DayDetail dateKey={dateKey} log={log} />
        <button type="button" onClick={onClose} className="btn-secondary pressable mt-3 w-full">
          Close
        </button>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
          Past days are read-only. Today&rsquo;s detail is editable from the panel below.
        </p>
      </div>
    </div>
  )
}
