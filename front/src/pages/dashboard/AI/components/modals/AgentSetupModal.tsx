import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Button, Tooltip, ConfirmModal } from '../../../../../components/ui/index';
import type { AgentConfig, AgentTone } from '../../types';
import PulseRingSVG from '../animations/PulseRingSVG';
import CustomSelect from '../CustomSelect';
import styles from '../../AI.module.css';

const TG_TOKEN_RE = /^\d+:[\w-]{30,}$/;

interface AgentSetupModalProps {
  config: AgentConfig;
  isSaving: boolean;
  tgConnected: boolean;
  isVerifyingTelegram: boolean;
  igConnected: boolean;
  isConnectingInstagram: boolean;
  onToggleChannel: (channel: 'telegram' | 'instagram') => void;
  onSave: (draft: AgentConfig) => void;
  onVerifyTelegram: (token: string) => void;
  onDisconnectTelegram: () => Promise<void>;
  onConnectInstagram: () => void;
  onDisconnectInstagram: () => Promise<void>;
  onClose: () => void;
}

const TONE_VALUES: AgentTone[] = ['friendly', 'formal', 'neutral'];

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statBadge}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function ChannelSection({
  label,
  icon,
  config,
  onUpdate,
  onToggle,
  showOffHours,
  tokenArea,
  toggleDisabled,
  toggleDisabledReason,
  statsPendingCaption,
}: {
  label: string;
  icon: React.ReactNode;
  config: AgentConfig['telegram'];
  onUpdate: (field: string, value: string | number | boolean | AgentTone) => void;
  onToggle: () => void;
  showOffHours?: boolean;
  tokenArea: React.ReactNode;
  toggleDisabled?: boolean;
  toggleDisabledReason?: string;
  statsPendingCaption?: string;
}) {
  const { t } = useTranslation('ai');
  const toneOptions = TONE_VALUES.map(v => ({ value: v, label: t(`agents.tone.${v}`) }));
  const toggleBtn = (
    <button
      onClick={onToggle}
      disabled={toggleDisabled}
      className={`${styles.toggleSwitch} ${config.enabled ? styles.toggleSwitchOn : ''}`}
    >
      <div className={styles.toggleThumb} />
    </button>
  );

  return (
    <div className={styles.channelSection}>
      <div className={styles.channelHeader}>
        <div className={styles.channelIconWrap}>{icon}</div>
        <div>
          <div className={styles.channelName}>{label}</div>
          <div className={styles.channelStatus}>
            <PulseRingSVG active={config.enabled} size={8} />
            <span style={{ color: config.enabled ? '#A3C9A8' : '#999', fontSize: 11, marginLeft: 4 }}>
              {config.enabled ? t('common:status.active') : t('agents.statusDisabled')}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {toggleDisabled && toggleDisabledReason ? <Tooltip label={toggleDisabledReason}>{toggleBtn}</Tooltip> : toggleBtn}
      </div>

      {config.enabled && (
        config.handledCount > 0 ? (
          <div className={styles.statsRow}>
            <StatBadge label={t('agents.statHandled')} value={config.handledCount} />
            <StatBadge label={t('agents.statRating')} value={`${config.avgRating.toFixed(1)} ★`} />
          </div>
        ) : statsPendingCaption ? (
          <div className={styles.statLabel}>{statsPendingCaption}</div>
        ) : null
      )}

      <div className={styles.modalGrid}>
        {tokenArea}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('agents.toneLabel')}</label>
          <CustomSelect
            value={config.tone}
            options={toneOptions}
            onChange={v => onUpdate('tone', v as AgentTone)}
          />
        </div>
        <div className={styles.formGroup}>
          <Input
            label={t('agents.maxLengthLabel')}
            type="number"
            value={String(config.maxLength)}
            onChange={v => onUpdate('maxLength', Number(v))}
            min={50}
            max={4000}
            step={50}
            error={config.maxLength < 50 || config.maxLength > 4000 ? t('agents.maxLengthError') : undefined}
          />
        </div>
        {showOffHours && (
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={config.offHoursOnly}
                onChange={e => onUpdate('offHoursOnly', e.target.checked)}
                className={styles.checkbox}
              />
              <span className={styles.checkLabel}>{t('agents.offHoursLabel')}</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentSetupModal({
  config,
  isSaving,
  tgConnected,
  isVerifyingTelegram,
  igConnected,
  isConnectingInstagram,
  onToggleChannel,
  onSave,
  onVerifyTelegram,
  onDisconnectTelegram,
  onConnectInstagram,
  onDisconnectInstagram,
  onClose,
}: AgentSetupModalProps) {
  const { t, i18n } = useTranslation('ai');
  const [activeTab, setActiveTab] = useState<'telegram' | 'instagram' | 'prompt'>('telegram');
  // Тон/лимит/офчасы/промпт правятся локально до «Сохранить» — enabled/статистика
  // всегда берутся из живого config (тумблер шлёт PATCH сразу, см. useAIAgent).
  const [draft, setDraft] = useState<AgentConfig>(config);
  const [confirmDisconnect, setConfirmDisconnect] = useState<'telegram' | 'instagram' | null>(null);

  const updateChannel = (channel: 'telegram' | 'instagram', field: string, value: string | number | boolean | AgentTone) => {
    setDraft(prev => ({ ...prev, [channel]: { ...prev[channel], [field]: value } }));
  };
  const updateSystemPrompt = (prompt: string) => setDraft(prev => ({ ...prev, systemPrompt: prompt }));

  // Не даём уйти на сервер невалидному tg_max_length/ig_max_length (бэк: 50–4000).
  const maxLengthInvalid = (n: number) => n < 50 || n > 4000;
  const canSave = !maxLengthInvalid(draft.telegram.maxLength) && !maxLengthInvalid(draft.instagram.maxLength);

  // username — только для чтения (заполняется verify-эндпоинтом), не редактируется вручную —
  // берём из живого config; token остаётся в draft, пока не подтверждён «Проверить и подключить».
  const display = {
    telegram: { ...draft.telegram, enabled: config.telegram.enabled, handledCount: config.telegram.handledCount, avgRating: config.telegram.avgRating, username: config.telegram.username },
    instagram: {
      ...draft.instagram, enabled: config.instagram.enabled, handledCount: config.instagram.handledCount,
      avgRating: config.instagram.avgRating, username: config.instagram.username, expiresAt: config.instagram.expiresAt,
    },
  };

  const tgTokenTouched = draft.telegram.token.trim().length > 0;
  const tgTokenValid = TG_TOKEN_RE.test(draft.telegram.token.trim());

  const handleDisconnectTelegram = async () => {
    await onDisconnectTelegram();
    updateChannel('telegram', 'token', '');
  };

  const telegramTokenArea = (
    <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
      <label className={styles.formLabel}>{t('telegram.tokenLabel')}</label>
      <div className={styles.tokenVerifyRow}>
        <div>
          <Input
            value={draft.telegram.token}
            onChange={v => updateChannel('telegram', 'token', v)}
            placeholder={t('telegram.tokenPlaceholder')}
            monospace
            error={tgTokenTouched && !tgTokenValid ? t('telegram.tokenInvalidFormat') : undefined}
          />
        </div>
        <Button onClick={() => onVerifyTelegram(draft.telegram.token.trim())} loading={isVerifyingTelegram} disabled={!tgTokenValid}>
          {t('telegram.verifyButton')}
        </Button>
      </div>
      {display.telegram.username && (
        <div className={styles.tokenConnectedRow}>
          <span className={styles.tokenBadge}>@{display.telegram.username}</span>
          <button type="button" className={styles.tokenDisconnectBtn} onClick={() => setConfirmDisconnect('telegram')}>
            {t('telegram.disconnect')}
          </button>
        </div>
      )}
    </div>
  );

  const instagramTokenArea = (
    <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
      {igConnected ? (
        <div className={styles.tokenConnectedRow} style={{ marginTop: 0, flexWrap: 'wrap' }}>
          <span className={styles.tokenBadge}>@{display.instagram.username}</span>
          {display.instagram.expiresAt && (
            <span style={{ fontSize: 12.5, color: '#999' }}>
              {t('instagram.expiresUntil', {
                date: new Intl.DateTimeFormat(i18n.language).format(new Date(display.instagram.expiresAt)),
              })}
            </span>
          )}
          <button type="button" className={styles.tokenDisconnectBtn} onClick={() => setConfirmDisconnect('instagram')}>
            {t('instagram.disconnect')}
          </button>
        </div>
      ) : (
        <Button onClick={onConnectInstagram} loading={isConnectingInstagram}>
          {t('instagram.connectButton')}
        </Button>
      )}
    </div>
  );

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{t('agents.modalTitle')}</div>
            <div className={styles.modalSubtitle}>{t('agents.modalSubtitle')}</div>
          </div>
          <button onClick={onClose} className={styles.modalClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalTabs}>
          {([
            { id: 'telegram', label: 'Telegram' },
            { id: 'instagram', label: 'Instagram Direct' },
            { id: 'prompt', label: t('agents.tabPrompt') },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${styles.modalTab} ${activeTab === tab.id ? styles.modalTabActive : ''}`}
            >
              {tab.label}
              {(tab.id === 'telegram' || tab.id === 'instagram') && display[tab.id].enabled && (
                <PulseRingSVG active size={7} />
              )}
            </button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {activeTab === 'telegram' && (
            <ChannelSection
              label="Telegram"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.8">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              }
              config={display.telegram}
              onUpdate={(field, value) => updateChannel('telegram', field, value)}
              onToggle={() => onToggleChannel('telegram')}
              tokenArea={telegramTokenArea}
              toggleDisabled={!tgConnected}
              toggleDisabledReason={t('telegram.gateTooltip')}
              statsPendingCaption={t('telegram.statsPending')}
            />
          )}
          {activeTab === 'telegram' && !tgConnected && (
            <div className={styles.promptHint} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#1A1A1A' }}>{t('telegram.instructionTitle')}</div>
              <div>1. {t('telegram.instructionStep1')}</div>
              <div>2. {t('telegram.instructionStep2')}</div>
              <div>3. {t('telegram.instructionStep3')}</div>
              <div>4. {t('telegram.instructionStep4')}</div>
            </div>
          )}

          {activeTab === 'instagram' && (
            <ChannelSection
              label="Instagram Direct"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.8">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="#F9A08B" strokeWidth="0" />
                </svg>
              }
              config={display.instagram}
              onUpdate={(field, value) => updateChannel('instagram', field, value)}
              onToggle={() => onToggleChannel('instagram')}
              showOffHours
              tokenArea={instagramTokenArea}
              toggleDisabled={!igConnected}
              toggleDisabledReason={t('instagram.gateTooltip')}
              statsPendingCaption={t('instagram.statsPending')}
            />
          )}
          {activeTab === 'instagram' && !igConnected && (
            <div className={styles.promptHint} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#1A1A1A' }}>{t('instagram.instructionTitle')}</div>
              <div>1. {t('instagram.instructionStep1')}</div>
              <div>2. {t('instagram.instructionStep2')}</div>
              <div>3. {t('instagram.instructionStep3')}</div>
              <div>4. {t('instagram.instructionStep4')}</div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className={styles.promptSection}>
              <div className={styles.promptHint}>
                {t('agents.promptHint')}
              </div>
              <textarea
                value={draft.systemPrompt}
                onChange={e => updateSystemPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={10}
                maxLength={2000}
                placeholder={t('agents.promptPlaceholder')}
              />
              <div className={styles.promptCount}>{t('agents.promptCount', { count: draft.systemPrompt.length })}</div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.btnSecondary}>{t('common:buttons.cancel')}</button>
          <button onClick={() => onSave(draft)} className={styles.btnPrimary} disabled={isSaving || !canSave}>
            {isSaving ? t('common:buttons.saving') : t('common:buttons.save')}
          </button>
        </div>
      </div>

      {confirmDisconnect && (
        <ConfirmModal
          danger
          title={t(`${confirmDisconnect}.disconnectConfirmTitle`)}
          message={t(`${confirmDisconnect}.disconnectConfirmMessage`)}
          confirmText={t(`${confirmDisconnect}.disconnect`)}
          onConfirm={confirmDisconnect === 'telegram' ? handleDisconnectTelegram : onDisconnectInstagram}
          onClose={() => setConfirmDisconnect(null)}
        />
      )}
    </div>
  );
}
