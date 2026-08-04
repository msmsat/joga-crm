import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import PaymentModal from './PaymentModal';
import { useTelegram } from '../../hooks/useTelegram';
import { buySubscription } from '../../api/user';
import { notify } from '../../lib/notify';
import type { SubscriptionPackageInfo } from '../../api/studio';

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  packages: SubscriptionPackageInfo[];
}

export default function BuyModal({ isOpen, onClose, onSuccess, packages }: BuyModalProps) {
  const { t } = useTranslation();
  // ponytail: tg_id остаётся здесь до блока 6 EPIC_MA_REAL_BACKEND — buySubscription
  // ниже последний потребитель tg_id, уйдёт вместе с переходом на Stripe Checkout.
  const { tg_id, vibrateLight } = useTelegram();

  // Раскрывающаяся карточка заменена на выбор: раскрытие прятало кнопку оплаты
  // внутрь карточки, и до неё было два тапа вместо одного.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const selected = packages.find((plan) => plan.id === selectedId) ?? null;
  const nameOf = (plan: SubscriptionPackageInfo) =>
    t(`subscription.${plan.name}.name`, { defaultValue: plan.name });

  const finishPurchase = async () => {
    if (!selected) return;

    try {
      await buySubscription(tg_id, {
        type: selected.name,
        total_classes: selected.class_count,
        amount: selected.price,
        valid_days: selected.duration_days,
      });

      // Сначала обновляем профиль (запрос уходит в фон), потом показываем текст —
      // пока клиент его читает, экран позади уже перерисован.
      if (onSuccess) onSuccess();
      notify(t('buyModal.success', { name: nameOf(selected) }));
      handleClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('buyModal.activate_error'));
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={handleClose}
        kicker={t('buyModal.tag')}
        title={t('buyModal.title')}
        subtitle={t('buyModal.sub')}
        footer={
          <SheetAction onClick={() => setIsPaymentOpen(true)} disabled={!selected}>
            {selected ? t('buyModal.pay', { price: selected.price_str }) : t('buyModal.choose_plan')}
          </SheetAction>
        }
      >
        <div className="flex flex-col gap-2.5">
          {packages.map((plan, i) => {
            const isSelected = selectedId === plan.id;

            return (
              <motion.button
                key={plan.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: i * 0.045, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.985 }}
                onClick={() => {
                  setSelectedId(plan.id);
                  vibrateLight();
                }}
                className={`relative flex items-center gap-3 rounded-[20px] px-4 py-4 text-left transition ${
                  isSelected ? 'bg-brand/10 ring-1 ring-brand/50' : 'bg-background'
                }`}
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
                    isSelected ? 'bg-brand' : 'ring-1 ring-foreground/15'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0.3 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                      className="h-2 w-2 rounded-full bg-brand-foreground"
                    />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                    {nameOf(plan)}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] font-medium text-muted-foreground">
                    {plan.class_count} {t('common.classes_count')}
                  </span>
                </span>

                <span className="shrink-0 text-[15px] font-extrabold tabular-nums tracking-[-0.025em] text-foreground">
                  {plan.price_str}
                </span>
              </motion.button>
            );
          })}
        </div>
      </Sheet>

      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        itemName={selected ? nameOf(selected) : ''}
        amountStr={selected ? selected.price_str : ''}
        onSuccess={finishPurchase}
      />
    </>
  );
}
