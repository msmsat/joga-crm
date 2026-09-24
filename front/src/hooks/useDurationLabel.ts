import { useTranslation } from 'react-i18next'

/**
 * Как записать длительность услуги: одним числом или «от–до».
 *
 * Близнец `usePriceLabel`: у разных мастеров время на одну услугу своё, и пока
 * мастер не выбран, у услуги есть только диапазон. Решение «диапазон или
 * число» принимает СЕРВЕР (back/services/service_pricing.duration_ranges) —
 * здесь остаётся только запись: «45 мин» или «45–60 мин».
 */
export function useDurationLabel(): (min: number, max?: number) => string {
  const { t } = useTranslation('common')
  return (min, max) => {
    const unit = t('units.min')
    return max !== undefined && max > min ? `${min}–${max} ${unit}` : `${min} ${unit}`
  }
}
