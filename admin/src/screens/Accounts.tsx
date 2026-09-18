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
        className="field w-full max-w-md"
      />
      <p className="text-sm text-[var(--muted)]">Найдено: {total}</p>
      {error && <p className="text-[var(--alert)]">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="tbl min-w-[900px]">
          <thead>
            <tr>
              <th>Студия</th>
              <th>Владелец</th>
              <th>Создана</th>
              <th>Тариф</th>
              <th>Пробный до</th>
              <th>Последний вход</th>
              <th>Заплачено</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.studio_id}>
                <td className="font-medium">{a.name}</td>
                <td className="text-[var(--muted)]">
                  {a.owner.name ?? '—'}<br />
                  <span className="text-xs">{a.owner.email ?? '—'}</span>
                </td>
                <td className="text-[var(--muted)]">{formatDate(a.created_at)}</td>
                <td className="text-[var(--muted)]">
                  {a.plan.name ?? '—'}<br />
                  <span className="text-xs">{a.plan.status ?? '—'}</span>
                </td>
                <td className="text-[var(--muted)]">{formatDate(a.expires_at)}</td>
                <td className="text-[var(--muted)]">{formatDateTime(a.last_login_at)}</td>
                <td>
                  {a.paid.length === 0
                    ? <span className="text-[var(--muted)]">—</span>
                    : a.paid.map((p) => (
                        <div key={p.currency}>
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
