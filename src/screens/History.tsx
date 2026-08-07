import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { formatDateKey, fromDateKey, monthLabel, toDateKey, todayKey } from '../lib/dates'
import { useBlobUrl } from '../hooks/useBlobUrl'
import type { RunLog, Settings } from '../lib/types'

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface Props {
  settings: Settings
}

export function History({ settings }: Props) {
  const today = todayKey()
  const [cursor, setCursor] = useState(() => {
    const d = fromDateKey(today)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)

  const logs = useLiveQuery(() => db.runLogs.toArray(), [], [] as RunLog[])
  const byDate = useMemo(() => {
    const map = new Map<string, RunLog>()
    for (const log of logs ?? []) map.set(log.date, log)
    return map
  }, [logs])

  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor])

  const shift = (delta: number) => {
    setSelected(null)
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const atCurrentMonth =
    cursor.year === fromDateKey(today).getFullYear() &&
    cursor.month === fromDateKey(today).getMonth()

  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="btn-ghost px-3 py-2 text-lg">
          &lsaquo;
        </button>
        <h1 className="tnum text-sm font-semibold tracking-wide">
          {monthLabel(cursor.year, cursor.month)}
        </h1>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={atCurrentMonth}
          className="btn-ghost px-3 py-2 text-lg"
        >
          &rsaquo;
        </button>
      </header>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="pb-1 text-center text-[10px] text-ink-faint">
            {initial}
          </span>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <DayCell
              key={cell}
              dateKey={cell}
              log={byDate.get(cell)}
              today={today}
              trackingStartsOn={settings.trackingStartsOn}
              selected={selected === cell}
              onSelect={() => setSelected(selected === cell ? null : cell)}
            />
          ),
        )}
      </div>

      <Legend />

      {selected && <DayDetail dateKey={selected} log={byDate.get(selected)} />}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        History is immutable. Entries cannot be edited or removed — that is what makes the record
        worth anything.
      </p>
    </div>
  )
}

/** Monday-first month grid, padded so the 1st lands on its real weekday. */
function buildMonthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(new Date(year, month, day)))
  }
  return cells
}

function DayCell({
  dateKey,
  log,
  today,
  trackingStartsOn,
  selected,
  onSelect,
}: {
  dateKey: string
  log?: RunLog
  today: string
  trackingStartsOn: string
  selected: boolean
  onSelect: () => void
}) {
  const future = dateKey > today
  const preHistory = dateKey < trackingStartsOn

  const tone =
    log?.status === 'completed'
      ? 'bg-signal text-base-900'
      : log?.status === 'rest'
        ? 'bg-base-500 text-ink'
        : log?.status === 'missed'
          ? 'bg-miss text-ink'
          : future || preHistory
            ? 'bg-base-800 text-ink-faint'
            : 'bg-base-700 text-ink-dim'

  const day = Number(dateKey.slice(8, 10))

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!log}
      aria-label={formatDateKey(dateKey)}
      className={`tnum aspect-square rounded-[5px] text-[11px] font-medium transition-transform ${tone} ${
        selected ? 'ring-2 ring-ember ring-offset-2 ring-offset-base-900' : ''
      } ${dateKey === today ? 'outline outline-1 outline-ink-faint' : ''}`}
    >
      {day}
    </button>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-faint">
      <LegendItem className="bg-signal" label="Ran" />
      <LegendItem className="bg-base-500" label="Rest" />
      <LegendItem className="bg-miss" label="Missed" />
      <LegendItem className="bg-base-700" label="No record" />
      <LegendItem className="bg-base-800" label="Not due" />
    </div>
  )
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${className}`} />
      {label}
    </span>
  )
}

function DayDetail({ dateKey, log }: { dateKey: string; log?: RunLog }) {
  const photoUrl = useBlobUrl(log?.photoBlob)

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="label">{formatDateKey(dateKey)}</span>
        <span
          className={`text-xs font-semibold tracking-wide ${
            log?.status === 'completed'
              ? 'text-signal'
              : log?.status === 'rest'
                ? 'text-ink-dim'
                : 'text-miss'
          }`}
        >
          {log?.status === 'completed' ? 'RAN' : log?.status === 'rest' ? 'REST' : 'MISSED'}
        </span>
      </div>

      {log?.status === 'completed' ? (
        <>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={`Check-in photo from ${dateKey}`}
              className="w-full rounded-lg border border-base-700"
            />
          )}
          <dl className="tnum grid grid-cols-3 gap-3 text-sm">
            <Stat label="Distance" value={log.distanceKm ? `${log.distanceKm} km` : '—'} />
            <Stat label="Duration" value={log.durationMin ? `${log.durationMin} min` : '—'} />
            <Stat label="Effort" value={log.effort ? `${log.effort}/5` : '—'} />
          </dl>
          {log.note && <p className="text-sm leading-relaxed text-ink-dim">{log.note}</p>}
          {log.verificationMethod === 'honor' && (
            <p className="text-[11px] text-ink-faint">Honor check-in — no photo proof.</p>
          )}
        </>
      ) : log?.status === 'rest' ? (
        <p className="text-sm leading-relaxed text-ink-dim">
          {log.restReason
            ? `Deliberate rest day. ${log.restReason}`
            : 'Deliberate rest day. The streak carried across it.'}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-ink-dim">
          No check-in inside the window. Recorded and left alone.
        </p>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  )
}
