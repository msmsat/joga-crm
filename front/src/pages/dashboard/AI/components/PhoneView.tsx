import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ChatView from '../../../../components/AIDrawer/components/ChatView';
import HistoryView from '../../../../components/AIDrawer/components/HistoryView';
import drawer from '../../../../components/AIDrawer/AIDrawer.module.css';
import { MODEL_OPTIONS, LANGUAGE_OPTIONS } from '../constants';
import type { AIPlanProposal } from '../../../../api/ai/ai.types';
import type { PlanAnswers } from '../../../../components/ui/index';
import type { AIChatMessage, AIChatSession, AIUISettings } from '../types';
import CustomSelect from './CustomSelect';
import { getStudioRole } from '../../../../utils/auth';
import styles from '../AI.module.css';

interface PhoneViewProps {
  messages: AIChatMessage[];
  isThinking: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSend: (text: string) => void;
  sessions: AIChatSession[];
  sessionsLoading: boolean;
  sessionsError: boolean;
  onRetrySessions: () => void;
  activeSessionId: number | null;
  onLoadSession: (id: number) => void;
  onNewChat: () => void;
  aiSettings: AIUISettings;
  onUpdateSettings: (patch: Partial<AIUISettings>) => void;
  activeAgents: number;
  onOpenAgentSetup: () => void;
  // Проброс карточки подтверждения и статуса инструмента (эпик AI-5, задача 10):
  // телефонный вид собран из компонентов дровера и ждёт их так же.
  toolStatus?: string | null;
  planProposal?: AIPlanProposal | null;
  onConfirmAction?: (answers: PlanAnswers) => void;
  onCancelAction?: () => void;
  actionPending?: boolean;
}

/**
 * Телефонная страница Velora AI — ровно тот же интерфейс, что у кнопки AI в
 * верхней панели: экран чата и экран истории, которые ездят друг под другом.
 * Двухколоночная раскладка (история + настройки слева, чат справа) на 320px
 * складывалась в панель поверх чата — то есть в тот же дровер, только свой.
 *
 * Переиспользуются и компоненты дровера, и его таблица стилей: «как у кнопки
 * сверху» здесь не копия вёрстки, а буквально она же.
 *
 * Агенты живут одной строкой в истории и открывают модалку настройки —
 * тумблеров каналов на странице нет намеренно: включение канала осмысленно
 * только рядом с его подключением, то есть внутри модалки.
 */
export default function PhoneView({
  messages, isThinking, messagesEndRef, onSend,
  sessions, sessionsLoading, sessionsError, onRetrySessions,
  activeSessionId, onLoadSession, onNewChat,
  aiSettings, onUpdateSettings,
  activeAgents, onOpenAgentSetup,
  toolStatus = null, planProposal = null, onConfirmAction, onCancelAction, actionPending = false,
}: PhoneViewProps) {
  const { t } = useTranslation('ai');
  const [showHistory, setShowHistory] = useState(false);
  // Тот же гейт, что в десктопной LeftPanel: агенты и настройки ассистента —
  // студийные, их правит владелец.
  const isOwner = getStudioRole() === 'owner';

  const selectSession = (id: number) => { onLoadSession(id); setShowHistory(false); };
  const startNewChat = () => { onNewChat(); setShowHistory(false); };

  return (
    <>
      <div className={drawer.header}>
        {showHistory ? (
          <>
            <button className={drawer.backBtn} onClick={() => setShowHistory(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {t('drawer.historyBack')}
            </button>
            <span className={drawer.headerTitle} style={{ opacity: 0.5, fontSize: '13px' }}>
              {t('drawer.historyLabel')}
            </span>
          </>
        ) : (
          <>
            <button className={drawer.historyBtn} onClick={() => setShowHistory(true)} title={t('history.title')}>
              <div className={drawer.historyBtnIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                  <path d="M12 3v-1" strokeWidth="2.5" />
                  <path d="M12 22v-1" strokeWidth="2.5" />
                </svg>
              </div>
            </button>
            <span className={drawer.headerTitle}>Velora AI</span>
            <div className={drawer.headerActions}>
              <button className={drawer.newChatBtn} onClick={startNewChat}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('actions.newChat')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={drawer.screens}>
        <div className={`${drawer.screen} ${drawer.chatScreen} ${showHistory ? drawer.chatScreenPushed : ''}`}>
          <ChatView
            messages={messages}
            isThinking={isThinking}
            messagesEndRef={messagesEndRef}
            onSend={onSend}
            toolStatus={toolStatus}
            planProposal={planProposal}
            onConfirmAction={onConfirmAction}
            onCancelAction={onCancelAction}
            actionPending={actionPending}
          />
        </div>

        <div className={`${drawer.screen} ${drawer.historyScreen} ${showHistory ? drawer.historyScreenVisible : ''}`}>
          <HistoryView
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionsError={sessionsError}
            onRetry={onRetrySessions}
            activeSessionId={activeSessionId}
            onSelect={selectSession}
          />

          {/* Подвал экрана истории: список чатов — то, за чем сюда заходят,
              агенты и настройки трогают раз в месяц. */}
          {isOwner && <div className={styles.phoneHistoryFoot}>
            <button type="button" className={styles.phoneAgentsRow} onClick={onOpenAgentSetup}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="2.2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              <span className={styles.phoneAgentsLabel}>{t('agents.title')}</span>
              <span className={`${styles.agentCount} ${activeAgents ? styles.agentCountOn : ''}`}>
                {t('agents.activeCount', { active: activeAgents, total: 3 })}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            <div className={styles.phoneSettingsRow}>
              <span className={styles.miniSettingLabel}>{t('settings.model')}</span>
              <CustomSelect
                value={aiSettings.model}
                options={MODEL_OPTIONS.map(o => ({ value: o.value, label: t(`models.${o.value}`) }))}
                onChange={v => onUpdateSettings({ model: v as AIUISettings['model'] })}
                footerNote={t('models.comingSoon')}
              />
            </div>
            <div className={styles.phoneSettingsRow}>
              <span className={styles.miniSettingLabel}>{t('settings.language')}</span>
              <CustomSelect
                value={aiSettings.language}
                options={LANGUAGE_OPTIONS.map(o => ({ value: o.value, label: t(`languages.${o.value}`) }))}
                onChange={v => onUpdateSettings({ language: v as AIUISettings['language'] })}
              />
            </div>
          </div>}
        </div>
      </div>
    </>
  );
}
