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
export function useServiceOptions(includeResource = false) {
  const { t } = useTranslation('journal');
  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => servicesApi.list(),
  });

  // Каталог, куда ведёт «+ Создать услугу», доступен только владельцу (OwnerRoute) —
  // администратору пункт не показываем, иначе переход упрётся в редирект.
  const canCreateService = getUserRoleFromToken() === 'owner';

  // Редактирование события оставляет только event-услуги. Создание также
  // предлагает resource: выбор переключает форму на запись клиента через
  // quote/confirm, без предварительного создания пустого занятия.
  const eventServices = useMemo(() => services.filter(s => s.booking_mode !== 'resource'), [services]);

  const options: SelectOption[] = useMemo(() => {
    const serviceOptions = (includeResource ? services : eventServices).map(s => ({ value: String(s.id), label: s.name }));
    if (!canCreateService) return serviceOptions;
    return [...serviceOptions, { value: CREATE_SERVICE_OPTION, label: t('createService') }];
  }, [services, eventServices, includeResource, canCreateService, t]);

  // Во что услуга обойдётся у ЭТОГО тренера. Тренера в Журнале задаёт колонка
  // сетки, поэтому диапазону «от–до» тут места нет — цена всегда одна и
  // конкретная. Мастера без своей цены услуга отдаёт по цене Каталога.
  const priceFor = useMemo(() => (serviceId: number | null, teacherId: number | null) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return null;
    const own = teacherId == null
      ? undefined
      : service.masters?.find(m => m.user_id === teacherId);
    return own ? own.price : service.price;
  }, [services]);

  // Сколько услуга длится у ЭТОГО тренера — по тому же правилу, что цена.
  const durationFor = useMemo(() => (serviceId: number | null, teacherId: number | null) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return null;
    const own = teacherId == null
      ? undefined
      : service.masters?.find(m => m.user_id === teacherId);
    return own?.duration_min ?? service.duration_min;
  }, [services]);

  return {
    services,
    options,
    priceFor,
    durationFor,
    // Студия только с индивидуальными услугами сразу открывает запись клиента.
    onlyResourceServices: eventServices.length === 0 && services.length > 0,
  };
}
