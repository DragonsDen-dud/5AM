import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { checkIn, WindowClosedError } from '../lib/checkin'
import { getDailyMessage } from '../lib/content'
import { formatDuration, todayKey } from '../lib/dates'
import { useNow } from '../hooks/useNow'
import { useBlobUrl } from '../hooks/useBlobUrl'
import { MessageCard } from '../components/MessageCard'
import { RunDetailsForm } from '../components/RunDetailsForm'
import { TimeBar } from '../components/TimeBar'
import { CONFIRM_WORD, isConfirmed } from '../lib/verification/honor'
import { captureFromVideo, startCamera, stopCamera, stampImageFile } from '../lib/verification/photo'
import { windowForDate, windowPhase, windowRemainingFraction } from '../lib/window'
import type { Message, Settings } from '../lib/types'

interface Props {
  settings: Settings
  onClose: () => void
}

export function CheckIn({ settings, onClose }: Props) {
  const now = useNow(1000)
  const today = todayKey(now)
  const [message, setMessage] = useState<Message | null>(null)

  const plan = useLiveQuery(() => db.nightPlans.where('date').equals(today).first(), [today])
  const todayLog = useLiveQuery(() => db.runLogs.where('date').equals(today).first(), [today])

  const window = windowForDate(settings, today)
  const phase = windowPhase(window, now)
  const done = todayLog?.status === 'completed'

  useEffect(() => {
    let cancelled = false
    void getDailyMessage(settings, 'morning').then((m) => {
      if (!cancelled) setMessage(m)
    })
    return () => {
      cancelled = true
    }
  }, [settings])

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-base-900">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 safe-t safe-b">
        <header className="flex items-center justify-between pt-2">
          <span className="label">{done ? 'Checked in' : 'Check in'}</span>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1 text-xs">
            Close
          </button>
        </header>

        {/* Morning message sits above the action — highest-friction moment is where it belongs. */}
        {message && <MessageCard message={message} compact />}

        {plan && (
          <div className="rounded-lg border border-base-700 bg-base-800 px-4 py-3">
            <span className="label">Your plan</span>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{plan.planText}</p>
          </div>
        )}

        {phase === 'open' && !done && (
          <TimeBar
            fraction={windowRemainingFraction(window, now)}
            msRemaining={window.closesAt.getTime() - now.getTime()}
          />
        )}

        <div className="flex-1 pb-6">
          {done && todayLog ? (
            <div className="flex flex-col gap-5">
              <VerifiedPanel blob={todayLog.photoBlob} method={todayLog.verificationMethod} />
              <div className="card">
                <span className="label">Log it</span>
                <div className="mt-4">
                  <RunDetailsForm log={todayLog} onSaved={onClose} submitLabel="Save and close" />
                </div>
              </div>
            </div>
          ) : phase === 'before' ? (
            <Locked
              title="Not yet"
              body={`The window opens in ${formatDuration(window.opensAt.getTime() - now.getTime())}.`}
            />
          ) : phase === 'closed' ? (
            <Locked
              title="Window closed"
              body="Today is settled. Check-in does not reopen, and it cannot be backdated."
            />
          ) : settings.verificationMethod === 'photo' ? (
            <PhotoCheckIn settings={settings} />
          ) : (
            <HonorCheckIn settings={settings} />
          )}
        </div>
      </div>
    </div>
  )
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  )
}

function VerifiedPanel({ blob, method }: { blob?: Blob; method?: string }) {
  const url = useBlobUrl(blob)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-xl border border-signal/40 bg-signal-dim/25 px-4 py-3.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-signal" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm font-medium">
          Verified by {method === 'photo' ? 'photo' : 'honor check-in'}.
        </p>
      </div>
      {url && (
        <img
          src={url}
          alt="Today's check-in photo"
          className="w-full rounded-xl border border-base-700"
        />
      )}
    </div>
  )
}

function PhotoCheckIn({ settings }: { settings: Settings }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [ready, setReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [pending, setPending] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewUrl = useBlobUrl(pending)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const stream = await startCamera()
        if (cancelled) {
          stopCamera(stream)
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setReady(true)
      } catch {
        if (!cancelled) {
          setCameraError('Camera unavailable. Use the capture button below instead.')
        }
      }
    })()

    return () => {
      cancelled = true
      stopCamera(streamRef.current)
      streamRef.current = null
    }
  }, [])

  const shoot = async () => {
    if (!videoRef.current) return
    setError(null)
    try {
      setPending(await captureFromVideo(videoRef.current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not take the photo.')
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setPending(await stampImageFile(file))
    } catch {
      setError('Could not read that image.')
    }
  }

  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      await checkIn(settings, { verificationMethod: 'photo', photoBlob: pending })
      stopCamera(streamRef.current)
      streamRef.current = null
    } catch (err) {
      setError(
        err instanceof WindowClosedError
          ? 'The window closed while you were on this screen.'
          : 'Could not save the check-in.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-base-700 bg-base-850">
        {previewUrl ? (
          <img src={previewUrl} alt="Check-in preview" className="h-full w-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            {!ready && (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-faint">
                {cameraError ?? 'Opening camera'}
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        Shoot outside. The time is burned into the image and the photo stays on this device.
      </p>

      {error && <p className="text-sm text-miss">{error}</p>}

      {pending ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="btn-secondary flex-1"
            disabled={busy}
          >
            Retake
          </button>
          <button type="button" onClick={confirm} className="btn-primary flex-1" disabled={busy}>
            {busy ? 'Saving' : 'Confirm'}
          </button>
        </div>
      ) : ready ? (
        <button type="button" onClick={shoot} className="btn-primary w-full py-4">
          Take photo
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-primary w-full py-4"
          >
            Capture photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
        </>
      )}
    </div>
  )
}

function HonorCheckIn({ settings }: { settings: Settings }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = isConfirmed(typed)

  const confirm = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await checkIn(settings, { verificationMethod: 'honor' })
    } catch (err) {
      setError(
        err instanceof WindowClosedError
          ? 'The window closed while you were on this screen.'
          : 'Could not save the check-in.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <span className="label">Honor check-in</span>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          This is the weakest verification in the app. Nothing here proves anything — it holds only
          as long as you do.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="label">
          Type {CONFIRM_WORD} to confirm
        </label>
        <input
          id="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="field tnum mt-2 tracking-[0.3em] uppercase"
          placeholder={CONFIRM_WORD}
        />
      </div>

      {error && <p className="text-sm text-miss">{error}</p>}

      <button type="button" onClick={confirm} disabled={!valid || busy} className="btn-primary w-full py-4">
        {busy ? 'Saving' : 'Confirm the run'}
      </button>
    </div>
  )
}
