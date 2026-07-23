// value ↔ ключ перевода бэкенд-полей (BookingSettings). Подписи собираются
// через t() в компоненте — здесь только числа/коды и их i18n-ключи.

export const ADVANCE_OPTS = [
  { value: 60, key: 'advance.1h' },
  { value: 120, key: 'advance.2h' },
  { value: 240, key: 'advance.4h' },
  { value: 720, key: 'advance.12h' },
  { value: 1440, key: 'advance.24h' },
] as const

export const WINDOW_OPTS = [
  { value: 7, key: 'window.7d' },
  { value: 14, key: 'window.14d' },
  { value: 30, key: 'window.30d' },
  { value: 60, key: 'window.60d' },
] as const

export const CANCEL_OPTS = [
  { value: 120, key: 'cancel.2h' },
  { value: 240, key: 'cancel.4h' },
  { value: 720, key: 'cancel.12h' },
  { value: 1440, key: 'cancel.24h' },
] as const

export const LANG_OPTS = [
  { value: 'ru', key: 'lang.ru' },
  { value: 'en', key: 'lang.en' },
  { value: 'de', key: 'lang.de' },
] as const

export const STEP_OPTS = [
  { value: 15, key: 'step.15' },
  { value: 30, key: 'step.30' },
  { value: 45, key: 'step.45' },
  { value: 60, key: 'step.60' },
] as const

// 00:00–24:00, шаг 30. Значение = подпись (формат сервера совпадает с UI).
export const TIME_OPTS = Array.from({ length: 49 }, (_, i) => {
  const totalMin = i * 30
  const h = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const m = String(totalMin % 60).padStart(2, '0')
  return `${h}:${m}`
})

export const WIDGET_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#C96B9E', '#F4A261', '#2A9D8F']

// Ближайшее значение к числу с сервера (значение могло прийти не из списка).
const nearest = (nums: readonly number[], v: number) =>
  nums.reduce((best, n, i) => (Math.abs(n - v) < Math.abs(nums[best] - v) ? i : best), 0)

// Ближайшее валидное значение из списка (значение с сервера могло прийти не из списка) —
// для value селекта CustomSelect, который резолвит подпись сам по точному совпадению value.
export const advanceValue = (min: number) => ADVANCE_OPTS[nearest(ADVANCE_OPTS.map(o => o.value), min)].value
export const windowValue  = (days: number) => WINDOW_OPTS[nearest(WINDOW_OPTS.map(o => o.value), days)].value
export const cancelValue  = (min: number) => CANCEL_OPTS[nearest(CANCEL_OPTS.map(o => o.value), min)].value
export const stepValue    = (min: number) => STEP_OPTS[nearest(STEP_OPTS.map(o => o.value), min)].value
export const langValue    = (code: string) => LANG_OPTS.find(o => o.value === code)?.value ?? LANG_OPTS[0].value

export const colorIndex = (hex: string | null) => Math.max(0, WIDGET_COLORS.indexOf(hex ?? ''))
