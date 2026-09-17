import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'

type Account = {
  studio_id: number
  name: string
  created_at: string | null
  owner: { name: string | null; email: string | null }
  plan: { name: string | null; status: string | null; cycle: string | null; mode: string | null }
  trial_started_at: string | null
  expires_at: string | null
  last_login_at: string | null
  paid: { currency: string; amount: number }[]
  is_paying: boolean
}

export function Accounts() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Account[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Задержка, чтобы не слать запрос на каждую букву в поиске.
    const timer = setTimeout(() => {
      setError(null)
      api.get<{ total: number; items: Account[] }>(
        `/accounts?limit=100&q=${encodeURIComponent(q)}`,
      )
        .then((d) => { setItems(d.items); setTotal(d.total) })
        .catch((e: Error) => setError(e.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по студии или почте владельца"
        className="w-full max-w-md rounded-lg border border-[#E6E2DE] px-3 py-2 outline-none focus:border-[#FCAE91]"
      />
      <p className="text-sm text-[#666]">Найдено: {total}</p>
      {error && <p className="text-[#D88C9A]">{error}</p>}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-[#EFEAE6] text-left text-[#666]">
              <th className="p-4">Студия</th>
              <th className="p-4">Владелец</th>
              <th className="p-4">Создана</th>
              <th className="p-4">Тариф</th>
              <th className="p-4">Пробный до</th>
              <th className="p-4">Последний вход</th>
              <th className="p-4">Заплачено</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.studio_id} className="border-b border-[#F6F3F0]">
                <td className="p-4 font-medium text-[#1A1A1A]">{a.name}</td>
                <td className="p-4 text-[#666]">
                  {a.owner.name ?? '—'}<br />
                  <span className="text-xs">{a.owner.email ?? '—'}</span>
                </td>
                <td className="p-4 text-[#666]">{formatDate(a.created_at)}</td>
                <td className="p-4 text-[#666]">
                  {a.plan.name ?? '—'}<br />
                  <span className="text-xs">{a.plan.status ?? '—'}</span>
                </td>
                <td className="p-4 text-[#666]">{formatDate(a.expires_at)}</td>
                <td className="p-4 text-[#666]">{formatDateTime(a.last_login_at)}</td>
                <td className="p-4">
                  {a.paid.length === 0
                    ? <span className="text-[#666]">—</span>
                    : a.paid.map((p) => (
                        <div key={p.currency} className="text-[#1A1A1A]">
                          {formatMoney(p.amount, p.currency)}
                        </div>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
