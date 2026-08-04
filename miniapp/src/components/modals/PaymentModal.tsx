import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  amountStr: string;
  onSuccess: () => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  itemName,
  amountStr,
  onSuccess,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const { tg } = useTelegram();

  const [isProcessing, setIsProcessing] = useState(false);
  const [method, setMethod] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Из ввода вычищается всё, кроме цифр, — формат расставляется сам.
  const onCardChange = (value: string) =>
    setCardNumber(
      value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ').substring(0, 19),
    );

  const onExpiryChange = (value: string) => {
    const digits = value.replace(/\D/g, '').substring(0, 4);
    setExpiry(digits.length >= 3 ? `${digits.substring(0, 2)}/${digits.substring(2)}` : digits);
  };

  const isCardValid = cardNumber.length === 19 && expiry.length === 5 && cvv.length === 3;

  const pay = (via: string) => {
    setMethod(via);
    setIsProcessing(true);
    if (tg) tg.HapticFeedback.impactOccurred('medium');

    // ponytail: платёжного шлюза у мини-приложения ещё нет — полторы секунды
    // изображают запрос. Заменяется вызовом эквайринга, когда он появится.
    setTimeout(() => {
      setIsProcessing(false);
      setMethod(null);
      setCardNumber('');
      setExpiry('');
      setCvv('');
      if (tg) tg.HapticFeedback.notificationOccurred('success');
      onSuccess();
      onClose();
    }, 1500);
  };

  const field =
    'w-full rounded-[16px] bg-background px-4 py-3.5 text-[15px] font-semibold tabular-nums text-foreground outline-none transition placeholder:font-medium placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-brand disabled:opacity-50';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={isProcessing ? () => undefined : onClose}
      layer={1}
      kicker={t('paymentModal.tag')}
      title={t('paymentModal.title')}
      footer={
        <SheetAction onClick={() => pay('card')} disabled={!isCardValid || isProcessing}>
          {isProcessing && method === 'card'
            ? t('paymentModal.processing_transaction')
            : t('paymentModal.pay_card')}
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

      <div className="mt-4 flex flex-col gap-2.5">
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={cardNumber}
          onChange={(e) => onCardChange(e.target.value)}
          disabled={isProcessing}
          className={field}
        />
        <div className="flex gap-2.5">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder={t('paymentModal.expiry_placeholder')}
            value={expiry}
            onChange={(e) => onExpiryChange(e.target.value)}
            disabled={isProcessing}
            className={field}
          />
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVV"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 3))}
            disabled={isProcessing}
            className={field}
          />
        </div>
      </div>

      <div className="py-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
        {t('paymentModal.or_other')}
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => pay('apple')}
          disabled={isProcessing}
          className="flex flex-1 items-center justify-center gap-2 rounded-[16px] bg-[#1A1A1A] py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.3-3.51zM14.9 5.8c.6-.74 1.01-1.76.9-2.8-.87.04-1.93.59-2.56 1.32-.56.65-1.05 1.7-.92 2.7.97.08 1.97-.49 2.58-1.22z" />
          </svg>
          {isProcessing && method === 'apple' ? t('paymentModal.processing') : 'Apple Pay'}
        </button>

        <button
          type="button"
          onClick={() => pay('google')}
          disabled={isProcessing}
          className="flex flex-1 items-center justify-center gap-2 rounded-[16px] bg-background py-3.5 text-[14px] font-bold text-foreground ring-1 ring-foreground/10 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4">
            <path fill="#4285F4" d="M23.64 12.2c0-.81-.07-1.6-.21-2.36H12v4.47h6.53c-.28 1.45-1.07 2.68-2.24 3.46v2.87h3.62c2.12-1.95 3.34-4.82 3.34-8.44z" />
            <path fill="#34A853" d="M12 24c3.27 0 6.02-1.08 8.03-2.93l-3.62-2.87c-1.09.73-2.48 1.16-4.41 1.16-3.39 0-6.26-2.29-7.29-5.37H.97v2.98C2.98 20.93 7.15 24 12 24z" />
            <path fill="#FBBC05" d="M4.71 14.63c-.26-.78-.41-1.62-.41-2.48s.15-1.7.41-2.48V6.69H.97C.35 7.93 0 9.35 0 10.85s.35 2.92.97 4.16l3.74-2.88z" />
            <path fill="#EA4335" d="M12 4.75c1.78 0 3.38.61 4.64 1.82l3.47-3.47C18.02 1.18 15.27 0 12 0 7.15 0 2.98 3.07.97 7.02l3.74 2.88c1.03-3.08 3.9-5.15 7.29-5.15z" />
          </svg>
          {isProcessing && method === 'google' ? t('paymentModal.processing') : 'Google Pay'}
        </button>
      </div>
    </Sheet>
  );
}
