interface Props {
  size?: 'sm' | 'lg'
  showIcon?: boolean
}

/**
 * "5AM RUN CLUB" set in the tabular/scoreboard face, "WITH DENYS" subordinate
 * beneath it (spec §9.4).
 */
export function Wordmark({ size = 'sm', showIcon = false }: Props) {
  const large = size === 'lg'

  return (
    <div className="flex flex-col items-center gap-3">
      {showIcon && (
        <img
          src="/icons/icon.svg"
          alt=""
          width={large ? 88 : 56}
          height={large ? 88 : 56}
          className="rounded-2xl"
        />
      )}
      <div className="flex flex-col items-center">
        <span
          className={`tnum font-semibold text-ink ${
            large ? 'text-xl tracking-[0.22em]' : 'text-sm tracking-[0.2em]'
          }`}
        >
          5AM RUN CLUB
        </span>
        <span
          className={`tnum mt-1 text-ink-faint ${
            large ? 'text-[11px] tracking-[0.34em]' : 'text-[9px] tracking-[0.3em]'
          }`}
        >
          WITH DENYS
        </span>
      </div>
    </div>
  )
}
