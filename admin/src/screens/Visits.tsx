import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'

type Visit = {
  anon_id: string
  path: string
  referrer: string | null
  utm_source: string | null
  country: string | null
  device: string
  lang: string | null
  at: string | null
  is_new: boolean
  first_at: string | null
  visits_total: number
}

const CARD = 'rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]'

// Тот же интервал, что у счётчика онлайна: лента заходов интересна как раз
// тем, что человек появляется в ней сразу.
const EVERY_MS = 5000

function source(v: Visit): string {
  if (v.utm_source) return v.utm_source
  if (!v.referrer) return 'напрямую'
  try {
    return new URL(v.referrer).hostname.replace(/^www\./, '')
  } catch {
    return v.referrer
  }
}

export function Visits() {
  const [items, setItems] = useState<Visit[] | null>(null)
  const [days, setDays] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      api.get<{ items: Visit[] }>(`/visits?days=${days}&limit=300`)
        .then((d) => { if (alive) { setError(null); setItems(d.items) } })
        .catch((e: Error) => { if (alive) setError(e.message) })
    }
    load()
    const timer = setInterval(load, EVERY_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [days])

  if (error) return <p className="text-[#D88C9A]">{error}</p>
  if (!items) return <p className="text-[#666]">Загружаем…</p>

  const fresh = items.filter((v) => v.is_new).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              days === d ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#666]'
            }`}
          >
            {d === 1 ? 'Сутки' : `${d} дней`}
          </button>
        ))}
        <span className="ml-2 text-sm text-[#666]">
          Заходов: <b className="text-[#1A1A1A]">{items.length}</b> · впервые:{' '}
          <b className="text-[#1A1A1A]">{fresh}</b>
        </span>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#666]">
            <tr>
              <th className="pb-3 pr-4 font-medium">Когда</th>
              <th className="pb-3 pr-4 font-medium">Посетитель</th>
              <th className="pb-3 pr-4 font-medium">Страница</th>
              <th className="pb-3 pr-4 font-medium">Откуда</th>
              <th className="pb-3 pr-4 font-medium">Страна</th>
              <th className="pb-3 pr-4 font-medium">Устройство</th>
              <th className="pb-3 font-medium">Заходов всего</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v, i) => (
              <tr key={`${v.anon_id}-${v.at}-${i}`} className="border-t border-[#F3EFEC]">
                <td className="whitespace-nowrap py-2 pr-4 text-[#1A1A1A]">
                  {formatDateTime(v.at)}
                </td>
                <td className="py-2 pr-4">
                  {/* Имени у анонимного посетителя нет — есть идентификатор
                      браузера. Показываем его началом: этого хватает, чтобы
                      узнать того же человека в соседней строке. */}
                  <span className="font-mono text-xs text-[#666]">{v.anon_id.slice(0, 8)}</span>
                  {v.is_new && (
                    <span className="ml-2 rounded bg-[#FCAE91] px-1.5 py-0.5 text-xs font-semibold text-[#1A1A1A]">
                      впервые
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-[#666]">{v.path}</td>
                <td className="py-2 pr-4 text-[#666]">{source(v)}</td>
                <td className="py-2 pr-4 text-[#666]">{v.country ?? '—'}</td>
                <td className="py-2 pr-4 text-[#666]">{v.device}</td>
                <td className="py-2 text-[#666]">
                  {v.visits_total}
                  {!v.is_new && v.first_at && (
                    <span className="ml-1 text-xs">(с {formatDateTime(v.first_at)})</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-[#666]">За период никто не заходил</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#666]">
        Перезагрузка страницы в пределах получаса новым заходом не считается, IP не хранится —
        только код страны.
      </p>
    </div>
  )
}
