import { useTranslation } from 'react-i18next'

import { useStudioCurrency } from './useStudioCurrency'
import { formatAmount, formatMoney } from '../lib/money'

/**
 * Как записать цену услуги: одной суммой или «от–до».
 *
 * Правило одно на весь кабинет — Каталог, касса, Журнал: пока мастер не
 * выбран, у услуги нет одной цены, у разных мастеров она своя. Решение
 * «диапазон или сумма» принимает СЕРВЕР (back/services/service_pricing.py) и
 * присылает уже посчитанные price_min/price_max; здесь остаётся только
 * запись. Сравнивать цены между собой на экранах не нужно — иначе один экран
 * сравнит, второй забудет, и продукт напишет «от 500 до 500».
 *
 * Валюта — студии, слово «от…до» — языка интерфейса.
 *
 * `compact` — для тесных мест (строка списка, крупная цифра карточки): знак
 * валюты один раз и тире вместо слов, «Kč 800–1 400». Полная фраза там
 * вытесняла соседнюю подпись многоточием — в списке Каталога вместе с ценой
 * пропадала длительность услуги.
 */
export function usePriceLabel(): (min: number, max: number, compact?: boolean) => string {
  const { t } = useTranslation('common')
  const currency = useStudioCurrency()
  return (min, max, compact) => {
    if (max <= min) return formatMoney(min, currency)
    return compact
      ? `${formatMoney(min, currency)}–${formatAmount(max, currency)}`
      : t('price.range', {
          from: formatMoney(min, currency),
          to: formatMoney(max, currency),
        })
  }
}
