import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../../../../api/settings/settings.api';
import { queryKeys } from '../../../../api/queryKeys';
import type { GeneralUpdate } from '../../../../api/settings/settings.types';

// Реквизиты фактуры живут в профиле студии (Studio.country/postal_code/vat_id/company_id),
// поэтому читаются и пишутся существующим эндпоинтом настроек — своего у биллинга нет.
// Ключ кэша общий с useGeneralSettings(): заполнили реквизиты перед оплатой — вкладка
// «Общие» в Настройках увидит их без перезахода.
//
// /settings НЕ за пейволлом (main.py) — значит форма работает и у студии с истёкшей
// подпиской, то есть именно у той, которая пришла платить.
export interface InvoiceDetails {
  company_id: string   // IČO — регистрационный номер, печатается на фактуре
  vat_id: string       // DIČ — только у плательщика НДС, включает reverse charge
  country: string      // ISO-3166-1 alpha-2; без него Stripe Tax не посчитает ставку
  postal_code: string
}

export type InvoiceDetailErrors = Partial<Record<keyof InvoiceDetails, string>>;

/** Реквизиты фактуры: IČO обязателен, DIČ — только у плательщика НДС.
 *  wantInvoice выключен → IČO/DIČ не спрашиваем и не сохраняем.
 *  Живёт рядом с хуком, а не с формой: файл с компонентом не должен экспортировать
 *  ничего кроме компонента (react-refresh). */
export function validateInvoiceDetails(
  value: InvoiceDetails,
  opts: { wantInvoice: boolean; requireCountry: boolean },
  t: (key: string) => string,
): InvoiceDetailErrors {
  const errors: InvoiceDetailErrors = {};
  if (opts.wantInvoice && !value.company_id.trim()) {
    errors.company_id = t('payModal.invoice.icoRequired');
  }
  // Ровно две буквы — то же правило, что у бэкенда (schemas/settings/general.py):
  // ловим до запроса, чтобы владелец увидел ошибку под полем, а не тост с 422.
  const country = value.country.trim();
  if ((opts.requireCountry || country) && !/^[A-Za-z]{2}$/.test(country)) {
    errors.country = t('payModal.invoice.countryInvalid');
  }
  // Индекс обязателен там же, где страна (ветка IBAN): он печатается в адресе
  // плательщика на фактуре, и счёт с половиной адреса бухгалтерия не примет.
  if (opts.requireCountry && !value.postal_code.trim()) {
    errors.postal_code = t('payModal.invoice.postalRequired');
  }
  return errors;
}

export function useInvoiceDetails() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: () => settingsApi.getGeneral(),
    staleTime: 5 * 60_000,
  });

  // Что реально лежит на сервере — по нему решаем, спрашивать ли реквизиты вообще.
  const saved: InvoiceDetails = useMemo(() => ({
    company_id: data?.company_id ?? '',
    vat_id: data?.vat_id ?? '',
    country: data?.country ?? '',
    postal_code: data?.postal_code ?? '',
  }), [data]);

  // Черновик отдельно от saved: без него рефетч по фокусу окна затирал бы набранное
  // на середине ввода. null — пользователь ещё ничего не менял.
  const [draft, setDraft] = useState<InvoiceDetails | null>(null);
  const value = draft ?? saved;

  const patch = (p: Partial<InvoiceDetails>) => setDraft({ ...value, ...p });

  // Пишем ТОЛЬКО изменённые поля: PATCH с пустой страной вернул бы 422 (min_length=2),
  // а незаполненное поле должно уезжать как null («реквизита нет»), не как "".
  const save = async (): Promise<void> => {
    const body: GeneralUpdate = {};
    if (value.company_id.trim() !== saved.company_id) body.company_id = value.company_id.trim() || null;
    if (value.vat_id.trim() !== saved.vat_id) body.vat_id = value.vat_id.trim() || null;
    if (value.postal_code.trim() !== saved.postal_code) body.postal_code = value.postal_code.trim() || null;
    const country = value.country.trim().toUpperCase();
    if (country !== saved.country) body.country = country || null;

    if (Object.keys(body).length === 0) return;
    const fresh = await settingsApi.updateGeneral(body);
    qc.setQueryData(queryKeys.studioSettings, fresh);
    setDraft(null);
  };

  return { value, saved, patch, save, loaded: data !== undefined, dirty: draft !== null };
}
