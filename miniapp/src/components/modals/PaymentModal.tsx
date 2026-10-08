import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import CheckoutBreakdown from './CheckoutBreakdown';
import CheckoutOptions from './CheckoutOptions';
import type { CheckoutCalc, CheckoutOptions as CheckoutOptionsValue } from '../../api/user';
import type { StudioInfo } from '../../api/studio';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  /** Цена пакета — показывается, пока не пришёл расчёт с сервера. */
  amountStr: string;
  /** Разбор цены с сервера; null — расчёт ещё идёт или не удался. */
  calc: CheckoutCalc | null;
  isCalculating: boolean;
  calcError?: boolean;
  onRetry?: () => void;
  studio?: Pick<StudioInfo, 'name' | 'logo_url'>;
  options: CheckoutOptionsValue;
  onOptionsChange: (patch: Partial<CheckoutOptionsValue>) => void;
  /** Создаёт сессию Stripe и открывает её (`tg.openLink`) — форму карты
   * рисует сама страница Stripe, не мы (PCI, как и в кассе CRM). */
  onPay: () => Promise<void>;
}

export default function PaymentModal({
  isOpen,
  onClose,
  itemName,
  amountStr,
  calc,
  isCalculating,
  calcError = false,
  onRetry,
  studio,
  options,
  onOptionsChange,
  onPay,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const processing = useRef(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handlePay = async () => {
    if (processing.current || !calc || isCalculating || calcError) return;
    processing.current = true;
    setIsProcessing(true);
    setPaymentError(null);
    try {
      await onPay();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : t('buyModal.activate_error'));
    } finally {
      processing.current = false;
      setIsProcessing(false);
    }
  };

  // Всё покрыто сертификатом/депозитом/баллами — Stripe не откроется, поэтому
  // и кнопка не должна обещать оплату картой.
  const fullyCovered = calc?.fully_covered ?? false;

  const actionLabel = isProcessing
    ? t('paymentModal.processing_transaction')
    : fullyCovered
      ? t('paymentModal.confirm_free')
      : t('paymentModal.pay_card');

  return (
    <Sheet
      isOpen={isOpen}
      onClose={isProcessing ? () => undefined : onClose}
      layer={1}
      kicker={t('paymentModal.tag')}
      title={t('paymentModal.title')}
      footer={
        <SheetAction onClick={handlePay} disabled={isProcessing || isCalculating || !calc || calcError}>
          {isCalculating ? t('paymentModal.calculating') : actionLabel}
        </SheetAction>
      }
    >
      {studio && (
        <div className="mb-5 flex items-center gap-3">
          {studio.logo_url && <img src={studio.logo_url} alt="" className="h-11 w-11 rounded-[14px] object-contain ring-1 ring-border" />}
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold text-foreground [overflow-wrap:anywhere]">{studio.name}</p>
          </div>
        </div>
      )}
      <div aria-busy={isCalculating}>
        <CheckoutBreakdown calc={calc} fallbackAmountStr={amountStr} itemName={itemName} />
      </div>
      {isCalculating && <p role="status" className="mt-3 text-[12px] font-semibold text-muted-foreground">{t('paymentModal.calculating')}</p>}
      {calcError && (
        <div role="alert" className="mt-3 rounded-2xl bg-danger/10 p-4 text-[13px] font-medium text-foreground">
          <p>{t('paymentModal.calculation_error')}</p>
          <button type="button" onClick={onRetry} className="mt-2 font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand">{t('booking.retry')}</button>
        </div>
      )}
      {paymentError && <div role="alert" className="mt-3 rounded-2xl bg-danger/10 p-4 text-[13px] font-medium text-foreground">{paymentError}</div>}

      <fieldset disabled={isProcessing} className="min-w-0 border-0 p-0">
      <CheckoutOptions
        calc={calc}
        promoCode={options.promo_code ?? ''}
        onPromoCode={(promo_code) => onOptionsChange({ promo_code })}
        certificateCode={options.certificate_code ?? ''}
        onCertificateCode={(certificate_code) => onOptionsChange({ certificate_code })}
        useBonuses={options.use_bonuses ?? false}
        onUseBonuses={(use_bonuses) => onOptionsChange({ use_bonuses })}
        useDeposit={options.use_deposit ?? false}
        onUseDeposit={(use_deposit) => onOptionsChange({ use_deposit })}
        disabled={isProcessing}
      />
      </fieldset>

      <div className="mt-5 flex items-start gap-2.5 rounded-[16px] px-1 py-2 text-[12px] font-medium leading-relaxed text-muted-foreground">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="mt-0.5 h-4 w-4 shrink-0"><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <p>{fullyCovered ? t('paymentModal.free_hint') : t('paymentModal.secure_hint')}</p>
      </div>
    </Sheet>
  );
}
