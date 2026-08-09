import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { formatDateKey, fromDateKey, monthLabel, toDateKey, todayKey } from '../lib/dates'
import { summariseSleep } from '../lib/sleep'
import {
  bandForNight,
  CONSISTENCY_LABEL,
  formatHours,
  sleepAdvice,
  summariseSleepHistory,
  type SleepAdvice,
  type SleepBand,
  type SleepStats,
} from '../lib/sleepStats'
import { DayDetail } from '../components/DayDetail'
import { IconMoon, IconSunrise } from '../components/icons'
import type { RunLog, SleepEntry, Settings } from '../lib/types'

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

type Lens = 'runs' | 'sleep'

interface Props {
  settings: Settings
}

/**
 * The past, by date, under two lenses.
 *
 * Deliberately not a fifth tab. Sleep and running share a date axis and a
 * calendar, and a day is more useful read whole than split across two screens —
 * the night in front of a run is part of that run's story. One grid, one detail
 * sheet, and a toggle for which number the cells carry.
 */
export function History({ settings }: Props) {
  const today = todayKey()
  const [lens, setLens] = useState<Lens>('runs')
  const [cursor, setCursor] = useState(() => {
    const d = fromDateKey(today)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)

  const logs = useLiveQuery(() => db.runLogs.toArray(), [], [] as RunLog[])
  const sleeps = useLiveQuery(() => db.sleepEntries.toArray(), [], [] as SleepEntry[])

  const runsByDate = useMemo(() => {
    const map = new Map<string, RunLog>()
    for (const log of logs ?? []) map.set(log.date, log)
    return map
  }, [logs])

  const sleepByDate = useMemo(() => {
    const map = new Map<string, SleepEntry>()
    for (const entry of sleeps ?? []) map.set(entry.date, entry)
    return map
  }, [sleeps])

  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor])

  // Stats and the recommendation always read the last 28 nights, not whichever
  // month is being browsed — advice about September is no use in November.
  const stats = useMemo(() => summariseSleepHistory(sleeps ?? [], settings), [sleeps, settings])
  const rolling = useMemo(() => summariseSleep(sleeps ?? []), [sleeps])
  const advice = useMemo(
    () => sleepAdvice(sleeps ?? [], settings, stats, rolling.rollingAverage, rolling.baseline),
    [sleeps, settings, stats, rolling],
  )

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
      <LensToggle lens={lens} onChange={setLens} />

      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="btn-ghost pressable px-3 py-2 text-lg"
        >
          &lsaquo;
        </button>
        <h1 className="tnum text-sm font-semibold tracking-wide">
          {monthLabel(cursor.year, cursor.month)}
        </h1>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={atCurrentMonth}
          aria-label="Next month"
          className="btn-ghost pressable px-3 py-2 text-lg"
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
          ) : lens === 'runs' ? (
            <RunCell
              key={cell}
              dateKey={cell}
              log={runsByDate.get(cell)}
              today={today}
              trackingStartsOn={settings.trackingStartsOn}
              selected={selected === cell}
              onSelect={() => setSelected(selected === cell ? null : cell)}
            />
          ) : (
            <SleepCell
              key={cell}
              dateKey={cell}
              entry={sleepByDate.get(cell)}
              baseline={rolling.baseline}
              today={today}
              trackingStartsOn={settings.trackingStartsOn}
              selected={selected === cell}
              onSelect={() => setSelected(selected === cell ? null : cell)}
            />
          ),
        )}
      </div>

      {lens === 'runs' ? <RunLegend /> : <SleepLegend baseline={rolling.baseline} />}

      {selected && <DayDetail dateKey={selected} log={runsByDate.get(selected)} />}

      {lens === 'sleep' && <SleepReport stats={stats} advice={advice} settings={settings} />}

      <p className="text-[11px] leading-relaxed text-ink-faint">
        History is immutable. Entries cannot be edited or removed — that is what makes the record
        worth anything.
      </p>
    </div>
  )
}

