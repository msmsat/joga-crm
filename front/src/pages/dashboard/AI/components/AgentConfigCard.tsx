import PulseRingSVG from './animations/PulseRingSVG';
import styles from '../AI.module.css';

interface AgentConfigCardProps {
  telegramEnabled: boolean;
  instagramEnabled: boolean;
  onToggleTelegram: () => void;
  onToggleInstagram: () => void;
  onOpenSetup: () => void;
}

function ChannelRow({
  icon,
  label,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.agentRow}>
      <PulseRingSVG active={enabled} size={10} />
      <span className={styles.agentIcon}>{icon}</span>
      <span className={styles.agentLabel}>{label}</span>
      <div className={styles.agentSpacer} />
      <button
        onClick={onToggle}
        className={`${styles.miniToggle} ${enabled ? styles.miniToggleOn : ''}`}
        title={enabled ? 'Выключить' : 'Включить'}
      >
        <div className={styles.miniToggleThumb} />
      </button>
    </div>
  );
}

export default function AgentConfigCard({
  telegramEnabled,
  instagramEnabled,
  onToggleTelegram,
  onToggleInstagram,
  onOpenSetup,
}: AgentConfigCardProps) {
  return (
    <div className={styles.agentCard}>
      <div className={styles.agentCardHeader}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="2.2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <span className={styles.agentCardTitle}>AI-агенты</span>
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
      />

      <button onClick={onOpenSetup} className={styles.agentSetupBtn}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Настроить агентов
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
