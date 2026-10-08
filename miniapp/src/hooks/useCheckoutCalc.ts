import { useEffect, useState } from 'react';
import { calculateCheckout, type CheckoutCalc, type CheckoutOptions } from '../api/user';

/**
 * Живой разбор цены для формы оплаты: промокод, сертификат, депозит, баллы.
 *
 * Считает ТОЛЬКО сервер (POST /global/checkout/calculate) — тем же `_quote`,
 * что и касса CRM. Повторять арифметику на клиенте нельзя: два расчёта денег
 * неизбежно разъезжаются, и клиент увидит одну сумму, а спишется другая.
 *
 * Промокод и код сертификата набирают по букве, поэтому запрос уходит с
 * задержкой; ответы старше последнего запроса отбрасываются по номеру — иначе
 * подвисший ранний ответ перезатирает свежий (классическая гонка автодополнения).
 */
export function useCheckoutCalc(packageId: number | null, options: CheckoutOptions) {
  const { promo_code, use_bonuses, use_deposit, certificate_code } = options;
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([packageId, promo_code, use_bonuses, use_deposit, certificate_code, attempt]);
  const [result, setResult] = useState<{ key: string; calc: CheckoutCalc | null; error: boolean } | null>(null);

  useEffect(() => {
    if (packageId === null) return;

    let disposed = false;

    const timer = setTimeout(() => {
      calculateCheckout(packageId, { promo_code, use_bonuses, use_deposit, certificate_code })
        .then((result) => {
          if (!disposed) setResult({ key, calc: result, error: false });
        })
        .catch(() => {
          if (!disposed) setResult({ key, calc: null, error: true });
        });
    }, 300);

    return () => {
      disposed = true;
      clearTimeout(timer);
      setResult(null);
    };
  }, [packageId, promo_code, use_bonuses, use_deposit, certificate_code, key]);

  // Лист оплаты закрыт — расчёта нет. Выводим, а не храним: гасить состояние
  // из эффекта значит лишний каскад рендеров (react-hooks/set-state-in-effect).
  const current = packageId !== null && result?.key === key ? result : null;
  return {
    calc: current?.calc ?? null,
    isCalculating: packageId !== null && current === null,
    calcError: current?.error ?? false,
    retry: () => setAttempt(value => value + 1),
  };
}
