import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../api/billing/billing.api';
import { errorMessage } from '../api/errorMessage';
import { useToast } from '../components/ui/index';

/**
 * Включение пробного периода. Два места нажимают одну и ту же кнопку: окно с
 * акцией на входе в кабинет и плашка на «Тарифе и оплате» для тех, кто окно
 * закрыл, — правило «что происходит после активации» должно быть одно.
 *
 * После успеха уходим на дашборд ПЕРЕЗАГРУЗКОЙ, а не setState. План лежит
 * копией в трёх местах (пейволл в DashboardLayout, useBillingCalculator,
 * useBilling в Настройках), и каждое держит своё состояние: обновив одно,
 * получаем кабинет, где подписка уже есть, а пейволл ещё думает, что нет.
 * Активация случается один раз за жизнь студии — цена перезагрузки здесь
 * ниже, чем цена трёх рассинхронов.
 */
export function useActivateTrial() {
  const { t } = useTranslation('billing');
  const toast = useToast();

  return useMutation({
    mutationFn: () => billingApi.activateTrial(),
    onSuccess: () => { window.location.href = '/dashboard'; },
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });
}
