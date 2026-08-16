import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { useToast } from '../../../../components/ui/Toast';
import { aiApi } from '../../../../api/ai/ai.api';
import { queryKeys } from '../../../../api/queryKeys';
import styles from '../AI.module.css';

// Что ассистент помнит о студии (эпик AI-6, задача 16).
//
// Блок существует не ради красоты: память, которую нельзя посмотреть и стереть
// одной кнопкой, пугает больше, чем помогает — особенно в CRM с персональными
// данными. Записывает факты сам ассистент по просьбе человека, здесь только
// список и крестик.
export default function MemoryCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation('ai');
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const facts = useQuery({
    queryKey: queryKeys.aiFacts,
    queryFn: () => aiApi.getFacts(),
    staleTime: 60_000,
  });

  const remove = useMutation({
    mutationFn: (id: number) => aiApi.deleteFact(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.aiFacts });
      setConfirmId(null);
      toast.success(t('memory.deleted'));
    },
    onError: () => toast.error(t('common:errors.saveFailed')),
  });

  // Пустую память не показываем вовсе: пустой блок в узкой колонке читается как
  // поломка, а факт здесь появляется только по прямой просьбе человека.
  if (!facts.data?.length) return null;

  return (
    <div className={styles.memoryBlock}>
      <div className={styles.miniSettingsHeader}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0 0 6v2a4 4 0 0 0 8 0v-2a3 3 0 0 0 0-6V7a4 4 0 0 0-4-4z" />
          <path d="M12 3v18" />
        </svg>
        <span>{t('memory.title')}</span>
      </div>

      <ul className={styles.memoryList}>
        {facts.data.map(fact => (
          <li key={fact.id} className={styles.memoryItem}>
            <span className={styles.memoryText}>{fact.text}</span>
            {canEdit && (
              <button
                type="button"
                className={styles.memoryForget}
                title={t('memory.forget')}
                aria-label={t('memory.forget')}
                onClick={() => setConfirmId(fact.id)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      {confirmId != null && (
        <ConfirmModal
          danger
          title={t('memory.forgetConfirmTitle')}
          message={t('memory.forgetConfirmMessage')}
          onConfirm={() => remove.mutate(confirmId)}
          onClose={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
