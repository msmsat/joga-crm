import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { servicesApi } from '../../../../api/studio/services.api';
import { queryKeys } from '../../../../api/queryKeys';
import { getUserRoleFromToken } from '../../../../utils/auth';
import type { SelectOption } from '../../../../components/ui/index';

export const CREATE_SERVICE_OPTION = '__create_service__';

// Список услуг студии → готовые опции для Select обеих форм Журнала (создание/
// редактирование занятия). Кэш общий с Каталогом (queryKeys.services) — услуга,
// созданная там, появляется в списке сама, без доп. кода здесь.
export function useServiceOptions() {
  const { t } = useTranslation('journal');
  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => servicesApi.list(),
  });

  // Каталог, куда ведёт «+ Создать услугу», доступен только владельцу (OwnerRoute) —
  // администратору пункт не показываем, иначе переход упрётся в редирект.
  const canCreateService = getUserRoleFromToken() === 'owner';

  const options: SelectOption[] = useMemo(() => {
    const serviceOptions = services.map(s => ({ value: String(s.id), label: s.name }));
    if (!canCreateService) return serviceOptions;
    return [...serviceOptions, { value: CREATE_SERVICE_OPTION, label: t('createService') }];
  }, [services, canCreateService, t]);

  return { services, options };
}
