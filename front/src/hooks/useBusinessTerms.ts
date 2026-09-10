import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '../api/settings/settings.api';
import type { BookingMode, BusinessMessage, TerminologyProfile } from '../api/booking/hybrid.types';
import { getActiveContextKey } from '../utils/auth';

function subscribe(callback: () => void) {
  window.addEventListener('auth-context-changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('auth-context-changed', callback);
    window.removeEventListener('storage', callback);
  };
}

export function useBusinessTerms(mode: BookingMode = 'resource', override?: TerminologyProfile | null) {
  const context = useSyncExternalStore(subscribe, getActiveContextKey);
  const { i18n } = useTranslation();
  const query = useQuery({
    queryKey: ['businessTerms', context, i18n.language],
    queryFn: () => settingsApi.getGeneral(i18n.language),
    enabled: Boolean(context), staleTime: 60_000, refetchInterval: 60_000,
  });
  const config = query.data?.terminology;
  const profile = config?.profiles[override ?? config.profile];
  const staff = profile?.staff;
  const offering = profile?.offering[mode];
  return {
    ready: Boolean(profile), staff, offering, capabilities: query.data?.booking_capabilities,
    message: (key: BusinessMessage): string => profile ? String(i18n.t(`business:${key}`, {
      lng: config!.locale, defaultValue: profile.messages[key], staff, offering,
    })) : '…',
  };
}
