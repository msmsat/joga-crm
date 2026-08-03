import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../../components/ui/Tooltip';
import { InfoHint } from '../../../../components/ui/index';
import PulseRingSVG from './animations/PulseRingSVG';
import styles from '../AI.module.css';

interface AgentConfigCardProps {
  telegramEnabled: boolean;
  telegramConnected: boolean;
  instagramEnabled: boolean;
  instagramConnected: boolean;
  whatsappEnabled: boolean;
  whatsappConnected: boolean;
  onToggleTelegram: () => void;
  onToggleInstagram: () => void;
  onToggleWhatsapp: () => void;
  onOpenSetup: () => void;
}

// Строка канала: плитка-иконка держит состояние цветом, под названием — словесный
// статус. Раньше «выключен» и «не подключён» выглядели одинаково (просто серый
// тумблер), и понять, почему агент молчит, было нельзя.
function ChannelRow({
  icon,
  label,
  enabled,
  connected,
  onToggle,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  connected: boolean;
  onToggle: () => void;
  disabledReason: string;
}) {
  const { t } = useTranslation('ai');
  const on = enabled && connected;
  const toggle = (
    <button
      onClick={onToggle}
      disabled={!connected}
      className={`${styles.miniToggle} ${on ? styles.miniToggleOn : ''}`}
      title={!connected ? undefined : enabled ? t('agents.disable') : t('agents.enable')}
    >
      <div className={styles.miniToggleThumb} />
    </button>
  );
  return (
    <div className={`${styles.agentRow} ${on ? styles.agentRowOn : ''}`}>
      <span className={styles.agentIconTile}>{icon}</span>
      <span className={styles.agentRowText}>
        <span className={styles.agentLabel}>{label}</span>
        <span className={`${styles.agentState} ${on ? styles.agentStateOn : ''}`}>
          {on && <PulseRingSVG active size={9} />}
          {!connected ? t('agents.stateOffline') : on ? t('agents.stateOn') : t('agents.statusDisabled')}
        </span>
      </span>
      <div className={styles.agentSpacer} />
      {connected ? toggle : <Tooltip label={disabledReason}>{toggle}</Tooltip>}
    </div>
  );
}

// Тело поповера «что такое AI-агенты»: короткий лид + три выгоды с персиковыми
// плитками. Плитки залиты градиентом, а глиф — тёмный литерал: заливка одинакова
// в обеих темах, поэтому контраст не зависит от того, светлая плашка или тёмная.
function AgentInfoBody() {
  const { t } = useTranslation('ai');
  const items = [
    {
      key: 'b1',
      icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    },
    {
      key: 'b2',
      icon: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    },
    {
      key: 'b3',
      icon: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2.2" /><circle cx="15" cy="12" r="2.2" /><circle cx="7" cy="18" r="2.2" /></>,
    },
  ];

  return (
    <div className={styles.agentInfo}>
      <div className={styles.agentInfoLead}>{t('agents.info.lead')}</div>
      <div className={styles.agentInfoList}>
        {items.map(({ key, icon }) => (
          <div key={key} className={styles.agentInfoItem}>
            <span className={styles.agentInfoIcon}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </span>
            <span className={styles.agentInfoText}>{t(`agents.info.${key}`)}</span>
          </div>
        ))}
      </div>
      <div className={styles.agentInfoDivider} />
      <div className={styles.agentInfoNote}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M13 2L4.5 13H12l-1 9 8.5-11H12l1-9z" />
        </svg>
        {t('agents.info.note')}
      </div>
    </div>
  );
}

export default function AgentConfigCard({
  telegramEnabled,
  telegramConnected,
  instagramEnabled,
  instagramConnected,
  whatsappEnabled,
  whatsappConnected,
  onToggleTelegram,
  onToggleInstagram,
  onToggleWhatsapp,
  onOpenSetup,
}: AgentConfigCardProps) {
  const { t } = useTranslation('ai');
  const activeCount = [
    telegramEnabled && telegramConnected,
    instagramEnabled && instagramConnected,
    whatsappEnabled && whatsappConnected,
  ].filter(Boolean).length;

  return (
    <div className={styles.agentCard}>
      <div className={styles.agentCardHeader}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="2.2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <span className={styles.agentCardTitle}>{t('agents.title')}</span>
        <span className={styles.agentInfoBtn}>
          <InfoHint side="right" title={t('agents.info.title')} text={<AgentInfoBody />} />
        </span>
        <span className={`${styles.agentCount} ${activeCount ? styles.agentCountOn : ''}`}>
          {/* именно active, а не count: count включил бы плюрализацию i18next */}
          {t('agents.activeCount', { active: activeCount, total: 3 })}
        </span>
      </div>

      <ChannelRow
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
          </svg>
        }
        label="Telegram"
        enabled={telegramEnabled}
        onToggle={onToggleTelegram}
        connected={telegramConnected}
        disabledReason={t('telegram.gateTooltip')}
      />

      <ChannelRow
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" strokeWidth="0" />
          </svg>
        }
        label="Instagram"
        enabled={instagramEnabled}
        onToggle={onToggleInstagram}
        connected={instagramConnected}
        disabledReason={t('instagram.gateTooltip')}
      />

      <ChannelRow
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        }
        label="WhatsApp"
        enabled={whatsappEnabled}
        onToggle={onToggleWhatsapp}
        connected={whatsappConnected}
        disabledReason={t('whatsapp.gateTooltip')}
      />

      <button onClick={onOpenSetup} className={styles.agentSetupBtn}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        {t('agents.configureButton')}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
