import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'

type Visit = {
  id: number
  anon_id: string
  ip: string | null
  path: string
  referrer: string | null
  utm_source: string | null
  country: string | null
  region: string | null
  city: string | null
  device: string
  lang: string | null
  at: string | null
  is_new: boolean
  first_at: string | null
  visits_total: number
}

type Page = { items: Visit[]; next_before_id: number | null }

const PAGE = 50

// Столько же, сколько у счётчика онлайна: лента живая, и новый заход должен
// появляться в ней сам, пока на неё смотрят.
const REFRESH_MS = 5000

function source(v: Visit): string {
  if (v.utm_source) return v.utm_source
  if (!v.referrer) return 'напрямую'
  try {
    return new URL(v.referrer).hostname.replace(/^www\./, '')
  } catch {
    return v.referrer
  }
}

const DEVICE: Record<string, string> = {
  mobile: 'телефон',
  tablet: 'планшет',
  desktop: 'компьютер',
  unknown: '—',
}

export function Visits() {
  const [items, setItems] = useState<Visit[]>([])
  const [cursor, setCursor] = useState<number | null>(null)
  const [days, setDays] = useState(1)
  const [onlyNew, setOnlyNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Строки, прилетевшие после того, как экран открыли: они вспыхивают один раз.
  const [arrived, setArrived] = useState<Set<number>>(new Set())
  const sentinel = useRef<HTMLDivElement>(null)
  const loadingMore = useRef(false)

  const query = useCallback(
    (before: number | null) =>
      `/visits?days=${days}&limit=${PAGE}&only_new=${onlyNew}` +
      (before === null ? '' : `&before_id=${before}`),
    [days, onlyNew],
  )

  // Смена фильтра — это другая лента: старые строки и курсор к ней отношения
  // не имеют, поэтому список собирается заново, а не дополняется.
  // Флаг загрузки поднимает НАЖАТИЕ, а не эффект: синхронный setState в теле
  // эффекта вызывает лишний каскад перерисовок, и правило react-hooks его ловит.
  const switchTo = (change: () => void, changed: boolean) => {
    if (!changed) return
    setLoading(true)
    change()
  }

  useEffect(() => {
    let alive = true
    api.get<Page>(query(null))
      .then((page) => {
        if (!alive) return
        setError(null)
        setItems(page.items)
        setCursor(page.next_before_id)
        setArrived(new Set())
      })
      .catch((e: Error) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query])

  // Свежие заходы сверху. Догружаем только новое и вклеиваем в начало: перечитать
  // всю ленту целиком значило бы каждые пять секунд выбрасывать то, до чего
  // человек долистал.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      api.get<Page>(query(null))
        .then((page) => {
          // Что именно прилетело, считаем внутри обновления — там под рукой
          // актуальный список, — а подсветку включаем уже снаружи: setState
          // внутри другого setState React справедливо не любит.
          let fresh: Visit[] = []
          setItems((prev) => {
            if (prev.length === 0) return page.items
            const known = new Set(prev.map((v) => v.id))
            fresh = page.items.filter((v) => !known.has(v.id))
            return fresh.length === 0 ? prev : [...fresh, ...prev]
          })
          if (fresh.length > 0) setArrived(new Set(fresh.map((v) => v.id)))
        })
        .catch(() => {
          // Сорвавшийся опрос ничего не значит: следующий через пять секунд.
        })
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [query])

  // Автоподгрузка: строка-маячок под лентой попала в окно — просим ещё страницу.
  // Кнопки «показать ещё» нет намеренно: её единственная работа — заставить
  // человека нажать на то, что и так должно случиться само.
  useEffect(() => {
    const node = sentinel.current
    if (!node || cursor === null) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || loadingMore.current) return
      loadingMore.current = true
      api.get<Page>(query(cursor))
        .then((page) => {
          setItems((prev) => {
            const known = new Set(prev.map((v) => v.id))
            return [...prev, ...page.items.filter((v) => !known.has(v.id))]
          })
          setCursor(page.next_before_id)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => { loadingMore.current = false })
    }, { rootMargin: '400px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [cursor, query])

  const newHere = items.filter((v) => v.is_new).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            className="chip"
            aria-pressed={days === d}
            onClick={() => switchTo(() => setDays(d), days !== d)}
          >
            {d === 1 ? 'Сутки' : `${d} дней`}
          </button>
        ))}
        <button
          className="chip"
          aria-pressed={onlyNew}
          onClick={() => switchTo(() => setOnlyNew((v) => !v), true)}
        >
          Только кто впервые
        </button>
        <span className="ml-auto text-sm text-[var(--muted)]">
          Загружено заходов: <b className="text-[var(--ink)]">{items.length}</b>
          {!onlyNew && <> · впервые среди них: <b className="text-[var(--ink)]">{newHere}</b></>}
        </span>
      </div>

      {error && <p className="text-[var(--alert)]">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="tbl min-w-[900px]">
          <thead>
            <tr>
              <th>Когда</th>
              <th>Адрес</th>
              <th>Посетитель</th>
              <th>Страница</th>
              <th>Откуда</th>
              <th>Место</th>
              <th>Устройство</th>
              <th>Заходов</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className={arrived.has(v.id) ? 'row-arrived' : undefined}>
                <td className="whitespace-nowrap">{formatDateTime(v.at)}</td>
                <td className="code whitespace-nowrap">{v.ip ?? '—'}</td>
                <td className="whitespace-nowrap">
                  <span className="code text-[var(--muted)]">{v.anon_id.slice(0, 8)}</span>
                  {v.is_new && <span className="mark-new ml-2">впервые</span>}
                </td>
                <td className="text-[var(--muted)]">{v.path}</td>
                <td className="text-[var(--muted)]">{source(v)}</td>
                <td>
                  {/* Место по адресу: город — это город узла провайдера, и
                      обещать точнее нечестно. Пусто — значит база не знала. */}
                  {v.city ?? v.region ?? (v.country ? '' : '—')}
                  {(v.city || v.region) && v.country && ', '}
                  <span className="text-[var(--muted)]">{v.country ?? ''}</span>
                  {v.city && v.region && v.region !== v.city && (
                    <div className="text-xs text-[var(--muted)]">{v.region}</div>
                  )}
                </td>
                <td className="text-[var(--muted)]">{DEVICE[v.device] ?? v.device}</td>
                <td className="whitespace-nowrap text-[var(--muted)]">
                  {v.visits_total}
                  {!v.is_new && v.first_at && (
                    <span className="ml-1 text-xs">с {formatDateTime(v.first_at)}</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-[var(--muted)]">
                  {onlyNew
                    ? 'За период никто не заходил впервые.'
                    : 'За период на лендинг никто не заходил.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div ref={sentinel} className="h-6 text-center text-sm text-[var(--muted)]">
        {loading && 'Загружаем…'}
        {!loading && cursor !== null && 'Подгружаем ещё…'}
        {!loading && cursor === null && items.length > 0 && 'Это все заходы за период'}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Перезагрузка страницы в пределах получаса новым заходом не считается. Адрес виден
        только здесь; у заходов, случившихся до того, как адреса начали собирать, стоит прочерк.
        Место считается по адресу офлайн-базой DB-IP: страна почти всегда верна, город — это
        город узла провайдера и может оказаться соседним. Улицы и района по адресу не бывает.
      </p>
    </div>
  )
}
