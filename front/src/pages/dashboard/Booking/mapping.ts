// UI-строки ↔ числовые поля бэкенда (BookingSettings). Один источник для
// пар «минуты/дни ↔ подпись» и палитры акцентного цвета виджета.

export const ADVANCE_OPTS = ['1 час', '2 часа', '4 часа', '12 часов', '24 часа'] as const
const ADVANCE_MIN = [60, 120, 240, 720, 1440]

export const WINDOW_OPTS = ['7 дней', '14 дней', '30 дней', '60 дней'] as const
const WINDOW_DAYS = [7, 14, 30, 60]

export const CANCEL_OPTS = ['2 часа', '4 часа', '12 часов', '24 часа'] as const
const CANCEL_MIN = [120, 240, 720, 1440]

export const LANG_OPTS = ['Русский', 'English', 'Deutsch'] as const
const LANG_CODES = ['ru', 'en', 'de']

export const WIDGET_COLORS = ['#FCAE91', '#5BAB72', '#4A80C4', '#C96B9E', '#F4A261', '#2A9D8F']

// Ближайшая подпись к числу с сервера (значение могло прийти не из списка) и обратно.
const nearest = (nums: number[], v: number) =>
  nums.reduce((best, n, i) => (Math.abs(n - v) < Math.abs(nums[best] - v) ? i : best), 0)

// indexOf на readonly-кортеже требует литерал; сужаем сам массив до string[].
const idx = (opts: readonly string[], v: string) => opts.indexOf(v)

export const advanceLabel = (min: number) => ADVANCE_OPTS[nearest(ADVANCE_MIN, min)]
export const advanceMin   = (label: string) => ADVANCE_MIN[idx(ADVANCE_OPTS, label)] ?? 120

export const windowLabel = (days: number) => WINDOW_OPTS[nearest(WINDOW_DAYS, days)]
export const windowDays  = (label: string) => WINDOW_DAYS[idx(WINDOW_OPTS, label)] ?? 7

export const cancelLabel = (min: number) => CANCEL_OPTS[nearest(CANCEL_MIN, min)]
export const cancelMin   = (label: string) => CANCEL_MIN[idx(CANCEL_OPTS, label)] ?? 240

export const langLabel = (code: string) => LANG_OPTS[Math.max(0, LANG_CODES.indexOf(code))]
export const langCode  = (label: string) => LANG_CODES[idx(LANG_OPTS, label)] ?? 'ru'

export const colorIndex = (hex: string | null) => Math.max(0, WIDGET_COLORS.indexOf(hex ?? ''))
