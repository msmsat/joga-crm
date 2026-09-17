import { useEffect, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatMoney } from '../lib/format'

type OverviewData = {
  visits: number
  unique_visitors: number
  registrations: number
  studios_created: number
  trials_active: number
  trials_expiring_7d: number
  paying_studios: number
  revenue: { currency: string; amount: number; payments: number }[]
  funnel: {
    visits: number
    registrations: number
    registrations_from_landing: number
    trials_started: number
    paying_studios: number
  }
}

type TrafficData = {
  by_day: { date: string; visits: number; uniques: number }[]
  sources: { key: string; visits: number }[]
  countries: { code: string; visits: number }[]
}

const CARD = 'rounded-2xl bg-white p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.04)]'

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className={CARD}>
      <div className="text-sm text-[#666]">{label}</div>
      <div className="mt-2 text-3xl font-bold text-[#1A1A1A]">{value}</div>
    </div>
  )
}

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [traffic, setTraffic] = useState<TrafficData | null>(null)
  const [days, setDays] = useState(30)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<OverviewData>(`/overview?days=${days}`),
      api.get<TrafficData>(`/traffic?days=${days}`),
    ])
      // Сброс ошибки — здесь, а не в теле эффекта: синхронный setState в эффекте
      // вызывает каскад перерисовок, и правило react-hooks это ловит.
      .then(([o, t]) => { setError(null); setData(o); setTraffic(t) })
      .catch((e: Error) => setError(e.message))
  }, [days])

  if (error) return <p className="text-[#D88C9A]">{error}</p>
  if (!data || !traffic) return <p className="text-[#666]">Загружаем…</p>

  const funnel: { label: string; value: number }[] = [
    { label: 'Уникальных визитов', value: data.funnel.visits },
    { label: 'Регистраций', value: data.funnel.registrations },
    { label: 'Из них с лендинга', value: data.funnel.registrations_from_landing },
    { label: 'Взяли пробный', value: data.funnel.trials_started },
    { label: 'Платят', value: data.funnel.paying_studios },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              days === d ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#666]'
            }`}
          >
            {d} дней
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Визиты" value={data.visits} />
        <Card label="Уникальные посетители" value={data.unique_visitors} />
        <Card label="Регистрации" value={data.registrations} />
        <Card label="Новые студии" value={data.studios_created} />
        <Card label="На пробном" value={data.trials_active} />
        <Card label="Пробный кончается за 7 дней" value={data.trials_expiring_7d} />
        <Card label="Платящих студий" value={data.paying_studios} />
      </div>

      <div className={CARD}>
        <h2 className="font-semibold text-[#1A1A1A]">Деньги за период</h2>
        {data.revenue.length === 0 ? (
          <p className="mt-2 text-sm text-[#666]">Поступлений нет</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {data.revenue.map((r) => (
              <li key={r.currency} className="text-lg text-[#1A1A1A]">
                {formatMoney(r.amount, r.currency)}
                <span className="ml-2 text-sm text-[#666]">({r.payments} поступлений)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <h2 className="font-semibold text-[#1A1A1A]">Воронка</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          {funnel.map((step) => (
            <div key={step.label}>
              <div className="text-2xl font-bold text-[#1A1A1A]">{step.value}</div>
              <div className="text-xs text-[#666]">{step.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <h2 className="font-semibold text-[#1A1A1A]">Визиты по дням</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={traffic.by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#666' }} />
              <YAxis tick={{ fontSize: 11, fill: '#666' }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="visits" stroke="#FCAE91" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="uniques" stroke="#A3C9A8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="font-semibold text-[#1A1A1A]">Источники</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {traffic.sources.map((s) => (
              <li key={s.key} className="flex justify-between text-[#666]">
                <span>{s.key}</span><span className="text-[#1A1A1A]">{s.visits}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={CARD}>
          <h2 className="font-semibold text-[#1A1A1A]">Страны</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {traffic.countries.map((c) => (
              <li key={c.code} className="flex justify-between text-[#666]">
                <span>{c.code}</span><span className="text-[#1A1A1A]">{c.visits}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
