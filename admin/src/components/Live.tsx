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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <span className="flex items-center gap-2 font-semibold text-[#1A1A1A]">
        <span className="h-2 w-2 rounded-full bg-[#A3C9A8]" />
        Сейчас онлайн: {data?.total ?? '—'}
      </span>
      {PARTS.map((p) => (
        <span key={p.key} className="text-[#666]">
          {p.label} <span className="font-semibold text-[#1A1A1A]">{data?.[p.key] ?? '—'}</span>
        </span>
      ))}
    </div>
  )
}
