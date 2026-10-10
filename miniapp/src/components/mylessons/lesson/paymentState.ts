import type { PastLessonResponse, UpcomingLessonResponse } from '../../../api/lessons';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

/**
 * Чем оплачено занятие — одним словом, из фактов брони.
 *
 *   paid_online  — оплачено картой и подтверждено Stripe;
 *   hold         — оплата картой начата и не закончена, место держится;
 *   venue        — «оплата на месте»: долг открыт;
 *   subscription — списано с абонемента;
 *   trial        — пробное занятие (подарок или уже оплаченное со скидкой —
 *                  бронь их не различает, поэтому и слово одно);
 *   free         — занятие бесплатное по прайсу;
 *   paid         — долга нет и не было онлайн-оплаты: оплачено у стойки.
 *
 * Порядок проверок — порядок доказательности: подтверждённая оплата сильнее
 * нулевого долга, а нулевой долг сам по себе не доказывает ничего.
 */
export type PaymentState = 'paid_online' | 'hold' | 'venue' | 'subscription' | 'trial' | 'free' | 'paid';

export function paymentState(lesson: MyLesson): PaymentState {
  if (lesson.paid_online) return 'paid_online';
  if (lesson.status === 'hold') return 'hold';
  if (lesson.debt > 0) return 'venue';
  if (lesson.by_subscription) return 'subscription';
  if (lesson.is_trial) return 'trial';
  if (!lesson.price) return 'free';
  return 'paid';
}

/** Клиент может открыть форму оплаты прямо сейчас — решил сервер. */
export const canPay = (lesson: MyLesson | null) => Boolean(lesson?.allowed_actions.includes('pay') && !lesson.payment_review);
