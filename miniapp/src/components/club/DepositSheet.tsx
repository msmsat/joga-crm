import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import { ListSkeleton } from '../ui/ListSkeleton';
import { EmptyState } from '../ui/EmptyState';
import { getDepositHistory, type DepositEntry } from '../../api/loyalty';

interface DepositSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * История депозита — движение денег на клубном балансе.
 *
 * Грузится при открытии, а не вместе со страницей: депозит есть у меньшинства
 * клиентов, и тянуть его историю всем в основном запросе значило бы платить
 * за неё каждым открытием раздела.
 */
export default function DepositSheet({ isOpen, onClose }: DepositSheetProps) {
  const { t, i18n } = useTranslation();

  const [entries, setEntries] = useState<DepositEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        setEntries(await getDepositHistory());
      } catch (err) {
        console.error('Не вдалося завантажити історію депозиту:', err);
        setError(err instanceof Error ? err.message : t('club.deposit_load_error'));
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
      kicker={t('club.deposit')}
      title={t('club.deposit_history')}
    >
      {isLoading ? (
        <ListSkeleton rows={3} flush />
      ) : error ? (
        <EmptyState
          size="sm"
          title={t('club.deposit_load_error')}
          hint={error}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          size="sm"
          title={t('club.deposit_empty')}
          icon={
            <>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, i) => (
            <motion.div
              key={`${entry.created_at}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-[18px] bg-background px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-foreground">
                  {entry.description}
                </div>
                <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
              </div>

              <div
                className={`shrink-0 text-[14px] font-extrabold tabular-nums tracking-[-0.01em] ${
                  entry.amount < 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {entry.amount > 0 ? `+${entry.amount_str}` : entry.amount_str}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
