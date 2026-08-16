import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { timeAgo } from '../../../../lib/datetime';
import EmptyStateSVG from '../../../../components/AIDrawer/components/EmptyStateSVG';
import type { AIChatSession, AIUISettings } from '../types';
import { MODEL_OPTIONS, LANGUAGE_OPTIONS } from '../constants';
import AgentConfigCard from './AgentConfigCard';
import CustomSelect from './CustomSelect';
import MemoryCard from './MemoryCard';
import { getStudioRole } from '../../../../utils/auth';
import { aiApi } from '../../../../api/ai/ai.api';
import { queryKeys } from '../../../../api/queryKeys';
import styles from '../AI.module.css';

interface LeftPanelProps {
  sessions: AIChatSession[];
  sessionsLoading: boolean;
  sessionsError: boolean;
  onRetrySessions: () => void;
  activeSessionId: number | null;
  aiSettings: AIUISettings;
  telegramEnabled: boolean;
  telegramConnected: boolean;
  telegramChannelActive: boolean;
  instagramEnabled: boolean;
  instagramConnected: boolean;
  whatsappEnabled: boolean;
  whatsappConnected: boolean;
  onNewChat: () => void;
  onLoadSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
  onUpdateSettings: (patch: Partial<AIUISettings>) => void;
  onToggleTelegram: () => void;
  onToggleInstagram: () => void;
  onToggleWhatsapp: () => void;
  onOpenAgentSetup: () => void;
}

function groupByDay(sessions: AIChatSession[], t: TFunction) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const groups: Record<string, AIChatSession[]> = {};
  for (const s of sessions) {
    const day = new Date(s.updated_at).toDateString();
    const label = day === today ? t('history.today') : day === yesterday ? t('history.yesterday') : t('history.earlier');
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}

