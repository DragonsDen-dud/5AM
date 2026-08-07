import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { logSleep } from '../lib/sleep'
import { todayKey } from '../lib/dates'

const HOUR_OPTIONS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]
const QUALITY_LABELS = ['Broken', 'Poor', 'Okay', 'Good', 'Solid']

interface Props {
  date?: string
  onLogged?: () => void
}

/**
 * Tier A sleep logging (§1.3): two taps, no keyboard. It feeds the readiness
 * score and nothing else — the app does not become a sleep tracker.
 */
export function SleepLog({ date, onLogged }: Props) {
  const day = date ?? todayKey()
  const existing = useLiveQuery(
    async () => (await db.sleepEntries.where('date').equals(day).first()) ?? null,
    [day],
  )

  const [hours, setHours] = useState<number | null>(null)
  const [quality, setQuality] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const chosenHours = hours ?? existing?.hoursSlept ?? null
  const chosenQuality = quality ?? existing?.quality ?? null
  const complete = chosenHours !== null && chosenQuality !== null

  const save = async () => {
    if (!complete || saving) return
    setSaving(true)
    try {
      await logSleep(day, chosenHours, chosenQuality)
      onLogged?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="label">Hours slept</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {HOUR_OPTIONS.map((h) => {
            const active = chosenHours === h
            return (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={`tnum rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-ember bg-base-800 text-ember'
                    : 'border-base-600 bg-base-800/40 text-ink-dim'
                }`}
              >
                {h}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="label">Quality</span>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {QUALITY_LABELS.map((label, index) => {
            const value = index + 1
            const active = chosenQuality === value
            return (
              <button
                key={label}
                type="button"
                onClick={() => setQuality(value)}
                className={`rounded-lg border py-2.5 transition-colors ${
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
          {chosenQuality ? QUALITY_LABELS[chosenQuality - 1] : '1 broken — 5 solid'}
        </p>
      </div>

      <button type="button" onClick={save} disabled={!complete} className="btn-secondary w-full">
        {saving ? 'Saving' : existing ? 'Update sleep log' : 'Log sleep'}
      </button>
    </div>
  )
}
