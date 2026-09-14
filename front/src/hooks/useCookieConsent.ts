import { useSyncExternalStore } from 'react';
import {
  getConsent, isCookieSettingsOpen, subscribeConsent,
  type ConsentCategory, type ConsentRecord,
} from '../utils/cookieConsent';

/** Текущее решение о cookie; null — человек ещё не выбирал или выбор истёк. */
export function useCookieConsent(): ConsentRecord | null {
  return useSyncExternalStore(subscribeConsent, getConsent);
}

/** Дано ли согласие на категорию. До выбора — всегда false. */
export function useConsentGranted(category: ConsentCategory): boolean {
  return useSyncExternalStore(subscribeConsent, () => getConsent()?.choices[category] === true);
}

/** Открыто ли окно «Настройки cookie» (открывают подвалы и профиль). */
export function useCookieSettingsOpen(): boolean {
  return useSyncExternalStore(subscribeConsent, isCookieSettingsOpen);
}