export default function LeftPanel({
  sessions,
  sessionsLoading,
  sessionsError,
  onRetrySessions,
  activeSessionId,
  aiSettings,
  telegramEnabled,
  telegramConnected,
  telegramChannelActive,
  instagramEnabled,
  instagramConnected,
  whatsappEnabled,
  whatsappConnected,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onUpdateSettings,
  onToggleTelegram,
  onToggleInstagram,
  onToggleWhatsapp,
  onOpenAgentSetup,
}: LeftPanelProps) {
  const { t } = useTranslation('ai');
  const groups = groupByDay(sessions, t);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Модель, язык ассистента и ИИ-агенты — настройки студии, одни на всех
  // (PATCH /ai/settings и ручки каналов на бэке owner-only). Админу и тренеру
  // остаётся чат и своя история: они этими настройками пользуются, а не правят.
  const isOwner = getStudioRole() === 'owner';
  const navigate = useNavigate();
  // Остаток обращений к ИИ за месяц. Лимит без индикатора выглядит как поломка:
  // владелец получает 429 и не понимает, почему ассистент вдруг отказал.
  const quota = useQuery({
    queryKey: queryKeys.aiQuota,
    queryFn: () => aiApi.getQuota(),
    staleTime: 5 * 60_000,
  });
  const used = quota.data?.used ?? 0;
  const limit = quota.data?.limit ?? 0;
  const filled = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const low = limit > 0 && limit - used <= limit * 0.1;

  return (
    <div className={styles.leftPanel}>
      <div className={styles.leftPanelHeader}>
        <span className={styles.leftPanelTitle}>{t('history.title')}</span>
        <button onClick={onNewChat} className={styles.newChatBtn} title={t('actions.newChat')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.sessionList}>
        {sessionsError ? (
          <div className={styles.sessionsErrorState}>
            <span className={styles.sessionsEmpty}>{t('common:errors.loadFailed')}</span>
            <button onClick={onRetrySessions} className={styles.sessionsRetryBtn}>{t('common:errors.retry')}</button>
          </div>
        ) : sessionsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.sessionSkelRow}>
              <div className={`${styles.skel} ${styles.sessionSkelTitle}`} />
              <div className={`${styles.skel} ${styles.sessionSkelPreview}`} />
            </div>
          ))
        ) : sessions.length === 0 ? (
          <div className={styles.sessionsEmptyState}>
            <EmptyStateSVG />
            <span className={styles.sessionsEmpty}>{t('history.empty')}</span>
          </div>
        ) : (
          Object.entries(groups).map(([label, list]) => (
            <div key={label}>
              <div className={styles.sessionGroup}>{label}</div>
              {list.map(session => (
                <div key={session.id} className={styles.sessionItemRow}>
                  <button
                    onClick={() => onLoadSession(session.id)}
                    className={`${styles.sessionItem} ${activeSessionId === session.id ? styles.sessionItemActive : ''}`}
                  >
                    <div className={styles.sessionItemTop}>
                      <span className={styles.sessionTitle}>{session.title}</span>
                      <span className={styles.sessionTime}>{timeAgo(session.updated_at)}</span>
                    </div>
                    <div className={styles.sessionPreview}>{session.preview ?? ''}</div>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(session.id)}
                    className={styles.sessionDeleteBtn}
                    title={t('actions.deleteChat')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Что ассистент помнит о студии. Видят все роли — на этих фактах он
          строит ответы любому сотруднику; стирать может владелец и админ. */}
      <MemoryCard canEdit={isOwner || getStudioRole() === 'admin'} />

      {/* Настройки свёрнуты: модель и язык трогают раз в месяц, а места в узкой
          колонке они занимали больше, чем сама история чатов. Раскрытие на
          нативном <details> — состояние и доступность из коробки, без JS. */}
      {isOwner && <details className={styles.settingsBlock}>
        <summary className={styles.settingsToggle}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t('settings.title')}</span>
          <svg className={styles.settingsChevron} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>

        <div className={styles.settingsBody}>
          <div className={styles.miniSettingRow}>
            <span className={styles.miniSettingLabel}>{t('settings.model')}</span>
            <CustomSelect
              value={aiSettings.model}
              options={MODEL_OPTIONS.map(o => ({ value: o.value, label: t(`models.${o.value}`) }))}
              onChange={v => onUpdateSettings({ model: v as AIUISettings['model'] })}
              footerNote={t('models.comingSoon')}
            />
          </div>

          <div className={styles.miniSettingRow}>
            <span className={styles.miniSettingLabel}>{t('settings.language')}</span>
            <CustomSelect
              value={aiSettings.language}
              options={LANGUAGE_OPTIONS.map(o => ({ value: o.value, label: t(`languages.${o.value}`) }))}
              onChange={v => onUpdateSettings({ language: v as AIUISettings['language'] })}
            />
          </div>

          <AgentConfigCard
            telegramEnabled={telegramEnabled}
            telegramConnected={telegramConnected}
            telegramChannelActive={telegramChannelActive}
            instagramEnabled={instagramEnabled}
            instagramConnected={instagramConnected}
            whatsappEnabled={whatsappEnabled}
            whatsappConnected={whatsappConnected}
            onToggleTelegram={onToggleTelegram}
            onToggleInstagram={onToggleInstagram}
            onToggleWhatsapp={onToggleWhatsapp}
          />
        </div>
      </details>}

      {/* Окно настройки агентов — своей кнопкой внизу панели: раньше она пряталась
          в карточке агентов, теперь до неё не нужно ничего раскрывать. */}
      {isOwner && (
        <button onClick={onOpenAgentSetup} className={styles.setupBtn}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          {t('agents.configureButton')}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {quota.isSuccess && (
        <div className={`${styles.quotaBlock} ${low ? styles.quotaLow : ''}`}>
          <div className={styles.quotaRow}>
            <span>{t('quota.label')}</span>
            <span className={styles.quotaValue}>{t('quota.value', { used, limit })}</span>
          </div>
          <div className={styles.quotaBar}>
            <div className={styles.quotaFill} style={{ width: `${filled}%` }} />
          </div>
          {low && (
            <div className={styles.quotaHint}>
              {t('quota.low')}{' '}
              {/* Тариф — зона владельца: остальным ролям только текст, без ссылки. */}
              {isOwner && (
                <button className={styles.quotaLink} onClick={() => navigate('/dashboard/billing')}>
                  {t('quota.upgrade')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {confirmDeleteId != null && (
        <ConfirmModal
          danger
          title={t('history.deleteConfirmTitle')}
          message={t('history.deleteConfirmMessage')}
          onConfirm={() => onDeleteSession(confirmDeleteId)}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
