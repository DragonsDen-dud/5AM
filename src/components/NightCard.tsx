import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { getDailyMessage } from '../lib/content'
import { addDays, todayKey } from '../lib/dates'
import { MessageCard } from './MessageCard'
import type { Message, Settings } from '../lib/types'

const MIN_PLAN_LENGTH = 12

interface Props {
  settings: Settings
  onDone: () => void
}

/**
 * The night wind-down (spec §10.5). The if-then input is required before this
 * dismisses, and that is the point: implementation intentions only produce their
 * effect when the plan is actually written, not when it is merely read about.
 * Do not add a skip button.
 */
export function NightCard({ settings, onDone }: Props) {
  const [message, setMessage] = useState<Message | null>(null)
  const [plan, setPlan] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getDailyMessage(settings, 'night').then((m) => {
      if (!cancelled) setMessage(m)
    })
    return () => {
      cancelled = true
    }
  }, [settings])

  const valid = plan.trim().length >= MIN_PLAN_LENGTH

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const runDate = addDays(todayKey(), 1)
      await db.nightPlans.put({
        date: runDate,
        planText: plan.trim(),
        createdAt: new Date().toISOString(),
        messageId: message?.id ?? '',
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-base-900">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 safe-t safe-b">
        <header className="pt-4">
          <span className="label">Wind-down</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Set tomorrow now.</h1>
        </header>

        {message && <MessageCard message={message} />}

        <div className="flex-1">
          <label htmlFor="if-then" className="label">
            Tomorrow&rsquo;s if-then plan
          </label>
          <textarea
            id="if-then"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={4}
            autoComplete="off"
            className="field mt-2 resize-none"
            placeholder="When the alarm goes at 4:45, then I put my feet on the floor and pull on the kit by the door."
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Name the trigger and the first physical action. Specific beats motivated.
          </p>
        </div>

        <div className="pb-4">
          <button type="button" onClick={submit} disabled={!valid || saving} className="btn-primary w-full">
            {saving ? 'Saving' : 'Lock the plan'}
          </button>
          <p className="mt-3 text-center text-[11px] text-ink-faint">
            {valid
              ? 'This is shown back to you at check-in.'
              : 'Write the plan to continue. There is no skip.'}
          </p>
        </div>
      </div>
    </div>
  )
}
