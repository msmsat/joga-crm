import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import { buildAvailability, selectAvailability } from './availabilityModel';

export function useWizardAvailability(o: Omit<Parameters<typeof buildAvailability>[0], 'rows' | 'resourceReady'> & {
  date: string; time: string; serviceId: number | null; teacherId: number | null; step: number;
}) {
  const hasResource = o.services.some(s => s.booking_mode === 'resource');
  const day = useQuery({ queryKey: ['resource-services-day', o.date],
    queryFn: () => hybridApi.servicesDay(o.date), enabled: hasResource && !!o.date });
  const { services, trainers, lessons, lessonsReady, notBefore } = o;
  const matrix = useMemo(() => buildAvailability({ services, trainers, lessons, lessonsReady, notBefore,
    rows: day.data?.services ?? [], resourceReady: !hasResource || (!!day.data && !day.isFetching && !day.isError),
  }), [services, trainers, lessons, lessonsReady, notBefore, day.data, day.isFetching, day.isError, hasResource]);
  return { ...selectAvailability(matrix, o), error: day.isError };
}
