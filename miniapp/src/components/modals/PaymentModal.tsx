import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  amountStr: string;
  /** Создаёт сессию Stripe и открывает её (`tg.openLink`) — форму карты
   * рисует сама страница Stripe, не мы (PCI, как и в кассе CRM). */
  onPay: () => Promise<void>;
}

export default function PaymentModal({ isOpen, onClose, itemName, amountStr, onPay }: PaymentModalProps) {
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

  return (
    <Sheet
      isOpen={isOpen}
      onClose={isProcessing ? () => undefined : onClose}
      layer={1}
      kicker={t('paymentModal.tag')}
      title={t('paymentModal.title')}
      footer={
        <SheetAction onClick={handlePay} disabled={isProcessing}>
          {isProcessing ? t('paymentModal.processing_transaction') : t('paymentModal.pay_card')}
        </SheetAction>
      }
    >
      {/* Чек: линия отрыва пунктиром — единственная разделительная линия во всём
          приложении, здесь она уместна как знак «это квитанция». */}
      <div className="rounded-[20px] bg-background px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[12.5px] font-medium text-muted-foreground">
            {t('paymentModal.service')}
          </span>
          <span className="text-right text-[13px] font-bold text-foreground">{itemName}</span>
        </div>

        <div className="my-3.5 border-t border-dashed border-foreground/12" />

        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] font-bold text-foreground">
            {t('paymentModal.amount_due')}
          </span>
          <span className="text-[21px] font-extrabold tabular-nums tracking-[-0.03em] text-foreground">
            {amountStr}
          </span>
        </div>
      </div>

      <p className="mt-5 text-center text-[12px] font-medium leading-relaxed text-muted-foreground">
        {t('paymentModal.redirect_hint')}
      </p>
    </Sheet>
  );
}
