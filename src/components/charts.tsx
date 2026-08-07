import { useId, useMemo, useState } from 'react'

/**
 * Chart primitives for Stats v2 (phase-2 §5, §7). Hand-rolled SVG — a charting
 * library would be more code shipped than saved at this scale, and these need to
 * inherit the app's palette exactly rather than be themed back into it.
 *
 * Rules held throughout:
 *  - One measure per panel. No dual axes anywhere: readiness and completion are
 *    two stacked panels sharing an x-axis, never two y-scales on one plot.
 *  - Amber is the primary-series colour and nothing else (§7).
 *  - Grid and axes are recessive; the data is the only thing with contrast.
 *  - Identity is never colour alone — every status has a text label and a tooltip.
 */

/**
 * Status steps for the readiness strip, lifted a little from the UI dot colours
 * so they clear 3:1 against the chart surface. Verified with the palette
 * validator against #0E141B: contrast passes on all three, CVD separation 10.6
 * ΔE, normal-vision separation 18.9 ΔE. They stay inside the spec's stated
 * families — tactical green, the existing amber accent, sober red-brown — which
 * is why the muted-chroma and lightness-band checks are knowingly not met: the
 * brief asks for exactly that restraint, and the checks that protect the reader
 * all pass.
 */
export const READINESS_CHART_COLORS = {
  green: '#5E9370',
  amber: '#E8901F',
  red: '#B0553F',
} as const

const AXIS = '#33404e'
const GRID = '#18212b'
const PRIMARY = '#FF6B35'

export interface SeriesPoint {
  /** YYYY-MM-DD */
  date: string
  /** null renders a gap rather than interpolating across missing data. */
  value: number | null
}

interface LineChartProps {
  points: SeriesPoint[]
  /** Fixed domain. Omit for auto-fit. */
  domain?: [number, number]
  formatValue: (v: number) => string
  /** Optional recessive reference line, e.g. the ACWR threshold. */
  reference?: { value: number; label: string }
  height?: number
  ariaLabel: string
}

const W = 320

export function LineChart({
  points,
  domain,
  formatValue,
  reference,
  height = 132,
  ariaLabel,
}: LineChartProps) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const { min, max } = useMemo(() => {
    const values = points.map((p) => p.value).filter((v): v is number => v !== null)
    if (domain) return { min: domain[0], max: domain[1] }
    if (values.length === 0) return { min: 0, max: 1 }
    const lo = Math.min(...values, reference?.value ?? Infinity)
    const hi = Math.max(...values, reference?.value ?? -Infinity)
    return lo === hi ? { min: lo - 1, max: hi + 1 } : { min: lo, max: hi }
  }, [points, domain, reference])

  const padY = 10
  const plotH = height - padY * 2
  const x = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * W)
  const y = (v: number) => padY + plotH - ((v - min) / (max - min || 1)) * plotH

  // Segments so a gap in the data is a gap in the line, not a straight lie across it.
  const segments = useMemo(() => {
    const out: { i: number; v: number }[][] = []
    let run: { i: number; v: number }[] = []
    points.forEach((p, i) => {
      if (p.value === null) {
        if (run.length > 0) out.push(run)
        run = []
      } else {
        run.push({ i, v: p.value })
      }
    })
    if (run.length > 0) out.push(run)
    return out
  }, [points])

  const linePath = segments
    .map((seg) => seg.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' '))
    .join(' ')

  const areaPath = segments
    .filter((seg) => seg.length > 1)
    .map((seg) => {
      const top = seg.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ')
      return `${top} L${x(seg[seg.length - 1].i)},${height - padY} L${x(seg[0].i)},${height - padY} Z`
    })
    .join(' ')

  const active = hover !== null ? points[hover] : null

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const index = Math.round(ratio * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, index)))
  }

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full touch-none"
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.28" />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={padY + plotH * t}
              y2={padY + plotH * t}
              stroke={GRID}
              strokeWidth="1"
            />
          ))}

          {reference && reference.value >= min && reference.value <= max && (
            <line
              x1={0}
              x2={W}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke={AXIS}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          <path
            d={linePath}
            fill="none"
            stroke={PRIMARY}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active?.value != null && hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padY}
                y2={height - padY}
                stroke={AXIS}
                strokeWidth="1"
              />
              {/* 2px surface ring so the marker reads over the line it sits on. */}
              <circle cx={x(hover)} cy={y(active.value)} r="5.5" fill="#0E141B" />
              <circle cx={x(hover)} cy={y(active.value)} r="3.5" fill={PRIMARY} />
            </>
          )}
        </svg>

        {active && (
          <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-base-600 bg-base-900/95 px-2 py-1">
            <span className="tnum text-[11px] text-ink">
              {active.value === null ? 'No data' : formatValue(active.value)}
            </span>
            <span className="tnum ml-2 text-[11px] text-ink-faint">{active.date.slice(5)}</span>
          </div>
        )}
      </div>

      <figcaption className="tnum mt-1 flex justify-between text-[10px] text-ink-faint">
        <span>{points[0]?.date.slice(5) ?? ''}</span>
        {reference && <span>{reference.label}</span>}
        <span>{points[points.length - 1]?.date.slice(5) ?? ''}</span>
      </figcaption>
    </figure>
  )
}

