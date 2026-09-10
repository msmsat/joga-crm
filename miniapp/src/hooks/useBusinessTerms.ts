import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { BusinessTermsContext } from './businessTermsContext';
import type { BookingMode, BusinessMessage, TerminologyProfile } from '../api/hybrid.types';

export function useBusinessTerms(mode: BookingMode = 'resource', override?: TerminologyProfile | null) {
  const config = useContext(BusinessTermsContext);
  const { i18n } = useTranslation();
  const profile = config?.profiles[override ?? config.profile];
  const staff = profile?.staff;
  const offering = profile?.offering[mode];
  return {
    ready: Boolean(profile), staff, offering,
    message: (key: BusinessMessage): string => profile ? String(i18n.t(`business:${key}`, {
      lng: config!.locale, defaultValue: profile.messages[key], staff, offering,
    })) : '…',
  };
}
