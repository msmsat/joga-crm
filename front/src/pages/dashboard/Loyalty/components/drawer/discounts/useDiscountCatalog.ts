import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { servicesApi } from '../../../../../../api/studio/services.api';
import { catalogApi } from '../../../../../../api/catalog/catalog.api';
import { queryKeys } from '../../../../../../api/queryKeys';
import type { DiscountCampaign } from '../../../../../../api/loyalty/loyalty.types';
import { useDiscountFormat } from './useDiscountFormat';

/** Услуги и абонементы студии — то, на что бывает скидка. Те же ключи кэша,
 *  что у Каталога: правка услуги там перечитывает и этот список. */
export function useDiscountCatalog() {
  const services = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
  const packages = useQuery({ queryKey: queryKeys.packages, queryFn: () => catalogApi.getSubscriptionPackages() });
  return {
    services: services.data ?? [],
    packages: packages.data ?? [],
    loading: services.isPending || packages.isPending,
  };
}

type Scope = Pick<DiscountCampaign, 'applies_to' | 'service_ids' | 'package_ids'>;
type Audience = Pick<DiscountCampaign, 'audience' | 'segments' | 'clients' | 'birthday_window_days'>;

/** «На что» и «кому» одной строкой — для карточки, превью и шкалы. Длинный
 *  перечень сворачивается в «первые два +N»: строка карточки одна. */
export function useDiscountSummary() {
  const { t } = useTranslation('loyalty');
  const { segment } = useDiscountFormat();
  const { services, packages } = useDiscountCatalog();
  const serviceName = new Map(services.map(s => [s.id, s.name]));
  const packageName = new Map(packages.map(p => [p.id, p.name]));

  const short = (names: string[]) => names.length <= 2
    ? names.join(', ')
    : t('discounts.summary.andMore', { names: names.slice(0, 2).join(', '), count: names.length - 2 });

  const scope = (d: Scope) => {
    if (d.applies_to === 'all') return t('discounts.summary.everything');
    const names = [
      ...d.service_ids.map(id => serviceName.get(id)),
      ...d.package_ids.map(id => packageName.get(id)),
    ].filter((n): n is string => !!n);
    return names.length ? short(names) : t('discounts.summary.nothingChosen');
  };

  const audience = (d: Audience) => {
    if (d.audience === 'all') return t('discounts.summary.everyone');
    if (d.audience === 'clients') {
      return d.clients.length ? short(d.clients.map(c => c.name)) : t('discounts.summary.nobodyChosen');
    }
    if (!d.segments.length) return t('discounts.summary.nobodyChosen');
    const birthday = d.birthday_window_days > 0
      ? t('discounts.summary.birthday', { count: d.birthday_window_days })
      : t('discounts.summary.birthdayExact');
    return short(d.segments.map(key => key === 'birthday' ? birthday : segment(key)));
  };

  return { scope, audience };
}