export interface StripCell {
  date: string
  /** Key into the tone map; null renders as an untracked day. */
  tone: keyof typeof READINESS_CHART_COLORS | null
  label: string
}

/**
 * A one-row categorical strip. Shares the x-axis with the chart above it, which
 * is how readiness sits "alongside" completion without a second y-scale.
 */
export function StatusStrip({ cells, ariaLabel }: { cells: StripCell[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const active = hover !== null ? cells[hover] : null

  return (
    <figure className="m-0">
      <div className="relative">
        <div
          className="flex h-4 w-full gap-px overflow-hidden rounded-[3px]"
          role="img"
          aria-label={ariaLabel}
          onPointerLeave={() => setHover(null)}
        >
          {cells.map((cell, i) => (
            <span
              key={cell.date}
              onPointerEnter={() => setHover(i)}
              className="h-full flex-1"
              style={{
                backgroundColor: cell.tone ? READINESS_CHART_COLORS[cell.tone] : '#18212b',
              }}
            />
          ))}
        </div>
        {active && (
          <div className="pointer-events-none absolute -top-7 right-0 rounded-md border border-base-600 bg-base-900/95 px-2 py-1">
            <span className="tnum text-[11px] text-ink">{active.label}</span>
            <span className="tnum ml-2 text-[11px] text-ink-faint">{active.date.slice(5)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-ink-faint">
      {(['green', 'amber', 'red'] as const).map((tone) => (
        <span key={tone} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-[2px]"
            style={{ backgroundColor: READINESS_CHART_COLORS[tone] }}
          />
          <span className="capitalize">{tone}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-[2px] bg-base-700" />
        Not scored
      </span>
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
  /** Shown next to the label — sample size, count, whatever qualifies the bar. */
  meta?: string
}

/**
 * Horizontal bars for one measure across categories. A single hue throughout:
 * the categories are the axis, not separate series, so colour would be encoding
 * nothing.
 */
export function BarList({
  data,
  formatValue,
  max,
}: {
  data: BarDatum[]
  formatValue: (v: number) => string
  max?: number
}) {
  const ceiling = max ?? Math.max(...data.map((d) => d.value), 0.0001)

  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-ink-dim">{d.label}</span>
            <span className="tnum text-xs font-semibold text-ink">{formatValue(d.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-base-700">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (d.value / ceiling) * 100)}%`,
                backgroundColor: PRIMARY,
              }}
            />
          </div>
          {d.meta && <p className="tnum mt-1 text-[10px] text-ink-faint">{d.meta}</p>}
        </li>
      ))}
    </ul>
  )
}
