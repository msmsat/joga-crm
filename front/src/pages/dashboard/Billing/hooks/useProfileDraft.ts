import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { BillingProfile, BillingProfileInput } from '../../../../api/billing/billing.types';
import { ApiError } from '../../../../api/client';
import { errorMessage } from '../../../../api/errorMessage';

// Все двухбуквенные комбинации. Своего списка стран в проекте нет и не нужно:
// `Intl.DisplayNames` с `fallback: 'none'` возвращает undefined для кода, которого
// не существует, поэтому полный перечень — это перебор AA…ZZ с фильтром по ответу.
// Он и всегда актуален: данные берёт CLDR браузера, а не наша копия, которая
// устаревала бы молча. Ровно 250 строк на выходе — 249 стран ISO 3166-1 плюс XK.
const ALL_CODES = Array.from({ length: 26 * 26 }, (_, i) =>
  String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)));

// Коды, которые CLDR знает, а ISO 3166-1 сегодня не назначает. Отдать их Stripe
// нельзя — он ждёт живой код страны и отобьёт платёж, — а «Советский Союз» в
// списке стран рядом с адресом фактуры выглядит просто сломанным продуктом.
// Список не растёт: снятые коды не возвращаются, а новые страны приходят из CLDR.
const NOT_A_COUNTRY = new Set([
  // Не страны вовсе: организации, зона евро, служебные и псевдо-локали.
  'EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB',
  // Зарезервированы «в порядке исключения» — территории без своего кода ISO.
  'AC', 'DG', 'EA', 'IC', 'TA',
  // Исторические и отозванные. 'UK' сюда же: страна живая, но её код — GB,
  // и без этой строки Британия стояла бы в списке дважды.
  'AN', 'BU', 'CP', 'CQ', 'CS', 'DD', 'DY', 'FX', 'HV', 'NH',
  'RH', 'SU', 'TP', 'UK', 'VD', 'YD', 'YU', 'ZR',
]);

/** Полный список стран на языке интерфейса, отсортированный по названию. */
export function useCountryOptions() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    // fallback: 'none' — именно он и делает перебор фильтром: с дефолтным
    // 'code' несуществующий 'QX' вернул бы сам себя, и в списке оказались бы
    // все 676 комбинаций.
    const names = new Intl.DisplayNames([i18n.language], { type: 'region', fallback: 'none' });
    return ALL_CODES
      .filter(code => !NOT_A_COUNTRY.has(code))
      .map(code => ({ value: code, label: names.of(code) ?? '' }))
      .filter(option => option.label !== '')
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

// Страны, у которых спрашивается номер НДС, — 27 членов ЕС. Источник истины —
// back/services/vies.EU_VAT_COUNTRIES; здесь копия ради одного правила формы
// (показывать поле или нет), и она дешевле, чем ещё один запрос к серверу за
// списком, который меняется раз в десятилетие.
//
// Снаружи ЕС поле не показывается вовсе: сверить номер нечем (VIES знает только
// ЕС), а на налог он не влияет — продажа за пределы ЕС вне области европейского
// НДС, там решает страна покупателя. Спросить и не проверить значило бы завести
// непроверяемую строку, которая потом печатается на фискальном документе.
const EU_VAT_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK',
]);

/** Префикс номера НДС страны: везде код страны, кроме Греции — у неё EL. */
export const vatPrefix = (country: string) => (country === 'GR' ? 'EL' : country);

/** Спрашивается ли у этой страны номер НДС. */
export const isEuVatCountry = (country: string | null | undefined) =>
  !!country && EU_VAT_COUNTRIES.has(country);

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
  // Отказ VIES по номеру НДС. Живёт отдельно от `errors` и НЕ блокирует отправку:
  // «реестр не отвечает» лечится повторной попыткой тем же номером, и запирать её
  // значило бы заставить человека портить правильный номер, чтобы разблокировать
  // кнопку. Гасится при первой же правке поля — сообщение о старом номере поверх
  // нового читается как отказ по новому.
  const [vatError, setVatError] = useState('');

  const set = (field: keyof Draft) => (v: string) => {
    if (field === 'vat_id') setVatError('');
    setValues(prev => ({
      ...prev,
      [field]: v,
      // Смена страны на внеевропейскую убирает поле НДС — вместе с введённым в
      // него. Иначе номер уехал бы на сервер скрытым от глаз, а сервер всё равно
      // его отбросит: получилось бы «ввёл, не вижу, не сохранилось».
      ...(field === 'country' && !EU_VAT_COUNTRIES.has(v) ? { vat_id: '' } : {}),
    }));
  };

  /** Спрашиваем ли номер НДС при выбранной стране. */
  const vatAsked = EU_VAT_COUNTRIES.has(values.country);

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

  return { values, set, errors, showErrors, invalid, validate, payload, vatError, setVatError, vatAsked };
}

/** Текст отказа по номеру НДС, если сервер отказал именно из-за него.
 *
 *  Остальные ошибки сюда не попадают: их уже показал тост, и дублировать их
 *  подписью под случайным полем значило бы соврать, где именно проблема. */
export function vatErrorOf(err: unknown, t: TFunction): string {
  const code = err instanceof ApiError ? err.code : null;
  return code?.startsWith('billing.vat_') ? errorMessage(err, t) : '';
}

export type ProfileDraft = ReturnType<typeof useProfileDraft>;
