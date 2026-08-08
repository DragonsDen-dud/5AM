import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { formatDuration, parseTime, todayKey } from '../lib/dates'
import { formatAlarmDisplay, nextRunDate } from '../lib/alarmTime'
import { FOOTBALL_MINUTES, toggleFootball } from '../lib/load'
import { windowLabel } from '../lib/window'
import { SleepLog } from './SleepLog'
import { RunDetailsForm } from './RunDetailsForm'
import type { RunLog, Settings } from '../lib/types'

export type TaskStatus = 'need' | 'done' | 'wait' | 'miss'

const CHIP_LABEL: Record<TaskStatus, string> = {
  need: 'Needed',
  done: 'Done',
  wait: 'Locked',
  miss: 'Missed',
}

interface Props {
  settings: Settings
  now: Date
  todayLog: RunLog | undefined
  phase: 'before' | 'open' | 'closed'
  opensAt: Date
}

/**
 * The day's control panel: everything that can be filled in today, what state
 * each thing is in, and the means to do it without leaving this screen.
 *
 * The distinction it draws is the one the app's whole trust model rests on.
 * Whether you ran is decided inside the check-in window and is never editable
 * afterwards — that is what makes the streak worth anything. Everything
 * *around* that fact (how far, how hard, how you slept, whether you played
 * football) is yours to correct at any point during the day it belongs to.
 * Past days stay closed either way.
 */
