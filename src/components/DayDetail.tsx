import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../lib/db'
import { formatDateKey } from '../lib/dates'
import { formatHours, impliedLightsOut } from '../lib/sleepStats'
import { useBlobUrl } from '../hooks/useBlobUrl'
import type { RunLog } from '../lib/types'

const FELT_LABELS = ['Grim', 'Flat', 'Fine', 'Good', 'Flying']
const EFFORT_LABELS = ['Easy', 'Steady', 'Solid', 'Hard', 'Everything']
const QUALITY_LABELS = ['Broken', 'Poor', 'Okay', 'Good', 'Solid']

/**
 * One day's record, read-only. Shared by the History calendar and the streak
 * rail on Today so there is exactly one rendering of what a day contains — a
 * second copy would drift the moment either grew a field.
 *
 * Read-only is not an oversight. History is immutable; the only place a day can
 * be edited is Today, and only for the day it belongs to.
 */
export function DayDetail({ dateKey, log }: { dateKey: string; log?: RunLog }) {
  const photoUrl = useBlobUrl(log?.photoBlob)
  const pace = paceLabel(log)

  /*
   * The night is queried here rather than passed in, so every entry point —
   * the History calendar, the streak rail, either lens — shows the same whole
   * day without its caller having to know that a day has two halves.
   */
  const sleep = useLiveQuery(
    async () => (await db.sleepEntries.where('date').equals(dateKey).first()) ?? null,
    [dateKey],
  )
  const settings = useLiveQuery(async () => (await getSettings()) ?? null, [])

  return (
    <section className="surface flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <span className="label">{formatDateKey(dateKey)}</span>
        <span
          className={`text-xs font-semibold tracking-wide ${
            log?.status === 'completed'
              ? 'text-signal-lift'
              : log?.status === 'rest'
                ? 'text-ink-dim'
                : 'text-miss-lift'
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
            <Stat
              label="Effort"
              value={log.effort ? `${log.effort}/5` : '—'}
              caption={log.effort ? EFFORT_LABELS[log.effort - 1] : undefined}
            />
          </dl>

          {/* Optional detail. Rendered only where it exists — an empty row of
              em-dashes says nothing and takes up the same space as something. */}
          {(pace || log.feltScore || log.avgHeartRate) && (
            <dl className="tnum grid grid-cols-3 gap-3 text-sm">
              {pace && <Stat label="Pace" value={pace} />}
              {log.feltScore && (
                <Stat
                  label="Felt"
                  value={`${log.feltScore}/5`}
                  caption={FELT_LABELS[log.feltScore - 1]}
                />
              )}
              {log.avgHeartRate && <Stat label="Avg HR" value={`${log.avgHeartRate} bpm`} />}
            </dl>
          )}

          {log.routeName && (
            <p className="text-sm text-ink-dim">
              <span className="text-ink-faint">Route · </span>
              {log.routeName}
            </p>
          )}

          {log.note && <p className="text-sm leading-relaxed text-ink-dim">{log.note}</p>}

          {log.niggle && (
            <p className="rounded-lg border border-miss/40 bg-miss-dim/20 px-3.5 py-2.5 text-sm leading-relaxed text-ink-dim">
              <span className="font-semibold text-miss-lift">Niggle logged.</span>{' '}
              {log.niggleNote ?? 'No detail recorded.'}
            </p>
          )}

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

      {/* Every day has a night in front of it, whatever the run did. */}
      {sleep && (
        <div className="border-t border-base-700/70 pt-3">
          <dl className="tnum grid grid-cols-3 gap-3 text-sm">
            <Stat label="Slept" value={formatHours(sleep.hoursSlept)} />
            <Stat
              label="Quality"
              value={`${sleep.quality}/5`}
              caption={QUALITY_LABELS[sleep.quality - 1]}
            />
            <Stat
              label="Lights out"
              value={impliedLightsOut(settings?.targetTime ?? '05:00', sleep.hoursSlept)}
              caption="implied"
            />
          </dl>
        </div>
      )}
    </section>
  )
}

/** Derived, never asked for — the app already knows distance and duration. */
function paceLabel(log?: RunLog): string | null {
  if (!log?.distanceKm || !log.durationMin) return null
  const secondsPerKm = (log.durationMin * 60) / log.distanceKm
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null
  const m = Math.floor(secondsPerKm / 60)
  const s = Math.round(secondsPerKm % 60)
  const carry = s === 60
  return `${carry ? m + 1 : m}:${String(carry ? 0 : s).padStart(2, '0')} /km`
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">{value}</dd>
      {caption && <dd className="mt-0.5 text-[11px] text-ink-faint">{caption}</dd>}
    </div>
  )
}
