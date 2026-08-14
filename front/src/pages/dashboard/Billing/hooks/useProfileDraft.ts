import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingProfile, BillingProfileInput } from '../../../../api/billing/billing.types';

// Страны, из которых к нам приходят платить: ЕС целиком (там работает reverse
// charge) плюс ближайшие соседи. Названия НЕ храним — их даёт Intl.DisplayNames
// на языке интерфейса, иначе пришлось бы вести двуязычный словарь на 45 строк.
const COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'GB', 'CH', 'NO', 'IS', 'LI', 'UA', 'RS', 'TR', 'MD', 'GE', 'AM', 'KZ', 'BY', 'RU',
  'US', 'CA', 'AE', 'IL',
];

export function useCountryOptions() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const names = new Intl.DisplayNames([i18n.language], { type: 'region' });
    return COUNTRY_CODES
      .map(code => ({ value: code, label: names.of(code) ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language));
  }, [i18n.language]);
}

/** Название страны на языке интерфейса — для режима просмотра. */
export function useCountryName(code: string | null | undefined) {
  const { i18n } = useTranslation();
  return useMemo(() => {
    if (!code) return '';
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' }).of(code) ?? code;
    } catch {
      // Неизвестный код (легаси-значение из БД) — показываем как есть, а не пусто.
      return code;
    }
  }, [code, i18n.language]);
}

type Draft = Record<'country' | 'line1' | 'line2' | 'postal_code' | 'city' | 'vat_id', string>;

/**
 * Черновик формы реквизитов: значения, ошибки и «показывать ли их».
 *
 * Отдельным хуком, потому что форм две — модалка перед оплатой и режим правки во
 * вкладке «Способ оплаты», — а правила обязательности обязаны быть одни. Список
 * обязательных полей тут повторяет back/routers/billing/checkout._PROFILE_REQUIRED:
 * VAT и вторая строка адреса необязательны (у физлица номера НДС нет вовсе).
 */
export function useProfileDraft(initial: BillingProfile | null) {
  const { t } = useTranslation('billing');
  const [values, setValues] = useState<Draft>({
    country: initial?.country ?? '',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    postal_code: initial?.postal_code ?? '',
    city: initial?.city ?? '',
    vat_id: initial?.vat_id ?? '',
  });
  const [showErrors, setShowErrors] = useState(false);

  const set = (field: keyof Draft) => (v: string) =>
    setValues(prev => ({ ...prev, [field]: v }));

  const required = t('profile.errors.required');
  const errors: Partial<Record<keyof Draft, string>> = {
    country: values.country ? undefined : required,
    line1: values.line1.trim().length >= 2 ? undefined : required,
    postal_code: values.postal_code.trim().length >= 2 ? undefined : required,
    city: values.city.trim() ? undefined : required,
  };
  const invalid = Object.values(errors).some(Boolean);

  const payload = (): BillingProfileInput => ({
    country: values.country,
    line1: values.line1.trim(),
    line2: values.line2.trim() || null,
    postal_code: values.postal_code.trim(),
    city: values.city.trim(),
    vat_id: values.vat_id.trim() || null,
  });

  /** true — можно отправлять; иначе подсвечивает незаполненное. */
  const validate = () => {
    setShowErrors(true);
    return !invalid;
  };

  return { values, set, errors, showErrors, invalid, validate, payload };
}

export type ProfileDraft = ReturnType<typeof useProfileDraft>;
