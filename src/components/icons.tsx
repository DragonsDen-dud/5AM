/**
 * The app's icon set. Deliberately tiny and hand-drawn on a 24-grid: one stroke
 * weight, round caps, no fills, so they sit at the same optical weight as the
 * type around them. `currentColor` throughout, so a row's status colour drives
 * the icon without a second lookup.
 */

type IconProps = { className?: string }

function Svg({ className = 'h-[18px] w-[18px]', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Sunrise — the morning run. A sun just clearing the horizon. */
export function IconSunrise(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v3" />
      <path d="M5.6 9.1 7.4 10.9" />
      <path d="M18.4 9.1 16.6 10.9" />
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M3 17h18" />
      <path d="M6.5 20.5h11" />
    </Svg>
  )
}

/** Moon — last night's sleep. */
export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4Z" />
    </Svg>
  )
}

/** Bar column — training load. Reads as a load chart, not as a gym. */
export function IconLoad(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 20V13" />
      <path d="M12 20V5" />
      <path d="M19 20v-4" />
      <path d="M3 20h18" />
    </Svg>
  )
}

/** Alarm clock — tomorrow's plan and its alarm. */
export function IconAlarm(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10.5v3.2l2 1.4" />
      <path d="M4.5 5.2 7.2 3" />
      <path d="M19.5 5.2 16.8 3" />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5 9.5 17.5 19.5 7" />
    </Svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  )
}

/** Chevron. Rotated by the caller for direction. */
export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </Svg>
  )
}
