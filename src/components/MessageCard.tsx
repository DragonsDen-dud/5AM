import type { Message } from '../lib/types'

const CATEGORY_LABELS: Record<Message['category'], string> = {
  sleep: 'Sleep',
  physiology: 'Physiology',
  identity: 'Identity',
  streak: 'Automaticity',
  recovery: 'Recovery',
  plan: 'Planning',
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
