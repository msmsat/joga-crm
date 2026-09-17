import { useEffect, useState } from 'react'
import { api } from '../lib/api'

type LiveData = { landing: number; crm: number; miniapp: number; total: number }

// Пять секунд: ручка не ходит в базу вовсе (считает словарь в памяти), так что
// цена опроса — один HTTP-запрос.
const EVERY_MS = 5000

const PARTS: { key: keyof LiveData; label: string }[] = [
  { key: 'landing', label: 'лендинг' },
  { key: 'crm', label: 'кабинет' },
  { key: 'miniapp', label: 'мини-апп' },
]

export function Live() {
  const [data, setData] = useState<LiveData | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get<LiveData>('/live')
        .then((d) => { if (alive) setData(d) })
        // Сорвавшийся опрос ничего не означает: следующий будет через пять
        // секунд. Показывать ошибку вместо цифры было бы мельтешением.
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, EVERY_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return (
    <div className="tabular flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <span
          className="h-2 w-2 rounded-full bg-[var(--live)]"
          // Точка живая только когда цифры пришли: серая точка при мёртвом
          // опросе честнее зелёной, обещающей связь, которой нет.
          style={{ background: data ? 'var(--live)' : 'var(--line-strong)' }}
        />
        Сейчас онлайн: {data?.total ?? '—'}
      </span>
      {PARTS.map((p) => (
        <span
          key={p.key}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[var(--muted)]"
        >
          {p.label} <span className="font-semibold text-[var(--ink)]">{data?.[p.key] ?? '—'}</span>
        </span>
      ))}
    </div>
  )
}
