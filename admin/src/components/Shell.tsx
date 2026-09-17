import { Live } from './Live'

export type Tab = 'overview' | 'visits' | 'accounts' | 'feed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Обзор' },
  { key: 'visits', label: 'Визиты' },
  { key: 'accounts', label: 'Аккаунты' },
  { key: 'feed', label: 'Лента' },
]

export function Shell({
  tab, onTab, name, onLogout, children,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  name: string
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      {/* Шапка держится на линии, а не на тени: строка разделов и лента под ней
          должны читаться как разные ярусы даже на светлом фоне. */}
      <header className="sticky top-0 z-10 border-b border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <span className="font-bold">Velora · панель платформы</span>
          <nav className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                className="chip"
                aria-pressed={tab === t.key}
                onClick={() => onTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm text-[var(--muted)]">
            <span>{name}</span>
            <button
              onClick={onLogout}
              className="chip"
            >
              Выйти
            </button>
          </div>
        </div>
        {/* Онлайн живёт в шапке, а не на «Обзоре»: цифра нужна одинаково на всех
            вкладках, а опрос при этом остаётся один. */}
        <div className="border-t border-[var(--line)] px-6 py-2.5">
          <Live />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
