import { useEffect, useRef, useState } from 'react';
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
  const [calc, setCalc] = useState<CheckoutCalc | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const requestId = useRef(0);

  const { promo_code, use_bonuses, use_deposit, certificate_code } = options;

  useEffect(() => {
    if (packageId === null) return;

    const id = ++requestId.current;

    const timer = setTimeout(() => {
      setIsCalculating(true);
      calculateCheckout(packageId, { promo_code, use_bonuses, use_deposit, certificate_code })
        .then((result) => {
          if (id !== requestId.current) return;
          setCalc(result);
        })
        .catch(() => {
          // Предпросмотр — не платёж: упавший расчёт не должен мешать открыть
          // оплату. Кнопка останется с ценой пакета, а итог всё равно посчитает
          // сервер при создании сессии.
          if (id === requestId.current) setCalc(null);
        })
        .finally(() => {
          if (id === requestId.current) setIsCalculating(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [packageId, promo_code, use_bonuses, use_deposit, certificate_code]);

  // Лист оплаты закрыт — расчёта нет. Выводим, а не храним: гасить состояние
  // из эффекта значит лишний каскад рендеров (react-hooks/set-state-in-effect).
  return { calc: packageId === null ? null : calc, isCalculating };
}
