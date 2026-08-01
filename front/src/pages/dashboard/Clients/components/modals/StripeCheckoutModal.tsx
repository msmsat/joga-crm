import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { checkoutApi } from '../../../../../api/checkout';
import type { CheckoutCalculateResult, CheckoutSessionResult } from '../../../../../api/checkout';
import { Button, ModalShell, ModalHeader, ModalBody } from '../../../../../components/ui/index';

type Status = 'form' | 'confirming' | 'failed';

function SummaryRow({ label, value, muted, total }: {
  label: string; value: string; muted?: boolean; total?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
      <span style={{
        fontSize: total ? '13px' : '12px',
        fontWeight: total ? 800 : 600,
        color: total ? 'var(--onyx)' : 'var(--muted)',
      }}>{label}</span>
      <span style={{
        fontSize: total ? '17px' : '12px',
        fontWeight: total ? 900 : 700,
        letterSpacing: total ? '-0.4px' : 0,
        color: muted ? '#5BAB72' : total ? 'var(--onyx)' : 'var(--muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

/**
 * Оплата картой не уводя кассира из Velora: форма Stripe живёт внутри модалки.
 *
 * Оформление вокруг формы — наше, сама форма рисуется Stripe и берёт брендинг
 * ПОДКЛЮЧЁННОГО аккаунта (клиент платит студии, её лицо и должен видеть).
 *
 * `redirect_on_completion=never` на бэке означает, что редиректа не будет вовсе:
 * об успехе узнаём из onComplete и идём подтверждать оплату на сервер. Слову
 * Stripe.js о том, что «оплачено», не верим — источник истины только бэк.
 */
export function StripeCheckoutModal({ session, title, subtitle, quote, currency, onClose, onPaid }: {
  session: CheckoutSessionResult;
  title: string;
  subtitle: string;
  quote: CheckoutCalculateResult | undefined;
  currency: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation('clients');
  const [status, setStatus] = useState<Status>('form');

  // Stripe.js обязан подняться с тем же подключённым аккаунтом, на котором
  // создана сессия, иначе он её просто не найдёт.
  const stripePromise = useMemo(
    () => loadStripe(session.publishable_key, { stripeAccount: session.account_id }),
    [session.publishable_key, session.account_id],
  );

  const handleComplete = useCallback(async () => {
    setStatus('confirming');
    try {
      const { paid } = await checkoutApi.confirm(session.session_id);
      if (paid) {
        onPaid();
        return;
      }
      setStatus('failed');
    } catch {
      // Деньги могли уже уйти — вебхук проведёт оплату сам, поэтому здесь
      // только сообщаем, а не пытаемся откатывать.
      setStatus('failed');
    }
  }, [session.session_id, onPaid]);

  const options = useMemo(
    () => ({ clientSecret: session.client_secret, onComplete: handleComplete }),
    [session.client_secret, handleComplete],
  );

  return (
    <ModalShell onClose={onClose} maxWidth="560px" dismissible={status !== 'confirming'}>
      <ModalHeader title={title} subtitle={subtitle} />
      <ModalBody>
        {status === 'form' && (
          <>
            {/* Состав заказа — наша зона ответственности: Stripe показывает только
                итоговую сумму, а кассиру важно видеть, из чего она сложилась. */}
            {quote && (
              <div style={{
                padding: '16px 18px', borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(252,174,145,0.10), rgba(249,160,139,0.05))',
                border: '1px solid rgba(249,160,139,0.22)',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <SummaryRow label={t('panel.wallet.base')} value={`${currency}${quote.base_price}`} />
                {!!quote.discount && (
                  <SummaryRow label={t('panel.wallet.discount')} value={`−${currency}${quote.discount}`} muted />
                )}
                {!!quote.certificate_applied && (
                  <SummaryRow label={t('panel.wallet.certApplied')} value={`−${currency}${quote.certificate_applied}`} muted />
                )}
                {!!quote.deposit_applied && (
                  <SummaryRow label={t('panel.wallet.depositApplied')} value={`−${currency}${quote.deposit_applied}`} muted />
                )}
                {!!quote.bonuses_applied && (
                  <SummaryRow label={t('panel.wallet.bonuses')} value={`−${currency}${quote.bonuses_applied}`} muted />
                )}
                <div style={{ height: '1px', background: 'rgba(249,160,139,0.25)', margin: '2px 0' }} />
                <SummaryRow label={t('panel.wallet.total')} value={`${currency}${quote.total_price}`} total />
              </div>
            )}

            <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </>
        )}

        {status === 'confirming' && (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>
            {t('panel.wallet.payConfirming')}
          </div>
        )}

        {status === 'failed' && (
          <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
              {t('panel.wallet.payNotCompleted')}
            </div>
            <Button variant="ghost" onClick={onClose}>{t('panel.wallet.close')}</Button>
          </div>
        )}
      </ModalBody>
    </ModalShell>
  );
}
