export const CheckIcon = ({ size = 16, color = 'var(--peach)' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="8" fill={color} fillOpacity="0.15" />
    <path d="M4.5 8.5L6.5 10.5L11.5 5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="8" fill="rgba(102,102,102,0.08)" />
    <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="#AAAAAA" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1L8.545 5.09H13L9.5 7.56L10.91 11.5L7 9.13L3.09 11.5L4.5 7.56L1 5.09H5.455L7 1Z"
      fill={filled ? '#FCAE91' : 'none'} stroke={filled ? '#FCAE91' : '#AAAAAA'} strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

export const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M11 2L3 11H10L9 18L17 9H10L11 2Z" fill="var(--peach)" fillOpacity="0.2" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 5V10C3 14.1 6.1 17.9 10 19C13.9 17.9 17 14.1 17 10V5L10 2Z" fill="rgba(163,201,168,0.2)" stroke="var(--pistachio)" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 10L9 12L13 8" stroke="var(--pistachio)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CreditCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="4" width="16" height="12" rx="3" fill="var(--peach)" fillOpacity="0.15" stroke="var(--peach)" strokeWidth="1.5" />
    <path d="M2 8H18" stroke="var(--peach)" strokeWidth="1.5" />
    <rect x="4" y="11" width="4" height="2" rx="1" fill="var(--peach)" />
  </svg>
);

export const PercentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="6" cy="6" r="2.5" stroke="var(--peach)" strokeWidth="1.5" />
    <circle cx="14" cy="14" r="2.5" stroke="var(--peach)" strokeWidth="1.5" />
    <path d="M5 15L15 5" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="3" width="14" height="13" rx="3" stroke="var(--muted)" strokeWidth="1.5" />
    <path d="M6 2V4M12 2V4" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 7H16" stroke="var(--muted)" strokeWidth="1.5" />
    <rect x="5" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
    <rect x="8.5" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
    <rect x="12" y="10" width="2" height="2" rx="0.5" fill="var(--muted)" />
  </svg>
);

export const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="var(--muted)" strokeWidth="1.2" />
    <path d="M8 7V11" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.75" fill="var(--muted)" />
  </svg>
);

export const TrendingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 13L6 9L10 11L16 5" stroke="var(--pistachio)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 5H16V9" stroke="var(--pistachio)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 9C2 5.13 5.13 2 9 2C12.87 2 16 5.13 16 9C16 12.87 12.87 16 9 16" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 9C2 12.87 5.13 16 9 16" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    <path d="M9 5V9L12 11" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12L2 9L5 8" stroke="var(--muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 2V9M4 6.5L7 9.5L10 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 11H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L10.1 6.9L15 8L10.1 9.1L9 14L7.9 9.1L3 8L7.9 6.9L9 2Z" fill="var(--peach)" fillOpacity="0.3" stroke="var(--peach)" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M14 2L14.6 4.4L17 5L14.6 5.6L14 8L13.4 5.6L11 5L13.4 4.4L14 2Z" fill="var(--peach)" fillOpacity="0.4" />
  </svg>
);
