import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../../../../../api/billing/billing.api';
import { errorMessage } from '../../../../../api/errorMessage';
import { queryKeys } from '../../../../../api/queryKeys';
import { Button, useToast } from '../../../../../components/ui/index';

const fmt = (minor: number, currency: string) =>
  `${(minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/**
 * Комиссия с офлайн-продаж: сколько накопилось и сколько уже выставлено.
 *
 * Показывается только тарифам с процентом — на фиксированной подписке платформа
 * с наличных ничего не берёт, и пустая карточка там только пугала бы.
 *
 * Три состояния по возрастанию тревожности: копится → выставлен счёт со сроком →
 * срок прошёл, доступ заблокирован. Цвет и текст меняются, кнопка оплаты есть
 * всегда: заплатить можно в любой момент, в том числе досрочно.
 */
export default function OfflineFeeCard() {
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
      else toast.success(t('offlineFee.nothingToPay'));
    },
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  // Тариф без процента — нечего показывать. Ждём загрузки, чтобы карточка не мигала.
  if (!data || (!data.rate && !data.accrued && !data.outstanding)) return null;

  const overdue = data.suspended;
  const billed = data.outstanding > 0;
  const accent = overdue ? 'var(--dusty-rose, #D88C9A)' : billed ? 'var(--peach)' : 'var(--text3)';

  return (
    <div
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
          {billed ? fmt(data.outstanding, data.currency) : fmt(data.accrued, data.accrued_currency)}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
          {overdue
            ? t('offlineFee.suspended')
            : billed
              ? t('offlineFee.due', { days: data.days_left ?? 0 })
              : t('offlineFee.accruing', { rate: data.rate ?? 0, days: data.grace_days })}
        </div>
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
