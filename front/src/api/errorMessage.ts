import type { TFunction } from 'i18next'
import { ApiError } from './client'

// Человекочитаемое сообщение об ошибке: если бэкенд прислал машинный code
// ({code, message} вместо голой строки) — переводим по коду (CL-7.6), чтобы
// английский UI не показывал русский текст. Иначе — detail как есть (старый
// формат, обратная совместимость), иначе — перевод по статусу.
// Машинный код в голом detail: snake_case без пробелов и двоеточий (двоеточие
// i18next съел бы как разделитель неймспейса и вернул мусор вместо ключа).
const BARE_CODE_RE = /^[a-z0-9_]+$/

export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.code) {
      const key = `common:errors.${err.code}`
      const translated = t(key)
      if (translated !== key) return translated
    }
    // Часть роутеров шлёт код голой строкой detail (invalid_bot_token и т.п.) —
    // если перевод под него есть, показываем его, а не сырой код.
    if (err.message && BARE_CODE_RE.test(err.message)) {
      const key = `common:errors.${err.message}`
      const translated = t(key)
      if (translated !== key) return translated
    }
    // Бэкенд прислал внятный detail (не голый статус) — показываем его.
    if (err.message && err.message !== 'Неизвестная ошибка') return err.message
    const key = `common:errors.${err.status}`
    const translated = t(key)
    return translated === key ? t('common:errors.unknown') : translated
  }
  // fetch кидает TypeError при обрыве связи — это «нет сети», не unknown.
  if (err instanceof TypeError) return t('common:errors.network')
  return t('common:errors.unknown')
}
