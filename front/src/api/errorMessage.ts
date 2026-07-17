import type { TFunction } from 'i18next'
import { ApiError } from './client'

// Человекочитаемое сообщение об ошибке: осмысленный detail с бэкенда — как есть;
// иначе перевод по статусу (common:errors.<код>), для не-ApiError — сеть/unknown.
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
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
