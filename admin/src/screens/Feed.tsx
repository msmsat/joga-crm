import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime, formatMoney } from '../lib/format'

type Payments = {
  received: {
    studio_id: number; studio: string | null; source: string
    amount: number; currency: string; occurred_at: string | null
  }[]
  outstanding: {
    studio_id: number; studio: string | null; kind: string; plan: string
    amount: number; status: string; period: string | null; due_at: string | null
  }[]
}

type Logins = {
  items: {
    user_id: number; name: string; email: string; at: string | null
    device: string; browser: string | null; country: string | null; city: string | null
  }[]
}

const CARD = 'panel panel-pad'

export function Feed() {
  const [payments, setPayments] = useState<Payments | null>(null)
  const [logins, setLogins] = useState<Logins | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<Payments>('/payments?days=90'), api.get<Logins>('/logins?days=7')])
      .then(([p, l]) => { setPayments(p); setLogins(l) })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="text-[var(--alert)]">{error}</p>
  if (!payments || !logins) return <p className="text-[var(--muted)]">Загружаем…</p>

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={CARD}>
        <h2 className="font-semibold">Поступления (90 дней)</h2>
        <ul className="mt-3 text-sm">
          {payments.received.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-[var(--line)] py-2 text-[var(--muted)] last:border-none hover:text-[var(--ink)]">
              <span>{p.studio ?? '—'} · {p.source}</span>
              <span className="whitespace-nowrap tabular">
                {formatMoney(p.amount, p.currency)} · {formatDateTime(p.occurred_at)}
              </span>
            </li>
          ))}
          {payments.received.length === 0 && <li className="text-[var(--muted)]">Пусто</li>}
        </ul>

        <h3 className="mt-6 font-semibold">Неоплаченные счета</h3>
        <ul className="mt-3 text-sm">
          {payments.outstanding.map((o, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-[var(--line)] py-2 text-[var(--muted)] last:border-none hover:text-[var(--ink)]">
              <span>{o.studio ?? '—'} · {o.kind} · {o.status}</span>
              <span className="whitespace-nowrap tabular text-[var(--alert)]">
                до {formatDateTime(o.due_at)}
              </span>
            </li>
          ))}
          {payments.outstanding.length === 0 && <li className="text-[var(--muted)]">Долгов нет</li>}
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold">Входы (7 дней)</h2>
        <ul className="mt-3 text-sm">
          {logins.items.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-[var(--line)] py-2 text-[var(--muted)] last:border-none hover:text-[var(--ink)]">
              <span>{l.name} · <span className="text-xs">{l.email}</span></span>
              <span className="whitespace-nowrap">
                {[l.country, l.device, l.browser].filter(Boolean).join(' · ')} ·{' '}
                {formatDateTime(l.at)}
              </span>
            </li>
          ))}
          {logins.items.length === 0 && <li className="text-[var(--muted)]">Входов нет</li>}
        </ul>
      </section>
    </div>
  )
}
