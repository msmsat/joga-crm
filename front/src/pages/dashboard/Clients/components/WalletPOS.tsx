import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkoutApi } from '../../../../api/checkout';
import type { CheckoutProductType, CheckoutSessionResult } from '../../../../api/checkout';
import { StripeCheckoutModal } from './modals/StripeCheckoutModal';
import { financesApi } from '../../../../api/finances/finances.api';
import { errorMessage } from '../../../../api/errorMessage';
import { queryKeys } from '../../../../api/queryKeys';
import { Button, Card, Input, ConfirmModal, InfoHint, Select, Switch, useToast } from '../../../../components/ui/index';
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
  const [session, setSession] = useState<CheckoutSessionResult | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);

  // Кто оказывает услугу — от этого зависит её цена. Список нужен только
  // разовому визиту: у абонемента мастера нет вовсе.
  const { data: services = [] } = useQuery({
    queryKey: queryKeys.checkoutServices,
    queryFn: () => checkoutApi.getServices(),
    enabled: productType === 'single',
  });
  const service = productType === 'single'
    ? services.find(row => row.id === productId)
    : undefined;
  const masters = service?.masters ?? [];
  // Мастера спрашиваем ОБЯЗАТЕЛЬНО только там, где от него зависит сумма.
  // Услуга с одной ценой на всех однозначна и так, и лишний клик на каждую
  // продажу был бы платой ни за что. А вот пробить услугу «в среднем», когда
  // цены разные, нельзя: сервер возьмёт базовую, по которой не работает никто.
  const priceDependsOnMaster = !!service && service.price_max > service.price_min;
  const masterMissing = priceDependsOnMaster && teacherId === null;

  useEffect(() => {
    const timer = setTimeout(() => setPromoCode(promoInput.trim()), PROMO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [promoInput]);

  useEffect(() => {
    const timer = setTimeout(() => setCertCode(certInput.trim()), PROMO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [certInput]);

  const { data: quote, isFetching, error: quoteError } = useQuery({
    queryKey: ['checkout', 'calculate', clientId, productId, productType, teacherId, promoCode, useBonuses, useDeposit, certCode],
    queryFn: () => checkoutApi.calculate({
      client_id: clientId, product_id: productId, product_type: productType,
      teacher_id: teacherId, promo_code: promoCode || undefined, use_bonuses: useBonuses,
      use_deposit: useDeposit, certificate_code: certCode || undefined,
    }),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.finAccounts,
    queryFn: () => financesApi.getAccounts(),
  });
  // Счетов нет → account_id не шлём, бэк сам создаст «Основная касса» (V5-6, 2.1).
  const cashAccount = accounts.find(a => a.type === 'cash') ?? accounts[0];
  // Оплата картой на счёт кассы НЕ ложится: онлайн-деньги приходят выплатой от
  // Stripe, а наличные пересчитываются в кассе — на одном счёте не сходится ни
  // один из двух остатков. Счёт для карты выбирает бэк (resolve_account →
  // default_type="online"), поэтому здесь его просто не шлём.
  // Пока мастер не выбран, у услуги нет одной цены: сервер посчитал расчёт
  // предварительно по Каталогу, а по этой цене, возможно, не работает никто.
  // Показать её кассиру — назвать клиенту не ту сумму, поэтому разбивку и итог
  // до выбора мастера не рисуем вовсе.
  const priced = masterMissing ? undefined : quote;
  // Итог 0 — весь товар погашен депозитом/сертификатом/бонусами, метод оплаты не нужен (V5-7, 1.3).
  const totalCovered = priced?.total_price === 0;
  // Промокод введён, но не действует: бэк такую оплату отвергает (и наличные, и
  // карту) — не даём кассиру дойти до формы оплаты ради ошибки.
  const promoBlocks = !!promoCode && !!quote && !quote.promo_valid;
  // Карта с ненулевым остатком уходит в Stripe студии; наличные и полностью
  // покрытая сумма проводятся здесь же. Метод шлём тот, что выбрал кассир —
  // бэк всё равно пересчитывает цену и решает сам (Zero Trust).
  const viaStripe = method === 'card' && !totalCovered;

  const payload = {
    client_id: clientId, product_id: productId, product_type: productType,
    teacher_id: teacherId,
    account_id: viaStripe ? undefined : cashAccount?.id,
    promo_code: promoCode || undefined,
    use_bonuses: useBonuses, use_deposit: useDeposit, certificate_code: certCode || undefined,
  };

  // Оплата задевает счета, кошелёк, историю и списки — один и тот же набор
  // независимо от того, наличными провели или картой.
  const afterPaid = useCallback(() => {
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
  }, [qc, clientId, toast, t, onPaid]);

  // Форма Stripe открывается модалкой поверх кассы — кассир со страницы не уходит.
  const stripeMut = useMutation({
    mutationFn: () => checkoutApi.createSession({ ...payload, payment_method: 'card' }),
    onSuccess: setSession,
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  const payMut = useMutation({
    mutationFn: () => checkoutApi.pay({ ...payload, payment_method: 'cash' }),
    onSuccess: afterPaid,
    onError: (e: unknown) => toast.error(errorMessage(e, t)),
  });

  return (
    <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
      <div className={s.backRow}>
        <Button size="sm" variant="ghost" onClick={onBack}>{t('panel.wallet.back')}</Button>
        <div className={s.sectionLabel}>{t('panel.wallet.posTitle')}</div>
      </div>

      {masters.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div className={s.sectionLabel}>{t('panel.wallet.masterLabel')}</div>
          <Select
            value={teacherId != null ? String(teacherId) : ''}
            placeholder={t('panel.wallet.masterPlaceholder')}
            options={masters.map(m => ({
              value: String(m.user_id),
              label: m.name,
              // Цена рядом с именем: кассир выбирает не только исполнителя, но
              // и сумму, и узнать её после выбора — поздно.
              hint: `${currency}${m.price}`,
            }))}
            onChange={value => setTeacherId(value ? Number(value) : null)}
          />
        </div>
      )}

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
          {/* Баллы и их цена — в одной строке: кассир должен видеть, на сколько
              упадёт чек, а не только сколько у клиента баллов. На уровне с
              point_value=2 это разные числа. */}
          <span className={s.bonusLabel}>
            {t('panel.wallet.useBonuses', { count: quote.bonuses_available })}
            {' · '}
            {currency}{quote.bonuses_available * quote.point_value}
          </span>
          <Switch checked={useBonuses} onChange={setUseBonuses}/>
        </div>
      )}

      <Card padding={14} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <PriceRow label={t('panel.wallet.base')} value={priced ? `${currency}${priced.base_price}` : '—'}/>
        {!!priced?.discount && <PriceRow label={t('panel.wallet.discount')} value={`−${currency}${priced.discount}`} accent="discount"/>}
        {!!priced?.certificate_applied && <PriceRow label={t('panel.wallet.certApplied')} value={`−${currency}${priced.certificate_applied}`} accent="discount"/>}
        {!!priced?.deposit_applied && <PriceRow label={t('panel.wallet.depositApplied')} value={`−${currency}${priced.deposit_applied}`} accent="discount"/>}
        {!!priced?.bonuses_applied && (
          <PriceRow
            label={t('panel.wallet.bonusesSpent', { count: priced.bonuses_applied })}
            value={`−${currency}${priced.bonuses_value}`}
            accent="discount"
          />
        )}
        <div className={s.divider}/>
        <PriceRow label={t('panel.wallet.total')} value={priced ? `${currency}${priced.total_price}` : '—'} accent="total"/>
      </Card>

      <div className={s.methodRow}>
        <button type="button" className={method === 'cash' ? s.tabActive : s.tab} onClick={() => setMethod('cash')}>
          {t('panel.wallet.cash')}
        </button>
        <div className={s.methodSeg}>
          <button type="button" className={method === 'card' ? s.tabActive : s.tab} style={{ flex: 1 }} onClick={() => setMethod('card')}>
            {t('panel.wallet.card')}
          </button>
          <InfoHint title={t('panel.wallet.card')} text={t('panel.wallet.cardStripe')}/>
        </div>
      </div>

      <Button
        variant="primary" fullWidth
        style={{ marginTop: '16px' }}
        disabled={!quote || isFetching || promoBlocks || masterMissing}
        loading={payMut.isPending || stripeMut.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {totalCovered ? t('panel.wallet.confirmPayCovered') : viaStripe ? t('panel.wallet.payByCard') : t('panel.wallet.confirmPay')}
      </Button>

      {/* Серая кнопка без объяснения — худший вид отказа: кассир не понимает,
          чего от него хотят, и жмёт ещё раз. */}
      {masterMissing && (
        <div className={s.sectionLabel} style={{ marginTop: '8px', textAlign: 'center' }}>
          {t('panel.wallet.masterRequired')}
        </div>
      )}

      {confirmOpen && (
        <ConfirmModal
          title={t('panel.wallet.confirmTitle')}
          message={
            totalCovered ? t('panel.wallet.confirmMessageCovered')
              : viaStripe ? t('panel.wallet.confirmMessageCard', { amount: quote ? `${currency}${quote.total_price}` : '' })
                : t('panel.wallet.confirmMessage', { amount: quote ? `${currency}${quote.total_price}` : '' })
          }
          confirmText={totalCovered ? t('panel.wallet.confirmPayCovered') : viaStripe ? t('panel.wallet.payByCard') : t('panel.wallet.confirmPay')}
          onConfirm={async () => { await (viaStripe ? stripeMut : payMut).mutateAsync(); }}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      {session && (
        <StripeCheckoutModal
          session={session}
          title={t('panel.wallet.payByCard')}
          subtitle={t('panel.wallet.payToStudio')}
          quote={quote}
          currency={currency}
          onClose={() => setSession(null)}
          onPaid={() => { setSession(null); afterPaid(); }}
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
