import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BillingPlan } from '../../types';
import { billingApi } from '../../../../../api/billing/billing.api';
import { errorMessage } from '../../../../../api/errorMessage';
import { queryKeys } from '../../../../../api/queryKeys';
import { formatMoney } from '../../../../../lib/money';
import { Button, useToast } from '../../../../../components/ui/index';

// Суммы с сервера — в младших единицах (центы/галержи), как их считает Stripe.
// Форматирует общий хелпер проекта, а не свой toLocaleString с зашитой ru-RU:
// интерфейс мультиязычный, и разделители обязаны следовать валюте.
const fmt = (minor: number, currency: string) => formatMoney(minor / 100, currency);

interface Props {
  /** Тарифная модель студии. Именно она решает, показывать ли раздел: у виджета
   *  свой кэш react-query, и полагаться на него значило бы ждать его протухания
   *  после включения процента. */
  plan: BillingPlan | null;
}

/**
 * Комиссия с офлайн-продаж: сколько накопилось, сколько выставлено и сколько
 * реально предстоит заплатить.
 *
 * Показывается тарифам с процентом («процент» и «комбо») — и остаётся видимым,
 * пока по ним висят деньги, даже если студия уже ушла на чистую подписку:
 * невидимый долг блокирует доступ, а найти его негде.
 *
 * Три состояния по возрастанию тревожности: копится → выставлен счёт со сроком →
 * срок прошёл, доступ заблокирован. Цвет и текст меняются, кнопка оплаты есть
 * всегда: заплатить можно в любой момент, в том числе досрочно.
 */
export default function OfflineFeeCard({ plan }: Props) {
  const { t } = useTranslation('billing');
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.billingOfflineFees,
    queryFn: () => billingApi.getOfflineFees(),
  });

  const payMut = useMutation({
    mutationFn: () => billingApi.payOfflineFees(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.billingOfflineFees });
      // Счёт оплачивается на стороне Stripe: карту мы не храним, поэтому
      // открываем hosted-страницу, а не списываем сами.
      if (res.hosted_invoice_url) window.open(res.hosted_invoice_url, '_blank', 'noopener');
      // Ссылки нет — счёт НЕ выставлен: накопленного меньше минимальной суммы
      // счёта (offline_fee_billing.MIN_INVOICE_AMOUNT) либо он ещё готовится.
      // Прежний текст «Задолженности нет» тут врал: начисления на экране есть.
      else toast.info(t('offlineFee.notBilledYet'));
    },
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  if (!data) return null;

  // Модель с процентом включена — раздел нужен сразу, даже с нулём начислений:
  // владелец обязан видеть, по какой ставке пойдёт счёт и когда. Комбо попадает
  // сюда по факту оплаты (webhook._apply_paid_mode) — до неё оно не работает.
  const active = plan?.billing_mode === 'percent' || plan?.billing_mode === 'combo';
  const billed = data.outstanding > 0;
  if (!active && !billed && data.accrued <= 0 && !data.suspended) return null;

  const overdue = data.suspended;
  const accent = overdue ? 'var(--dusty-rose, #D88C9A)' : billed ? 'var(--peach)' : 'var(--text3)';

  // Крупная цифра — то, что нужно закрыть ПРЯМО СЕЙЧАС: выставленный счёт, если он
  // есть, иначе накопленное. Валюты у них разные: начисления идут в деньгах студии,
  // счёт — в валюте биллинга (Customer у Stripe заведён на неё).
  const main = billed ? fmt(data.outstanding, data.currency) : fmt(data.accrued, data.accrued_currency);
  // Начисления текущего месяца при уже выставленном счёте раньше просто исчезали с
  // экрана — сумма к оплате выглядела меньше, чем есть на самом деле.
  const alsoAccruing = billed && data.accrued > 0
    ? t('offlineFee.alsoAccruing', { amount: fmt(data.accrued, data.accrued_currency) })
    : '';

  const note = overdue
    ? t(data.suspended_reason === 'min_fee' ? 'offlineFee.suspendedMin' : 'offlineFee.suspended')
    : billed
      ? t('offlineFee.due', { days: data.days_left ?? 0 })
      // Ставки нет — модель уже выключена, а начисления по ней остались: обещать
      // «копится по ставке 0%» неправда, здесь просто ждёт счёта.
      : data.rate
        ? t('offlineFee.accruing', { rate: data.rate, days: data.grace_days })
        : t('offlineFee.pendingBill');

  return (
    <div
      className="bl-banner"
      style={{
        margin: '0 32px 20px', padding: '20px 24px', borderRadius: '16px',
        background: 'var(--card)', border: `1px solid ${overdue ? accent : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px', flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: accent }}>
          {t('offlineFee.title')}
        </div>

        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--onyx)', marginTop: '6px' }}>
          {main}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
          {note}{alsoAccruing && ` ${alsoAccruing}`}
        </div>

        {/* Минимальный месячный платёж — второе денежное обязательство процентного
            тарифа, и без него «сколько заплатить» отвечается неверно: месяц без
            продаж стоит эту сумму, а не ноль. Сервер отдаёт его только тем, к кому
            он применяется (комбо добирает фикс подпиской). */}
        {data.min_monthly != null && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
            {t('offlineFee.minimum', { amount: fmt(data.min_monthly, data.currency) })}
          </div>
        )}
      </div>

      <Button
        variant={overdue ? 'danger' : 'primary'}
        loading={payMut.isPending}
        // Ничего не начислено и не выставлено — платить нечего.
        disabled={!billed && data.accrued <= 0}
        onClick={() => {
          // Счёт уже выставлен — ведём прямо на него, второй не плодим.
          if (billed && data.hosted_invoice_url) window.open(data.hosted_invoice_url, '_blank', 'noopener');
          else payMut.mutate();
        }}
      >
        {t('offlineFee.pay')}
      </Button>
    </div>
  );
}
