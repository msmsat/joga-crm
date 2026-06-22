import { useState } from 'react';
import type { AgentConfig, AgentTone } from '../../types';
import PulseRingSVG from '../animations/PulseRingSVG';
import CustomSelect from '../CustomSelect';
import styles from '../../AI.module.css';

interface AgentSetupModalProps {
  config: AgentConfig;
  saved: boolean;
  onUpdateChannel: (channel: 'telegram' | 'instagram', field: string, value: string | number | boolean | AgentTone) => void;
  onUpdateSystemPrompt: (prompt: string) => void;
  onToggleChannel: (channel: 'telegram' | 'instagram') => void;
  onSave: () => void;
  onClose: () => void;
}

const TONE_OPTIONS: { value: AgentTone; label: string }[] = [
  { value: 'friendly', label: 'Дружелюбный' },
  { value: 'formal', label: 'Формальный' },
  { value: 'neutral', label: 'Нейтральный' },
];

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statBadge}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function ChannelSection({
  channel,
  label,
  icon,
  config,
  onUpdate,
  onToggle,
  showOffHours,
}: {
  channel: 'telegram' | 'instagram';
  label: string;
  icon: React.ReactNode;
  config: AgentConfig['telegram'];
  onUpdate: (field: string, value: string | number | boolean | AgentTone) => void;
  onToggle: () => void;
  showOffHours?: boolean;
}) {
  return (
    <div className={styles.channelSection}>
      <div className={styles.channelHeader}>
        <div className={styles.channelIconWrap}>{icon}</div>
        <div>
          <div className={styles.channelName}>{label}</div>
          <div className={styles.channelStatus}>
            <PulseRingSVG active={config.enabled} size={8} />
            <span style={{ color: config.enabled ? '#A3C9A8' : '#999', fontSize: 11, marginLeft: 4 }}>
              {config.enabled ? 'Активен' : 'Выключен'}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={onToggle}
          className={`${styles.toggleSwitch} ${config.enabled ? styles.toggleSwitchOn : ''}`}
        >
          <div className={styles.toggleThumb} />
        </button>
      </div>

      {config.enabled && config.handledCount > 0 && (
        <div className={styles.statsRow}>
          <StatBadge label="Обработано" value={config.handledCount} />
          <StatBadge label="Оценка" value={`${config.avgRating.toFixed(1)} ★`} />
        </div>
      )}

      <div className={styles.modalGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>API Token</label>
          <input
            type="password"
            value={config.token}
            onChange={e => onUpdate('token', e.target.value)}
            placeholder={channel === 'telegram' ? '1234567890:ABC...' : 'EAABsbCS...'}
            className={styles.formInput}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Username / Bot</label>
          <input
            type="text"
            value={config.username}
            onChange={e => onUpdate('username', e.target.value)}
            placeholder={channel === 'telegram' ? '@velora_bot' : 'velora.studio'}
            className={styles.formInput}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Тон ответа</label>
          <CustomSelect
            value={config.tone}
            options={TONE_OPTIONS}
            onChange={v => onUpdate('tone', v as AgentTone)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Макс. длина ответа (символов)</label>
          <input
            type="number"
            value={config.maxLength}
            onChange={e => onUpdate('maxLength', Number(e.target.value))}
            min={50}
            max={2000}
            step={50}
            className={styles.formInput}
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
              <span className={styles.checkLabel}>Автоответ только вне рабочих часов</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentSetupModal({
  config,
  saved,
  onUpdateChannel,
  onUpdateSystemPrompt,
  onToggleChannel,
  onSave,
  onClose,
}: AgentSetupModalProps) {
  const [activeTab, setActiveTab] = useState<'telegram' | 'instagram' | 'prompt'>('telegram');

  return (
    <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Настройка AI-агентов</div>
            <div className={styles.modalSubtitle}>Автоматические ответы в мессенджерах</div>
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
            { id: 'prompt', label: 'Системный промпт' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${styles.modalTab} ${activeTab === tab.id ? styles.modalTabActive : ''}`}
            >
              {tab.label}
              {(tab.id === 'telegram' || tab.id === 'instagram') && config[tab.id].enabled && (
                <PulseRingSVG active size={7} />
              )}
            </button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {activeTab === 'telegram' && (
            <ChannelSection
              channel="telegram"
              label="Telegram"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.8">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              }
              config={config.telegram}
              onUpdate={(field, value) => onUpdateChannel('telegram', field, value)}
              onToggle={() => onToggleChannel('telegram')}
            />
          )}

          {activeTab === 'instagram' && (
            <ChannelSection
              channel="instagram"
              label="Instagram Direct"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.8">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1.2" fill="#F9A08B" strokeWidth="0" />
                </svg>
              }
              config={config.instagram}
              onUpdate={(field, value) => onUpdateChannel('instagram', field, value)}
              onToggle={() => onToggleChannel('instagram')}
              showOffHours
            />
          )}

          {activeTab === 'prompt' && (
            <div className={styles.promptSection}>
              <div className={styles.promptHint}>
                Этот текст определяет личность агента — как он общается, что знает, каких тем избегает.
              </div>
              <textarea
                value={config.systemPrompt}
                onChange={e => onUpdateSystemPrompt(e.target.value)}
                className={styles.promptTextarea}
                rows={10}
                placeholder="Ты — вежливый ассистент студии..."
              />
              <div className={styles.promptCount}>{config.systemPrompt.length} / 2000 символов</div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.btnSecondary}>Отмена</button>
          <button onClick={onSave} className={styles.btnPrimary}>
            {saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Сохранено
              </>
            ) : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