function LensToggle({ lens, onChange }: { lens: Lens; onChange: (l: Lens) => void }) {
  const options: { id: Lens; label: string; icon: ReactNode }[] = [
    { id: 'runs', label: 'Runs', icon: <IconSunrise className="h-4 w-4" /> },
    { id: 'sleep', label: 'Sleep', icon: <IconMoon className="h-4 w-4" /> },
  ]

  return (
    <div
      role="tablist"
      aria-label="History view"
      className="grid grid-cols-2 gap-1 rounded-xl border border-base-700 bg-base-850 p-1"
    >
      {options.map((o) => {
        const active = lens === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`pressable flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              active ? 'bg-base-700 text-ink' : 'text-ink-faint'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
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

const CELL_BASE = 'tnum pressable aspect-square rounded-[7px] text-[11px] font-medium'

function ring(selected: boolean, isToday: boolean): string {
  return `${selected ? 'ring-2 ring-ember ring-offset-2 ring-offset-base-900' : ''} ${
    isToday ? 'outline outline-1 outline-ink-faint' : ''
  }`
}

function RunCell({
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
      ? 'bg-signal-lift text-base-900'
      : log?.status === 'rest'
        ? 'bg-base-500 text-ink'
        : log?.status === 'missed'
          ? 'bg-miss text-ink'
          : future || preHistory
            ? 'bg-base-800 text-ink-faint'
            : 'bg-base-700 text-ink-dim'

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!log}
      aria-label={formatDateKey(dateKey)}
      className={`${CELL_BASE} ${tone} ${ring(selected, dateKey === today)}`}
    >
      {Number(dateKey.slice(8, 10))}
    </button>
  )
}

const SLEEP_TONE: Record<SleepBand, string> = {
  over: 'bg-signal-lift text-base-900',
  normal: 'bg-signal/55 text-ink',
  under: 'bg-base-500 text-ink',
  short: 'bg-miss/85 text-ink',
}

/**
 * The night as a number rather than a colour swatch. The hours are the point;
 * colour only says how that night sat against this person's own norm.
 */
function SleepCell({
  dateKey,
  entry,
  baseline,
  today,
  trackingStartsOn,
  selected,
  onSelect,
}: {
  dateKey: string
  entry?: SleepEntry
  baseline: number | null
  today: string
  trackingStartsOn: string
  selected: boolean
  onSelect: () => void
}) {
  const future = dateKey > today
  const preHistory = dateKey < trackingStartsOn

  const tone = entry
    ? SLEEP_TONE[bandForNight(entry.hoursSlept, baseline)]
    : future || preHistory
      ? 'bg-base-800 text-ink-faint'
      : 'bg-base-700 text-ink-faint'

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!entry}
      aria-label={
        entry
          ? `${formatDateKey(dateKey)} — ${formatHours(entry.hoursSlept)}, quality ${entry.quality} of 5`
          : `${formatDateKey(dateKey)} — no sleep logged`
      }
      className={`${CELL_BASE} ${tone} ${ring(selected, dateKey === today)}`}
    >
      {/* "6.5", not "6.5h" — the unit is in the legend and the cell is 40px. */}
      {entry ? entry.hoursSlept : ''}
    </button>
  )
}

function RunLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-faint">
      <LegendItem className="bg-signal-lift" label="Ran" />
      <LegendItem className="bg-base-500" label="Rest" />
      <LegendItem className="bg-miss" label="Missed" />
      <LegendItem className="bg-base-700" label="No record" />
      <LegendItem className="bg-base-800" label="Not due" />
    </div>
  )
}

function SleepLegend({ baseline }: { baseline: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-faint">
        <LegendItem className="bg-signal-lift" label="Above" />
        <LegendItem className="bg-signal/55" label="Normal" />
        <LegendItem className="bg-base-500" label="Under" />
        <LegendItem className="bg-miss/85" label="Short" />
        <LegendItem className="bg-base-700" label="Not logged" />
      </div>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Hours per night.{' '}
        {baseline === null
          ? 'Shaded against a broadly healthy 7h until there are enough nights to know your own.'
          : `Shaded against your own median of ${formatHours(baseline)}, not a generic eight hours.`}
      </p>
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

function SleepReport({
  stats,
  advice,
  settings,
}: {
  stats: SleepStats
  advice: SleepAdvice
  settings: Settings
}) {
  return (
    <div className="flex flex-col gap-3">
      {/*
        The recommendation leads, because it is the only part that asks anything
        of you. Everything under it is the working, so the number is never
        something you have to take on trust.
      */}
      <section className="surface surface-live p-5">
        <span className="label">Recommendation</span>
        <p className="mt-2 text-lg font-semibold tracking-tight">{advice.headline}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{advice.detail}</p>
        {advice.debtNote && (
          <p className="mt-3 rounded-lg border border-base-600 bg-base-800/60 px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-dim">
            {advice.debtNote}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Lights-out is derived, not measured — your {settings.targetTime} alarm minus the hours you
          logged. Regularity is what the evidence favours; the total is second.
        </p>
      </section>

      <section className="surface p-5">
        <span className="label">Last 28 nights</span>
        {stats.nights === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">
            No nights logged yet. Two taps on Today starts this.
          </p>
        ) : (
          <>
            <dl className="tnum mt-4 grid grid-cols-3 gap-4 text-sm">
              <Metric
                label="Typical"
                value={stats.medianHours === null ? '—' : formatHours(stats.medianHours)}
                caption="median"
              />
              <Metric label="Lights out" value={stats.typicalLightsOut ?? '—'} caption="implied" />
              <Metric label="Logged" value={`${stats.nights}/${stats.possible}`} caption="nights" />
            </dl>
            <dl className="tnum mt-4 grid grid-cols-3 gap-4 text-sm">
              <Metric
                label="Swing"
                value={stats.variationMinutes === null ? '—' : `${stats.variationMinutes} min`}
                caption={stats.consistency ? CONSISTENCY_LABEL[stats.consistency] : 'need 5 nights'}
              />
              <Metric
                label="Shortest"
                value={stats.shortest ? formatHours(stats.shortest.hoursSlept) : '—'}
                caption={stats.shortest ? shortDate(stats.shortest.date) : undefined}
              />
              <Metric
                label="Longest"
                value={stats.longest ? formatHours(stats.longest.hoursSlept) : '—'}
                caption={stats.longest ? shortDate(stats.longest.date) : undefined}
              />
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
              Swing is how much your nights vary either side of typical. Smaller is better, and it
              matters more than the average — the most regular sleepers in UK Biobank had 20–48%
              lower mortality, largely independent of how long they slept.
            </p>
          </>
        )}
      </section>
    </div>
  )
}

function shortDate(dateKey: string): string {
  return formatDateKey(dateKey).slice(0, 10)
}

function Metric({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
      {caption && <dd className="mt-0.5 text-[10px] text-ink-faint">{caption}</dd>}
    </div>
  )
}
