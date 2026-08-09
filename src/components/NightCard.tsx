import { useEffect, useId, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getStreak, upsertNightPlan } from '../lib/db'
import { getDailyMessage } from '../lib/content'
import { formatDateKey, formatDuration } from '../lib/dates'
import { currentStage } from '../lib/stage'
import {
  androidAlarmIntentUrl,
  formatAlarmDisplay,
  formatAlarmParts,
  isValidHHMM,
  nextRunDate,
  resolvedTimeZone,
  safeTargetTime,
  streakStartDate,
  suggestedAlarmTime,
  supportsAlarmIntent,
  timeZoneLabel,
  zonedTimeToInstant,
} from '../lib/alarmTime'
import { useNow } from '../hooks/useNow'
import { MessageCard } from './MessageCard'
import type { Message, Settings } from '../lib/types'

const MIN_PLAN_LENGTH = 12
const DRAFT_SAVE_DELAY_MS = 700

interface Props {
  settings: Settings
  onDone: () => void
  /**
   * Present only when this was opened by hand rather than because it is due.
   * Its absence is what makes the screen a lock.
   */
  onDismiss?: () => void
}

/**
 * The night wind-down (spec §10.5, extended by the alarm-nudge patch §2).
 *
 * Two conditions now, checked as one gate: the if-then plan and an
 * acknowledged alarm. Both are honour-system by necessity — no web API can
 * verify a native alarm was set, and no skip button exists for either, because
 * implementation intentions and a decided wake time only work when they are
 * actually committed to rather than read about.
 *
 * Note what this screen deliberately does not depend on: notifications. Push
 * may be denied, or silently fail (it does on iOS unless the app is installed).
 * This screen is the source of truth and blocks on its own the next time the
 * app is opened that evening (§4.7).
 */
