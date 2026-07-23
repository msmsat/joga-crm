import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkoutApi } from '../../../../api/checkout';
import type { CheckoutProductType } from '../../../../api/checkout';
import { financesApi } from '../../../../api/finances/finances.api';
import { errorMessage } from '../../../../api/errorMessage';
import { queryKeys } from '../../../../api/queryKeys';
import { Button, Card, Input, ConfirmModal, InfoHint, Switch, useToast } from '../../../../components/ui/index';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import s from './WalletTab.module.css';

const PROMO_DEBOUNCE_MS = 400;

// Касса — экран оплаты (CL-6.8). Цена всегда с бэка (checkout/calculate),
// фронт не считает скидки/бонусы сам (Zero Trust).
export function WalletPOS({ clientId, productId, productType, onBack, onPaid }: {
  clientId: number;
  productId: number;
  productType: CheckoutProductType;
  onBack: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation('clients');
  const toast = useToast();
  const qc = useQueryClient();
  const currency = getCurrencySymbol(useStudioCurrency());

  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [certInput, setCertInput] = useState('');
  const [certCode, setCertCode] = useState('');
  const [useBonuses, setUseBonuses] = useState(false);
  const [useDeposit, setUseDeposit] = useState(false);
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPromoCode(promoInput.trim()), PROMO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [promoInput]);

  useEffect(() => {
    const timer = setTimeout(() => setCertCode(certInput.trim()), PROMO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [certInput]);

  const { data: quote, isFetching, error: quoteError } = useQuery({
    queryKey: ['checkout', 'calculate', clientId, productId, productType, promoCode, useBonuses, useDeposit, certCode],
    queryFn: () => checkoutApi.calculate({
      client_id: clientId, product_id: productId, product_type: productType,
      promo_code: promoCode || undefined, use_bonuses: useBonuses,
      use_deposit: useDeposit, certificate_code: certCode || undefined,
    }),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.finAccounts,
    queryFn: () => financesApi.getAccounts(),
  });
  // Счетов нет → account_id не шлём, бэк сам создаст «Основная касса» (V5-6, 2.1).
  const cashAccount = accounts.find(a => a.type === 'cash') ?? accounts[0];
  // Итог 0 — весь товар погашен депозитом/сертификатом/бонусами, метод оплаты не нужен (V5-7, 1.3).
  const totalCovered = quote?.total_price === 0;

  const payMut = useMutation({
    mutationFn: () => checkoutApi.pay({
      client_id: clientId, product_id: productId, product_type: productType,
      account_id: cashAccount?.id, promo_code: promoCode || undefined,
      use_bonuses: useBonuses, use_deposit: useDeposit, certificate_code: certCode || undefined,
      payment_method: 'cash',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.finAccounts });
      qc.invalidateQueries({ queryKey: queryKeys.wallet(clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.client(clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.clientsAll });
      qc.invalidateQueries({ queryKey: queryKeys.loyaltyDepositStats });
      qc.invalidateQueries({ queryKey: queryKeys.loyaltyCertificates });
      qc.invalidateQueries({ queryKey: queryKeys.loyaltyCards });
      toast.success(t('panel.wallet.paySuccess'));
      onPaid();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  return (
    <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
      <div className={s.backRow}>
        <Button size="sm" variant="ghost" onClick={onBack}>{t('panel.wallet.back')}</Button>
        <div className={s.sectionLabel}>{t('panel.wallet.posTitle')}</div>
      </div>

      <Input label={t('panel.wallet.promoLabel')} value={promoInput} onChange={setPromoInput}
             placeholder={t('panel.wallet.promoPlaceholder')}
             error={quote && promoCode && !quote.promo_valid ? t('panel.wallet.promoInvalid') : undefined}/>

      <Input label={t('panel.wallet.certLabel')} value={certInput} onChange={setCertInput}
             placeholder={t('panel.wallet.certPlaceholder')}
             error={certCode && quoteError ? errorMessage(quoteError, t) : undefined}/>

      {quote && quote.deposit_available > 0 && (
        <div className={s.bonusRow}>
          <span className={s.bonusLabel}>{t('panel.wallet.useDeposit', { amount: `${currency}${quote.deposit_available}` })}</span>
          <Switch checked={useDeposit} onChange={setUseDeposit}/>
        </div>
      )}

      {quote && quote.bonuses_available > 0 && (
        <div className={s.bonusRow}>
          <span className={s.bonusLabel}>{t('panel.wallet.useBonuses', { count: quote.bonuses_available })}</span>
          <Switch checked={useBonuses} onChange={setUseBonuses}/>
        </div>
      )}

      <Card padding={14} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <PriceRow label={t('panel.wallet.base')} value={quote ? `${currency}${quote.base_price}` : '—'}/>
        {!!quote?.discount && <PriceRow label={t('panel.wallet.discount')} value={`−${currency}${quote.discount}`} accent="discount"/>}
        {!!quote?.certificate_applied && <PriceRow label={t('panel.wallet.certApplied')} value={`−${currency}${quote.certificate_applied}`} accent="discount"/>}
        {!!quote?.deposit_applied && <PriceRow label={t('panel.wallet.depositApplied')} value={`−${currency}${quote.deposit_applied}`} accent="discount"/>}
        {!!quote?.bonuses_applied && <PriceRow label={t('panel.wallet.bonuses')} value={`−${currency}${quote.bonuses_applied}`} accent="discount"/>}
        <div className={s.divider}/>
        <PriceRow label={t('panel.wallet.total')} value={quote ? `${currency}${quote.total_price}` : '—'} accent="total"/>
      </Card>

      <div className={s.methodRow}>
        <button type="button" className={method === 'cash' ? s.tabActive : s.tab} onClick={() => setMethod('cash')}>
          {t('panel.wallet.cash')}
        </button>
        <div className={s.methodSeg}>
          <button type="button" className={method === 'card' ? s.tabActive : s.tab} style={{ flex: 1 }} onClick={() => setMethod('card')}>
            {t('panel.wallet.card')}
          </button>
          <InfoHint title={t('panel.wallet.card')} text={t('panel.wallet.cardStub')}/>
        </div>
      </div>

      <Button
        variant="primary" fullWidth
        style={{ marginTop: '16px' }}
        disabled={(method === 'card' && !totalCovered) || !quote || isFetching}
        loading={payMut.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {totalCovered ? t('panel.wallet.confirmPayCovered') : t('panel.wallet.confirmPay')}
      </Button>

      {confirmOpen && (
        <ConfirmModal
          title={t('panel.wallet.confirmTitle')}
          message={totalCovered ? t('panel.wallet.confirmMessageCovered') : t('panel.wallet.confirmMessage', { amount: quote ? `${currency}${quote.total_price}` : '' })}
          confirmText={totalCovered ? t('panel.wallet.confirmPayCovered') : t('panel.wallet.confirmPay')}
          onConfirm={async () => { await payMut.mutateAsync(); }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function PriceRow({ label, value, accent }: { label: string; value: string; accent?: 'discount' | 'total' }) {
  const labelClass = accent === 'total' ? s.priceRowLabelTotal : s.priceRowLabel;
  const valueClass = accent === 'discount' ? s.priceRowValueDiscount : accent === 'total' ? s.priceRowValueTotal : s.priceRowValue;
  return (
    <div className={s.priceRow}>
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}
