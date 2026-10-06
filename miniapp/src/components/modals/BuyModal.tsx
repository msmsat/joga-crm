import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import PaymentModal from './PaymentModal';
import { useTelegram } from '../../hooks/useTelegram';
import { useCheckoutCalc } from '../../hooks/useCheckoutCalc';
import { createCheckoutSession, type CheckoutOptions } from '../../api/user';
import { notify } from '../../lib/notify';
import type { SubscriptionPackageInfo } from '../../api/studio';

const NO_OPTIONS: CheckoutOptions = {
  promo_code: '',
  certificate_code: '',
  use_bonuses: false,
  use_deposit: false,
};

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  packages: SubscriptionPackageInfo[];
  /** Студия подключила приём онлайн-оплаты (Stripe Connect). */
  canPayOnline: boolean;
  /** Пришли из Клуба «использовать сертификат» — код уже подставлен в оплату.
   * Профиль пересоздаёт модалку по ключу, поэтому берётся начальным состоянием. */
  initialCertificate?: string | null;
  /** Пришли по QR абонемента — он и должен быть выбран. Тем же способом, что и
   *  сертификат: начальным состоянием, модалку пересоздаёт профиль по ключу. */
  initialPackageId?: number;
}

export default function BuyModal({
  isOpen,
  onClose,
  onSuccess,
  packages,
  canPayOnline,
  initialCertificate = null,
  initialPackageId,
}: BuyModalProps) {
  const { t } = useTranslation();
  const { tg, vibrateLight } = useTelegram();
  const reduce = useReducedMotion();

  // Раскрывающаяся карточка заменена на выбор: раскрытие прятало кнопку оплаты
  // внутрь карточки, и до неё было два тапа вместо одного.
  const [selectedId, setSelectedId] = useState<number | null>(initialPackageId ?? null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [options, setOptions] = useState<CheckoutOptions>(() => ({
    ...NO_OPTIONS,
    certificate_code: initialCertificate ?? '',
  }));

  const selected = packages.find((plan) => plan.id === selectedId) ?? null;
  const nameOf = (plan: SubscriptionPackageInfo) =>
    t(`subscription.${plan.name}.name`, { defaultValue: plan.name });

  // Расчёт запрашиваем только когда лист оплаты открыт: в списке пакетов
  // рычагов ещё нет, и дёргать сервер на каждый выбор пакета незачем.
  const { calc, isCalculating } = useCheckoutCalc(canPayOnline && isPaymentOpen ? selectedId : null, options);

  const handleClose = () => {
    setSelectedId(null);
    setIsPaymentOpen(false);
    setOptions(NO_OPTIONS);
    onClose();
  };

  // Пришли из Клуба: сертификат уже в оплате, но пакет клиент ещё не выбрал.
  // Показываем это прямо в списке — иначе код «пропадает» на один экран, и
  // непонятно, применится ли он вообще.
  const pendingCertificate = initialCertificate && options.certificate_code === initialCertificate
    ? initialCertificate
    : null;

  /**
   * Stripe открывается снаружи (`tg.openLink`, без Stripe.js на клиенте) —
   * подтверждение оплаты приходит бэку по вебхуку, а не нам напрямую. Здесь
   * нельзя честно сказать «оплата прошла»: мы просто не знаем, оплатил клиент
   * или закрыл вкладку. Единственный честный шаг — перечитать абонементы,
   * когда клиент вернулся в Telegram, и показать то, что реально в базе.
   */
  const waitForReturnAndRefresh = () => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      if (onSuccess) onSuccess();
      notify(t('buyModal.checking_payment'));
      handleClose();
    };
    document.addEventListener('visibilitychange', onVisible);
  };

  const startPayment = async () => {
    if (!selected || !canPayOnline) return;

    try {
      const { url, paid } = await createCheckoutSession(selected.id, options);

      // Сертификат/депозит/баллы покрыли всё — Stripe не нужен, абонемент уже
      // начислен на сервере. Здесь мы ЗНАЕМ, что оплата прошла, поэтому
      // говорим прямо, а не «проверяем оплату», как в случае с картой.
      if (paid || !url) {
        if (onSuccess) onSuccess();
        notify(t('buyModal.activated'));
        handleClose();
        return;
      }

      if (tg?.openLink) tg.openLink(url);
      else window.open(url, '_blank');
      setIsPaymentOpen(false);
      waitForReturnAndRefresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('buyModal.activate_error'));
    }
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={handleClose}
        kicker={t('buyModal.tag')}
        title={t('buyModal.title')}
        subtitle={t(canPayOnline ? 'buyModal.sub' : 'buyModal.pay_in_studio')}
        footer={
          canPayOnline && packages.length > 0 ? (
            <SheetAction onClick={() => setIsPaymentOpen(true)} disabled={!selected}>
              {selected ? t('buyModal.pay', { price: selected.final_price_str }) : t('buyModal.choose_plan')}
            </SheetAction>
          ) : (
            <SheetAction onClick={handleClose}>{t('buyModal.close')}</SheetAction>
          )
        }
      >
        {pendingCertificate && canPayOnline && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-3 flex items-center gap-3 rounded-[16px] bg-brand/10 px-4 py-3 ring-1 ring-inset ring-brand/25"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-foreground">
              {t('buyModal.certificate_ready')}
              <span className="ml-1 font-mono text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground">
                {pendingCertificate}
              </span>
            </span>
          </motion.div>
        )}

        {packages.length === 0 && <div className="rounded-[20px] bg-background p-5 text-[13px] font-medium leading-relaxed text-muted-foreground">{t(canPayOnline ? 'buyModal.no_plans' : 'buyModal.offline_help')}</div>}
        <div className="flex flex-col gap-3">
          {packages.map((plan) => {
            const isSelected = selectedId === plan.id;

            return (
              <motion.button
                key={plan.id}
                type="button"
                aria-pressed={isSelected}
                whileTap={reduce ? undefined : { scale: 0.985 }}
                onClick={() => {
                  setSelectedId(plan.id);
                  vibrateLight();
                }}
                className={`relative flex flex-col gap-5 rounded-[22px] p-5 text-left shadow-soft transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${
                  isSelected ? 'bg-background ring-2 ring-brand' : 'bg-background ring-1 ring-inset ring-border hover:ring-brand/50'
                }`}
              >
                <span className="flex items-start justify-between gap-4">
                  <span className="min-w-0 text-[16px] font-extrabold leading-snug tracking-[-0.025em] text-foreground [overflow-wrap:anywhere]">{nameOf(plan)}</span>
                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isSelected ? 'bg-brand text-brand-foreground' : 'ring-1 ring-foreground/20'}`}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="m5 12 4 4L19 6" /></svg>}
                  </span>
                </span>
                <span className="flex flex-wrap items-end justify-between gap-4">
                  <span>
                    <span className="block text-[36px] font-extrabold leading-none tabular-nums tracking-[-0.06em] text-foreground">{plan.class_count}</span>
                    <span className="mt-1.5 block text-[11.5px] font-semibold text-muted-foreground">{t('common.classes_count')}</span>
                  </span>
                  <span className="text-right">
                    {plan.discount_label && <span className="mb-1 flex flex-wrap items-baseline justify-end gap-2 text-[11px] font-semibold"><span className="text-muted-foreground line-through">{plan.price_str}</span><span className="rounded-full bg-brand px-2 py-0.5 text-brand-foreground">{plan.discount_label}</span></span>}
                    <span className="block text-[22px] font-extrabold tabular-nums tracking-[-0.04em] text-foreground">{plan.final_price_str}</span>
                    <span className="mt-1 block text-[11.5px] font-medium text-muted-foreground">{t('buyModal.duration', { count: plan.duration_days })}</span>
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </Sheet>

      <PaymentModal
        isOpen={canPayOnline && isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        itemName={selected ? nameOf(selected) : ''}
        amountStr={selected ? selected.final_price_str : ''}
        calc={calc}
        isCalculating={isCalculating}
        options={options}
        onOptionsChange={(patch) => setOptions((prev) => ({ ...prev, ...patch }))}
        onPay={startPayment}
      />
    </>
  );
}
