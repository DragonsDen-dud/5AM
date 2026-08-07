import type { Message, MessageCategory } from '../lib/types'

const CATEGORY_LABELS: Record<MessageCategory, string> = {
  sleep: 'Sleep',
  physiology: 'Physiology',
  identity: 'Identity',
  streak: 'Automaticity',
  recovery: 'Recovery',
  plan: 'Planning',
  'injury-aware': 'Load & injury',
}

interface Props {
  message: Message
  compact?: boolean
}

export function MessageCard({ message, compact = false }: Props) {
  const isRecovery = message.category === 'recovery'

  return (
    <article
      className={`rounded-xl border p-4 ${
        isRecovery ? 'border-miss/40 bg-miss-dim/25' : 'border-base-700 bg-base-850'
      }`}
    >
      <span className="label">{CATEGORY_LABELS[message.category]}</span>
      <p className={`mt-2 text-ink ${compact ? 'text-sm leading-relaxed' : 'leading-relaxed'}`}>
        {message.text}
      </p>
      {message.source && (
        <p className="mt-3 text-[11px] leading-snug text-ink-faint">{message.source}</p>
      )}
    </article>
  )
}

/**
 * Load and injury advisories reuse the Content Engine card exactly — spec §7
 * says extend the existing pattern rather than invent a second one, so a
 * warning about training load reads as more of the same coach, not a new system
 * shouting from a different part of the screen.
 */
export function AdvisoryCard({
  label,
  body,
  tone = 'neutral',
  footnote,
}: {
  label: string
  body: string
  tone?: 'neutral' | 'caution'
  footnote?: string
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        tone === 'caution' ? 'border-ember/35 bg-base-850' : 'border-base-700 bg-base-850'
      }`}
    >
      <span className={`label ${tone === 'caution' ? 'text-ember/80' : ''}`}>{label}</span>
      <p className="mt-2 leading-relaxed text-ink">{body}</p>
      {footnote && <p className="mt-3 text-[11px] leading-snug text-ink-faint">{footnote}</p>}
    </article>
  )
}

export { CATEGORY_LABELS }
