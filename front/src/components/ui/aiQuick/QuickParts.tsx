import styles from './aiQuick.module.css';

// Искра — тот же символ, что у кнопки «AI» и строки ассистента в шапке.
const SPARK = 'M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z';

export function VeloraOrb({ busy }: { busy: boolean }) {
  return (
    <span className={`${styles.orb}${busy ? ` ${styles.orbBusy}` : ''}`} aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d={SPARK} /></svg>
    </span>
  );
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...line} strokeWidth={2.4}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...line} strokeWidth={2.4}>
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

// Пузырь чата со стрелкой наружу: «этот разговор — целиком, в чате».
export function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...line}>
      <path d="M20 12.5a7.5 7.5 0 01-11.1 6.6L4 20l1-4.4A7.5 7.5 0 1120 12.5z" />
      <polyline points="10.5 9.5 14 9.5 14 13" /><line x1="14" y1="9.5" x2="9.5" y2="14" />
    </svg>
  );
}

export function PlanIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...line}>
      <rect x="4" y="4" width="16" height="16" rx="4" /><polyline points="8.5 12 11 14.5 15.5 9.5" />
    </svg>
  );
}

export function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...line} strokeWidth={2.4}>
      <polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 102.1-9.4L1 10" />
    </svg>
  );
}

// Иконки подсказок: день, люди, деньги — по смыслу вопроса, а не одна на всех.
export function TodayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...line}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" /><line x1="3.5" y1="10" x2="20.5" y2="10" />
      <line x1="8" y1="3" x2="8" y2="6.5" /><line x1="16" y1="3" x2="16" y2="6.5" />
    </svg>
  );
}

export function InactiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...line}>
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" />
      <circle cx="18" cy="15" r="3.5" /><polyline points="18 13.5 18 15 19 16" />
    </svg>
  );
}

export function RevenueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...line}>
      <polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />
    </svg>
  );
}
