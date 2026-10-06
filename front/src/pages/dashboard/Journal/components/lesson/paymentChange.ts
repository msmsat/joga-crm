import type { BookedClient } from '../../../../../api/schedule/schedule.types';

/** Способы оплаты у стойки: наличные и карта через терминал (`transfer`). */
const DESK_METHODS = new Set(['cash', 'transfer']);

/** Оплату брони можно «Поменять» у стойки: её приняла касса наличными или
 *  картой у терминала, а не онлайн (такую возвращают через Stripe) и не
 *  перенёс импорт. Ту же границу держит сервер
 *  (back/services/reservation_refund.refusal) — здесь она лишь решает, станет
 *  ли галочка «Оплачено» кнопкой. */
export const paymentChangeable = (c: BookedClient): boolean =>
  c.debt <= 0 && !!c.payment && DESK_METHODS.has(c.payment.method ?? '') && !c.payment.migration_basis;
