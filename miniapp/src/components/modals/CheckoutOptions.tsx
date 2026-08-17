import { useTranslation } from 'react-i18next';
import SettingRow from '../profile/SettingRow';
import type { CheckoutCalc } from '../../api/user';

interface Props {
  calc: CheckoutCalc | null;
  promoCode: string;
  onPromoCode: (value: string) => void;
  certificateCode: string;
  onCertificateCode: (value: string) => void;
  useBonuses: boolean;
  onUseBonuses: (value: boolean) => void;
  useDeposit: boolean;
  onUseDeposit: (value: boolean) => void;
  disabled: boolean;
}

const inputClass =
  'w-full rounded-[16px] bg-background px-4 py-3.5 text-[14px] font-semibold text-foreground ' +
  'placeholder:font-medium placeholder:text-muted-foreground/70 outline-none ' +
  'ring-1 ring-inset ring-transparent transition focus:ring-brand/50 disabled:opacity-50';

/**
 * Чем клиент хочет расплатиться помимо карты.
 *
 * Тумблеры баллов и депозита показываются, только если этому клиенту есть что
 * тратить: строка «Списать баллы (0)» — это обещание, за которым ничего нет.
 * Сколько именно спишется, решает сервер и возвращает в `calc` — здесь только
 * рычаги, никакой арифметики.
 */
export default function CheckoutOptions({
  calc,
  promoCode,
  onPromoCode,
  certificateCode,
  onCertificateCode,
  useBonuses,
  onUseBonuses,
  useDeposit,
  onUseDeposit,
  disabled,
}: Props) {
  const { t } = useTranslation();

  // Введён код, которого нет или он истёк. Пустое поле ошибкой не считаем.
  const promoRejected = promoCode.trim().length > 0 && calc !== null && !calc.promo_valid;
  const certificateRejected =
    certificateCode.trim().length > 0 && calc !== null && calc.certificate_applied === 0;

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      <div>
        <input
          type="text"
          value={promoCode}
          onChange={(e) => onPromoCode(e.target.value.toUpperCase())}
          placeholder={t('paymentModal.promo_placeholder')}
          disabled={disabled}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
        {promoRejected && (
          <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-danger">
            {t('paymentModal.promo_invalid')}
          </div>
        )}
      </div>

      <div>
        <input
          type="text"
          value={certificateCode}
          onChange={(e) => onCertificateCode(e.target.value.toUpperCase())}
          placeholder={t('paymentModal.certificate_placeholder')}
          disabled={disabled}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
        {certificateRejected && (
          <div className="mt-1.5 px-1 text-[11.5px] font-semibold text-danger">
            {t('paymentModal.certificate_invalid')}
          </div>
        )}
      </div>

      {calc !== null && calc.deposit_available > 0 && (
        <SettingRow
          icon={<path d="M3 7h18v10H3zM3 11h18" />}
          label={t('paymentModal.use_deposit')}
          toggle
          checked={useDeposit}
          onClick={() => !disabled && onUseDeposit(!useDeposit)}
        />
      )}

      {calc !== null && calc.bonuses_available > 0 && (
        /* Рядом с числом баллов — их цена: на уровне, где балл стоит 2 ₴,
           «250 баллов» и «500 ₴» это одно и то же, и человек должен видеть
           вторую цифру до того, как решит тратить. */
        <SettingRow
          icon={<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />}
          label={t('paymentModal.use_bonuses_worth', {
            count: calc.bonuses_available,
            value: calc.bonuses_available_value_str,
          })}
          toggle
          checked={useBonuses}
          onClick={() => !disabled && onUseBonuses(!useBonuses)}
        />
      )}
    </div>
  );
}
