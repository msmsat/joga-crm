import { useTranslation } from 'react-i18next';
import type { CheckoutCalc } from '../../api/user';

interface Row {
  label: string;
  value: string;
  tone?: 'muted' | 'brand';
  strike?: boolean;
}

interface Props {
  calc: CheckoutCalc | null;
  /** Пока расчёт не пришёл — показываем цену пакета, а не пустоту. */
  fallbackAmountStr: string;
  itemName: string;
}

/**
 * Чек: из чего сложилась сумма к оплате.
 *
 * Строка появляется, только если реально сработала — нулевую скидку и
 * неиспользованный сертификат показывать незачем, это шум, из-за которого
 * настоящие списания теряются. Все суммы приходят с сервера уже отформатированными.
 */
export default function CheckoutBreakdown({ calc, fallbackAmountStr, itemName }: Props) {
  const { t } = useTranslation();

  const rows: Row[] = [{ label: t('paymentModal.service'), value: itemName }];

  if (calc) {
    // Базовую цену показываем только когда её есть с чем сравнить.
    const hasDeductions =
      calc.discount > 0 || calc.certificate_applied > 0 || calc.deposit_applied > 0 || calc.bonuses_applied > 0;

    if (hasDeductions) {
      rows.push({
        label: t('paymentModal.base_price'),
        value: calc.base_price_str,
        tone: 'muted',
        strike: true,
      });
    }
    if (calc.discount > 0) {
      rows.push({ label: t('paymentModal.discount'), value: `−${calc.discount_str}`, tone: 'brand' });
    }
    if (calc.certificate_applied > 0) {
      rows.push({
        label: t('paymentModal.certificate'),
        value: `−${calc.certificate_applied_str}`,
        tone: 'brand',
      });
    }
    if (calc.deposit_applied > 0) {
      rows.push({
        label: t('paymentModal.deposit'),
        value: `−${calc.deposit_applied_str}`,
        tone: 'brand',
      });
    }
    if (calc.bonuses_applied > 0) {
      rows.push({
        label: t('paymentModal.bonuses'),
        value: `−${calc.bonuses_applied}`,
        tone: 'brand',
      });
    }
  }

  return (
    <div className="rounded-[20px] bg-background px-4 py-4">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex items-start justify-between gap-4 ${i === 0 ? '' : 'mt-2.5'}`}
        >
          <span className="text-[12.5px] font-medium text-muted-foreground">{row.label}</span>
          <span
            className={`text-right text-[13px] tabular-nums ${
              row.tone === 'brand'
                ? 'font-extrabold text-brand'
                : row.tone === 'muted'
                  ? 'font-bold text-muted-foreground'
                  : 'font-bold text-foreground'
            } ${row.strike ? 'line-through' : ''}`}
          >
            {row.value}
          </span>
        </div>
      ))}

      {/* Линия отрыва пунктиром — единственная разделительная линия во всём
          приложении, здесь она уместна как знак «это квитанция». */}
      <div className="my-3.5 border-t border-dashed border-foreground/12" />

      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] font-bold text-foreground">
          {t('paymentModal.amount_due')}
        </span>
        <span className="text-[21px] font-extrabold tabular-nums tracking-[-0.03em] text-foreground">
          {calc ? calc.total_price_str : fallbackAmountStr}
        </span>
      </div>
    </div>
  );
}