export function TodayPanel({
  settings,
  now,
  todayLog,
  phase,
  opensAt,
}: Props) {
  const today = todayKey(now)
  const [override, setOverride] = useState<Record<string, boolean>>({})

  const sleep = useLiveQuery(
    async () => (await db.sleepEntries.where('date').equals(today).first()) ?? null,
    [today],
  )
  const load = useLiveQuery(
    async () => (await db.loadEntries.where('date').equals(today).first()) ?? null,
    [today],
  )
  const runDate = nextRunDate(settings, now)
  const plan = useLiveQuery(
    async () => (await db.nightPlans.where('date').equals(runDate).first()) ?? null,
    [runDate],
  )

  /* ── Run ───────────────────────────────────────────────────────────────── */
  const status = todayLog?.status
  const runStatus: TaskStatus =
    status === 'completed' || status === 'rest'
      ? 'done'
      : status === 'missed'
        ? 'miss'
        : phase === 'open'
          ? 'need'
          : phase === 'before'
            ? 'wait'
            : 'miss'

  const runSummary =
    status === 'completed'
      ? runDetailSummary(todayLog) ?? 'Logged — add the detail'
      : status === 'rest'
        ? 'Rest day taken. The streak carries.'
        : status === 'missed'
          ? 'The window closed. Permanent.'
          : phase === 'open'
            ? 'The window is open now'
            : phase === 'before'
              ? `Opens in ${formatDuration(opensAt.getTime() - now.getTime())}`
              : `Window ${windowLabel(settings)}`

  /* ── Sleep ─────────────────────────────────────────────────────────────── */
  const sleepStatus: TaskStatus = sleep ? 'done' : 'need'
  const sleepSummary = sleep
    ? `${sleep.hoursSlept}h · quality ${sleep.quality}/5`
    : 'Two taps. Feeds the readiness call.'

  /* ── Training load ─────────────────────────────────────────────────────── */
  const football = load?.footballPlayed === true
  const loadStatus: TaskStatus = football ? 'done' : 'wait'
  const loadSummary = football
    ? `Football — ~${FOOTBALL_MINUTES} min at hard effort. Tap to undo.`
    : 'Tap if you played football today.'

  /* ── Tomorrow's plan + alarm ───────────────────────────────────────────── */
  const nightOpen =
    now.getHours() * 60 + now.getMinutes() >= parseTime(settings.nightMessageTime) ||
    now < opensAt
  const planDone = plan?.alarmConfirmed === true
  const planStatus: TaskStatus = planDone ? 'done' : nightOpen ? 'need' : 'wait'
  const planSummary = planDone
    ? `Alarm ${formatAlarmDisplay(plan?.confirmedAlarmTime ?? settings.targetTime)} · plan locked`
    : nightOpen
      ? 'Write the plan and set the alarm'
      : `Unlocks at ${settings.nightMessageTime}`

  const tasks: TaskStatus[] = [runStatus, sleepStatus, planStatus]
  const done = tasks.filter((t) => t === 'done').length
  const outstanding = tasks.filter((t) => t === 'need').length

  const isOpen = (id: string, fallback: boolean) => override[id] ?? fallback
  const toggle = (id: string, fallback: boolean) =>
    setOverride((o) => ({ ...o, [id]: !(o[id] ?? fallback) }))

  return (
    <section className="surface overflow-hidden">
      <header className="flex items-center justify-between px-5 pt-5 pb-4">
        <div>
          <span className="label">Today</span>
          <p className="mt-1 text-sm text-ink-dim">
            {outstanding === 0
              ? 'Nothing outstanding.'
              : `${outstanding} thing${outstanding === 1 ? '' : 's'} still to fill in.`}
          </p>
        </div>
        <div className="text-right">
          <p className="tnum text-sm font-semibold">
            {done}
            <span className="text-ink-faint">/{tasks.length}</span>
          </p>
          <div className="mt-1.5 flex gap-1">
            {tasks.map((t, i) => (
              <span
                key={i}
                className={`h-1 w-5 rounded-full ${
                  t === 'done'
                    ? 'bg-signal'
                    : t === 'need'
                      ? 'bg-ember'
                      : t === 'miss'
                        ? 'bg-miss'
                        : 'bg-base-600'
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="divide-y divide-base-700/70 border-t border-base-700/70">
        {/*
          No CHECK IN button here. When the window is open the screen already
          carries one, full-width, above the streak — two identical primary
          actions on one screen is a worse answer than one obvious one. This row
          reports the state and, once the run is logged, owns the editable
          detail that hangs off it.
        */}
        <TaskRow
          id="run"
          title="Morning run"
          status={runStatus}
          summary={runSummary}
          open={isOpen('run', false)}
          onToggle={() => toggle('run', false)}
          expandable={status === 'completed'}
        >
          {status === 'completed' && todayLog && (
            <>
              <RunDetailsForm log={todayLog} submitLabel="Save details" />
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                The run itself is locked in. These details stay editable until the day is over.
              </p>
            </>
          )}
        </TaskRow>

        <TaskRow
          id="sleep"
          title="Last night’s sleep"
          status={sleepStatus}
          summary={sleepSummary}
          open={isOpen('sleep', sleepStatus === 'need')}
          onToggle={() => toggle('sleep', sleepStatus === 'need')}
          expandable
        >
          <SleepLog />
        </TaskRow>

        {/*
          A single yes/no, so it toggles in place rather than hiding behind a
          disclosure. Logging football stays a one-tap action, as it was.
        */}
        <TaskRow
          id="load"
          title="Training load"
          status={loadStatus}
          chipLabel={football ? 'Done' : 'Optional'}
          summary={loadSummary}
          open={false}
          onToggle={() => void toggleFootball(today)}
          variant="toggle"
          checked={football}
        />

        <TaskRow
          id="plan"
          title="Tomorrow’s plan"
          status={planStatus}
          summary={planSummary}
          open={isOpen('plan', false)}
          onToggle={() => toggle('plan', false)}
          expandable={planDone}
        >
          {plan?.planText && (
            <div className="rounded-lg border border-base-700 bg-base-800 px-4 py-3">
              <span className="label">If-then</span>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{plan.planText}</p>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Written last night and fixed for the morning. The wind-down screen is where it changes.
          </p>
        </TaskRow>
      </div>
    </section>
  )
}

function TaskRow({
  title,
  status,
  chipLabel,
  summary,
  open,
  onToggle,
  expandable = false,
  variant = 'expand',
  checked = false,
  children,
}: {
  id: string
  title: string
  status: TaskStatus
  /** Overrides the status's default chip wording. */
  chipLabel?: string
  summary: string
  open: boolean
  onToggle: () => void
  expandable?: boolean
  /** `toggle` rows act on the tap itself rather than revealing a body. */
  variant?: 'expand' | 'toggle'
  checked?: boolean
  children?: ReactNode
}) {
  const interactive = variant === 'toggle' || expandable
  const dot =
    status === 'done'
      ? 'bg-signal'
      : status === 'need'
        ? 'bg-ember shadow-[0_0_0_3px_rgba(255,107,53,0.18)]'
        : status === 'miss'
          ? 'bg-miss'
          : 'bg-base-500'

  const body = (
    <div className="flex items-center gap-3 px-5 py-4 text-left">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{summary}</span>
      </span>
      <span className={`chip chip-${status}`}>{chipLabel ?? CHIP_LABEL[status]}</span>
      {variant === 'toggle' ? (
        <span
          className={`h-4 w-4 shrink-0 rounded-full border ${
            checked ? 'border-signal bg-signal' : 'border-base-500'
          }`}
          aria-hidden="true"
        />
      ) : (
        expandable && (
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${
            open ? 'rotate-180' : ''
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
        )
      )}
    </div>
  )

  return (
    <div>
      {interactive ? (
        <button
          type="button"
          onClick={onToggle}
          {...(variant === 'toggle'
            ? { 'aria-pressed': checked }
            : { 'aria-expanded': open })}
          className="w-full active:bg-base-800/50"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {expandable && open && children && (
        <div className="animate-rise px-5 pt-1 pb-5">{children}</div>
      )}
    </div>
  )
}

function runDetailSummary(log: RunLog | undefined): string | null {
  if (!log) return null
  const bits: string[] = []
  if (log.distanceKm) bits.push(`${log.distanceKm} km`)
  if (log.durationMin) bits.push(`${log.durationMin} min`)
  if (log.effort) bits.push(`effort ${log.effort}/5`)
  return bits.length > 0 ? bits.join(' · ') : null
}
