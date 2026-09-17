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
    <div className="min-h-dvh bg-[#FDFCFB]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[#EFEAE6] px-6 py-4">
        <span className="font-bold text-[#1A1A1A]">Velora · панель платформы</span>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tab === t.key ? 'bg-[#FCAE91] font-semibold text-[#1A1A1A]' : 'text-[#666]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-[#666]">
          <span>{name}</span>
          <button onClick={onLogout} className="underline">Выйти</button>
        </div>
      </header>
      {/* Онлайн живёт в шапке, а не на «Обзоре»: цифра нужна одинаково на всех
          вкладках, а опрос при этом остаётся один. */}
      <div className="border-b border-[#EFEAE6] bg-white px-6 py-3">
        <Live />
      </div>
      <main className="p-6">{children}</main>
    </div>
  )
}
