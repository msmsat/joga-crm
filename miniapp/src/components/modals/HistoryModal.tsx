import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { ListSkeleton } from '../ui/ListSkeleton';
import { EmptyState } from '../ui/EmptyState';
import { getUserPayments, type PaymentResponse } from '../../api/user';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const { t, i18n } = useTranslation();

  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        setPayments(await getUserPayments());
      } catch (err) {
        console.error('Помилка завантаження історії оплат:', err);
        setError(err instanceof Error ? err.message : t('historyModal.load_error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, t]);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={t('historyModal.tag')}
      title={t('historyModal.title')}
      subtitle={t('historyModal.sub')}
    >
      {isLoading ? (
        <ListSkeleton rows={3} flush />
      ) : error ? (
        <EmptyState
          size="sm"
          title={t('historyModal.load_error')}
          hint={error}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          }
        />
      ) : payments.length === 0 ? (
        <EmptyState
          size="sm"
          title={t('historyModal.no_payments')}
          icon={
            <>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-[18px] bg-background px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-foreground">
                  {item.action_type === 'buy_subscription'
                    ? t('payment.action.buy_subscription', {
                        item: t(`subscription.${item.item_key}.name`, {
                          defaultValue: item.description,
                        }),
                      })
                    : item.description}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  {new Date(item.created_at).toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  })}
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                  <span className={item.status === 'success' ? 'text-success' : undefined}>
                    {item.status === 'success' ? t('historyModal.status_success') : item.status}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-[14px] font-extrabold tabular-nums tracking-[-0.01em] text-foreground">
                {item.amount_str}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
