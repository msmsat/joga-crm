import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { payBooking } from '../api/lessons';
import { notify } from '../lib/notify';
import { bumpLessons } from '../lib/revision';
import { awaitCheckout, rememberCheckout, syncCheckouts } from '../lib/paymentSync';
import { useTelegram } from './useTelegram';

/**
 * «Оплатить» своей брони из «Моих занятий» — из карточки списка и из листа.
 *
 * Ссылку выдаёт только сервер (`booking_payment.pay_link`): он же решает, есть
 * ли что платить. Здесь — что делать с его ответом. Форма Stripe открывается
 * снаружи: в Telegram — `openLink`, в браузере — переходом в той же вкладке
 * (Stripe вернёт на `?pay=…`, сверку там подхватит `usePaymentReconciliation`).
 * Возврат на success_url — повод сверить, а не доказательство оплаты:
 * поэтому перед уходом заявка запоминается (`rememberCheckout`).
 *
 * Один запрос за раз на всё приложение раздела: двойной тап по карточке и по
 * листу не должен открыть две формы.
 */
export function useLessonPay() {
  const { t } = useTranslation();
  const { tg, isInTelegram, vibrateMedium } = useTelegram();
  const busy = useRef(false);
  const [payingId, setPayingId] = useState<number | null>(null);

  const pay = async (reservationId: number) => {
    if (busy.current) return;
    busy.current = true;
    setPayingId(reservationId);
    vibrateMedium();
    try {
      const result = await payBooking(reservationId, isInTelegram);
      if (result.outcome === 'open' && result.url) {
        rememberCheckout({ reservation_id: reservationId, checkout_id: result.checkout_id ?? undefined });
        if (isInTelegram && tg?.openLink) tg.openLink(result.url);
        else window.location.assign(result.url);
        return;
      }
      if (result.outcome === 'pending') {
        // Оплата уже идёт (форму оплатили, подтверждение в пути) — вторую
        // не открываем, а спрашиваем Stripe о первой.
        awaitCheckout({ reservation_id: reservationId, checkout_id: result.checkout_id ?? undefined });
        notify(t('lessonSheet.pay.pending'));
        void syncCheckouts({ reservation_id: reservationId }).catch(() => undefined);
      } else if (result.outcome === 'review') {
        notify(t('lessonSheet.pay.review_hint'));
      } else {
        notify(t(result.outcome === 'stale' ? 'lessonSheet.pay.stale' : 'lessonSheet.pay.unavailable'));
      }
      // Платить, возможно, уже нечего — экран обязан показать, как есть.
      bumpLessons();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t('lessonSheet.pay.unavailable'));
    } finally {
      busy.current = false;
      setPayingId(null);
    }
  };

  return { pay, payingId };
}
