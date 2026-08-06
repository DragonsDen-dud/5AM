export type Tab = 'today' | 'history' | 'stats' | 'settings'

const TABS: { id: Tab; label: string; path: string }[] = [
  { id: 'today', label: 'Today', path: 'M4 12.5 9.5 18 20 6.5' },
  { id: 'history', label: 'History', path: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4' },
  { id: 'stats', label: 'Stats', path: 'M5 20V11M12 20V4M19 20v-6' },
  { id: 'settings', label: 'Settings', path: 'M4 7h16M4 12h16M4 17h16' },
]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="sticky bottom-0 border-t border-base-700 bg-base-900/95 backdrop-blur safe-b">
      <ul className="mx-auto flex w-full max-w-md">
        {TABS.map((tab) => {
          const selected = tab.id === active
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                aria-current={selected ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 transition-colors ${
                  selected ? 'text-ink' : 'text-ink-faint'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                  <path
                    d={tab.path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