export function NightCard({ settings, onDone, onDismiss }: Props) {
  const uid = useId()
  const now = useNow(30_000)

  const [message, setMessage] = useState<Message | null>(null)
  const [plan, setPlan] = useState('')
  const [alarmOverride, setAlarmOverride] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)

  /*
   * §4.1 / §4.4: everything below is recomputed on every render from the live
   * settings row and the current clock. Nothing is captured once at mount —
   * that is precisely how a stale "tomorrow" or a stale target time survives an
   * evening and shows the wrong number.
   */
  const runDate = nextRunDate(settings, now)
  const timeZone = resolvedTimeZone()
  const targetTime = safeTargetTime(settings.targetTime)

  const streak = useLiveQuery(() => getStreak(), [])
  const existing = useLiveQuery(
    async () => (await db.nightPlans.where('date').equals(runDate).first()) ?? null,
    [runDate],
  )

  const suggestion = suggestedAlarmTime(settings, {
    runDate,
    anchorDate: settings.trackingStartsOn,
    stage: currentStage(settings, now),
    currentStreak: streak?.currentStreak ?? 0,
    streakStartDate: streakStartDate(streak?.lastCheckInDate ?? null, streak?.currentStreak ?? 0),
  })

  const alarmTime = alarmOverride ?? suggestion.time
  const label = timeZoneLabel(timeZone, now)
  const untilMs = zonedTimeToInstant(runDate, alarmTime, timeZone).instant.getTime() - now.getTime()

  useEffect(() => {
    let cancelled = false
    void getDailyMessage(settings, 'night').then((m) => {
      if (!cancelled) setMessage(m)
    })
    return () => {
      cancelled = true
    }
  }, [settings])

  /*
   * §4.5. Reopening after backgrounding mid-flow restores the draft rather than
   * asking for it again. Hydration runs once per date: after that the inputs
   * are authoritative, so a save round-trip cannot overwrite what is being
   * typed. A row that does not exist leaves the current text alone.
   */
  const hydrated = existing !== undefined
  const hydratedFor = useRef<string | null>(null)
  const touched = useRef(false)
  useEffect(() => {
    if (existing === undefined || hydratedFor.current === runDate) return
    hydratedFor.current = runDate
    // A saved row can arrive a frame or two after the inputs are on screen. If
    // anything has been touched by then, the person is authoritative — restoring
    // over the top would silently undo a tick or a keystroke.
    if (!existing || touched.current) return
    if (existing.planText) setPlan(existing.planText)
    if (isValidHHMM(existing.confirmedAlarmTime)) setAlarmOverride(existing.confirmedAlarmTime)
    setConfirmed(existing.alarmConfirmed === true)
  }, [existing, runDate])

  /*
   * §4.5. The draft is persisted as it is written, not only on unlock, so
   * backgrounding the app halfway through loses nothing. Upsert by date keeps
   * it to one row (§4.6).
   */
  useEffect(() => {
    const text = plan.trim()
    if (text.length === 0 || hydratedFor.current !== runDate) return
    // Nothing to write if the row already says this. Re-opening the screen
    // without touching it should not churn the store.
    if (existing && existing.planText === text && existing.suggestedAlarmTime === suggestion.time) {
      return
    }
    const id = setTimeout(() => {
      void upsertNightPlan(runDate, {
        planText: text,
        messageId: message?.id ?? '',
        suggestedAlarmTime: suggestion.time,
      }).catch(() => undefined)
    }, DRAFT_SAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [plan, runDate, message, suggestion.time, existing])

  const planValid = plan.trim().length >= MIN_PLAN_LENGTH
  const valid = planValid && confirmed

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await upsertNightPlan(runDate, {
        planText: plan.trim(),
        messageId: message?.id ?? '',
        suggestedAlarmTime: suggestion.time,
        confirmedAlarmTime: alarmTime,
        alarmConfirmed: true,
        // Captured from the device, at confirmation time, so a later "it
        // suggested the wrong time" can be checked against what the device
        // actually reported that night (§4.3).
        timezoneAtConfirmation: timeZone,
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  /*
   * §4.8. Best-effort handoff. Whether the Clock app opens depends on the
   * browser and on a compatible clock app existing, and neither is detectable
   * from here — so nothing is gated on it, no error is raised, and the written
   * instructions below sit on screen the whole time regardless.
   *
   * A plain link rather than `location.href = …`: an unhandled scheme is then
   * the browser's problem to ignore, instead of a navigation this document has
   * committed to and cannot take back.
   */
  const canHandOff = supportsAlarmIntent()

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-base-900">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 safe-t safe-b">
        <header className="flex items-start justify-between pt-4">
          <div>
            <span className="label">Wind-down</span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {onDismiss ? 'Catching up.' : 'Set tomorrow now.'}
            </h1>
            {onDismiss && (
              <p className="mt-2 text-sm leading-relaxed text-ink-dim">
                Late is better than not at all. This writes the plan and the alarm for{' '}
                {formatRunDate(runDate)}.
              </p>
            )}
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="btn-ghost pressable -mr-2 shrink-0 px-3 py-2 text-lg"
            >
              &times;
            </button>
          )}
        </header>

        {message && <MessageCard message={message} />}

        {/*
          Nothing interactive until the saved row has resolved. A form that
          renders empty and fills in a beat later is not just a flash: it is a
          box you can start typing into before the draft arrives, and the
          restore then has to choose between your keystrokes and the disk. Not
          offering it for those two frames removes the choice entirely.
        */}
        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-sm text-ink-faint">Loading tonight&rsquo;s plan…</p>
          </div>
        ) : (
        <>
        <div>
          <label htmlFor={`${uid}-if-then`} className="label">
            Tomorrow&rsquo;s if-then plan
          </label>
          <textarea
            id={`${uid}-if-then`}
            value={plan}
            onChange={(e) => {
              touched.current = true
              setPlan(e.target.value)
            }}
            rows={4}
            autoComplete="off"
            className="field mt-2 resize-none"
            placeholder="When the alarm goes at 4:45, then I put my feet on the floor and pull on the kit by the door."
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Name the trigger and the first physical action. Specific beats motivated.
          </p>
        </div>

        <section className="card flex flex-col gap-4">
          <span className="label">Alarm</span>

          <div>
            <p className="text-xs text-ink-dim">Tomorrow&rsquo;s target</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              <AlarmTime hhmm={suggestion.time} />
            </p>
            {/* §4.9 — the time is never shown without the zone it belongs to. */}
            <p className="tnum mt-1 text-xs text-ink-faint">
              {label} · {timeZone}
              {untilMs > 0 ? ` · in ${formatDuration(untilMs)}` : ''}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">
              Set your alarm now — the decision happens tonight, not at{' '}
              <AlarmTime hhmm={minuteBefore(targetTime)} /> tomorrow.
            </p>
            {suggestion.rampApplied && (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                Ramping toward {formatAlarmDisplay(targetTime)} in{' '}
                {settings.chronotypeRampStep ?? 15}
                -minute steps. This is the only thing allowed to move your wake time.
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${uid}-alarm`} className="label">
              Alarm time
            </label>
            <input
              id={`${uid}-alarm`}
              type="time"
              value={alarmTime}
              onChange={(e) => {
                touched.current = true
                const next = e.target.value
                setAlarmOverride(isValidHHMM(next) ? next : null)
                // Changing the time invalidates the promise made about the old
                // one — it has to be re-made against the new number.
                setConfirmed(false)
              }}
              className="field tnum mt-2"
            />
          </div>

          {canHandOff && (
            <a href={androidAlarmIntentUrl(alarmTime)} className="btn-secondary w-full">
              Set alarm on this phone
            </a>
          )}

          {/* Unconditional. Never hidden behind a deep link that may not have
              worked, because whether it worked cannot be detected (§4.8). */}
          <p className="text-xs leading-relaxed text-ink-faint">
            Open your phone&rsquo;s Clock app and set an alarm for{' '}
            <span className="text-ink-dim">
              <AlarmTime hhmm={alarmTime} />
            </span>{' '}
            ({label}).
            This app cannot set it for you — no web app can wake a sleeping phone.
          </p>

          <label
            htmlFor={`${uid}-confirm`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-base-600 bg-base-900 px-3.5 py-3"
          >
            <input
              id={`${uid}-confirm`}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                touched.current = true
                setConfirmed(e.target.checked)
              }}
              className="mt-0.5 size-4 shrink-0 accent-[#FF6B35]"
            />
            <span className="text-sm leading-snug">
              Alarm&rsquo;s set for <AlarmTime hhmm={alarmTime} />.
            </span>
          </label>
        </section>

        <div className="mt-auto pb-4">
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="btn-primary pressable w-full"
          >
            {saving ? 'Saving' : 'Lock the plan'}
          </button>
          <p className="mt-3 text-center text-[11px] text-ink-faint">{gateHint(planValid, confirmed)}</p>
        </div>
        </>
        )}
      </div>
    </div>
  )
}

/** Tabular figures on the digits only — "5:00 AM", not "5:00  AM". */
function AlarmTime({ hhmm }: { hhmm: string }) {
  const { clock, period } = formatAlarmParts(hhmm)
  return (
    <>
      <span className="tnum">{clock}</span> {period}
    </>
  )
}

/** "04:59" — the minute before the target, used in the §5 copy. */
function minuteBefore(hhmm: string): string {
  const [h, m] = safeTargetTime(hhmm).split(':').map(Number)
  const total = (h * 60 + m - 1 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** One gate, so it says which half is outstanding rather than just refusing. */
function gateHint(planValid: boolean, confirmed: boolean): string {
  if (planValid && confirmed) return 'This is shown back to you at check-in.'
  if (!planValid && !confirmed) return 'Write the plan and set the alarm to continue. There is no skip.'
  if (!planValid) return 'Write the plan to continue. There is no skip.'
  return 'Set the alarm and confirm it to continue. There is no skip.'
}

/** "tomorrow morning" / "Monday morning" — friendlier than a bare date key. */
function formatRunDate(dateKey: string): string {
  return `${formatDateKey(dateKey)} morning`
}
