/** Деньги приходят в МЛАДШИХ единицах валюты, как их хранит Stripe. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

/** null означает «неизвестно» и показывается словом, а не выдуманной датой. */
export function formatDate(iso: string | null): string {
  if (!iso) return 'неизвестно'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'неизвестно'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
