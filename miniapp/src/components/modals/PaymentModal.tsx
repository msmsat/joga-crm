import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import CheckoutBreakdown from './CheckoutBreakdown';
import CheckoutOptions from './CheckoutOptions';
import type { CheckoutCalc, CheckoutOptions as CheckoutOptionsValue } from '../../api/user';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  /** Цена пакета — показывается, пока не пришёл расчёт с сервера. */
  amountStr: string;
  /** Разбор цены с сервера; null — расчёт ещё идёт или не удался. */
  calc: CheckoutCalc | null;
  isCalculating: boolean;
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
  options,
  onOptionsChange,
  onPay,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePay = async () => {
    setIsProcessing(true);
    try {
      await onPay();
    } finally {
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
        <SheetAction onClick={handlePay} disabled={isProcessing || isCalculating}>
          {actionLabel}
        </SheetAction>
      }
    >
      <CheckoutBreakdown calc={calc} fallbackAmountStr={amountStr} itemName={itemName} />

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

      <p className="mt-5 text-center text-[12px] font-medium leading-relaxed text-muted-foreground">
        {fullyCovered ? t('paymentModal.free_hint') : t('paymentModal.redirect_hint')}
      </p>
    </Sheet>
  );
}
