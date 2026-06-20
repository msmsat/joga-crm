import React from 'react';

// ─── ЛОГОТИП ────────────────────────────────────────────────────────────────
export const LogoMark = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" {...props}>
    <rect x="3" y="3" width="6" height="6" rx="2" fill="white" opacity="0.95" />
    <rect x="11" y="3" width="6" height="6" rx="2" fill="white" opacity="0.6" />
    <rect x="3" y="11" width="6" height="6" rx="2" fill="white" opacity="0.6" />
    <rect x="11" y="11" width="6" height="6" rx="2" fill="white" opacity="0.95" />
  </svg>
);

// ─── СОЦИАЛЬНЫЕ СЕТИ ────────────────────────────────────────────────────────
export const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" {...props}>
    <path d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z" fill="#4285F4"/>
    <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
    <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4068 3.78409 7.8299 3.96409 7.2899V4.9581H0.957275C0.347727 6.1731 0 7.5477 0 9C0 10.4522 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
    <path d="M9 3.5795C10.3214 3.5795 11.5077 4.0336 12.4405 4.9254L15.0218 2.344C13.4632 0.8918 11.4259 0 9 0C5.48182 0 2.43818 2.0168 0.957275 4.9581L3.96409 7.2899C4.67182 5.1627 6.65591 3.5795 9 3.5795Z" fill="#EA4335"/>
  </svg>
);

// ─── ИКОНКИ ПОЛЕЙ ВВОДА (Используют currentColor) ───────────────────────────
export const MailIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const PhoneIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="4" y="1.5" width="8" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="12.5" r="0.75" fill="currentColor" />
    <path d="M6.5 3.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const UserIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 13.5C2 11.0147 4.68629 9 8 9C11.3137 9 14 11.0147 14 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const LockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="10.5" r="1" fill="currentColor" />
  </svg>
);

export const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const EyeOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" {...props}>
    <path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 2L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// ─── УТИЛИТЫ И БЕЗОПАСНОСТЬ ─────────────────────────────────────────────────
export const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" {...props}>
    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ErrorIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...props}>
    <circle cx="6" cy="6" r="5.5" stroke="var(--rose)" />
    <path d="M6 3.5V6.5" stroke="var(--rose)" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="6" cy="8.5" r="0.75" fill="var(--rose)" />
  </svg>
);

export const ArrowLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...props}>
    <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShieldIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...props}>
    <path d="M6.5 1L1.5 3V6.5C1.5 9.26142 3.73858 11.5 6.5 12C9.26142 11.5 11.5 9.26142 11.5 6.5V3L6.5 1Z" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M4.5 6.5L5.9 7.9L8.5 5" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DocumentIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...props}>
    <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="var(--pistachio)" strokeWidth="1.3" />
    <path d="M4 6.5H9M6.5 4V9" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const CircleCheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...props}>
    <circle cx="6.5" cy="6.5" r="5" stroke="var(--pistachio)" strokeWidth="1.3" />
    <path d="M4 6.5L5.8 8.3L9 5" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export interface IconProps {
  className?: string;
  color?: string;
  size?: number;
}

const defaultProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icon = {
  Plus: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  Chat: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  ),
  Phone: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  ),
  Message: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  ),
  Profile: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  Settings: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} stroke={color}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  Close: ({ size = 20, color = 'currentColor', className }: IconProps) => (
    <svg width={size} height={size} className={className} {...defaultProps} strokeWidth="2.5" stroke={color}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  ),
};

// ─── ИКОНКИ ЖУРНАЛА (JOURNAL ICONS) ─────────────────────────────────────────

export const Calendar = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

export const ChevronLeft = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

export const ChevronRight = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// Переопределяем Plus индивидуально для Журнала (в объекте Icon уже есть свой Plus, конфликта не будет)
export const Plus = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const Filter = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);

export const Users = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

export const Clock = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

export const Search = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const X = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export const MapPin = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

export const Check = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const Today = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

export const List = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

export const Grid = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);

export const Edit = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export const Trash = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg 
    className={`icon-trash ${className || ''}`.trim()} 
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}
  >
    <path className="trash-lid" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path className="trash-bin" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

export const Bell = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

export const UserPlus = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
  </svg>
);

// ─── СЛОЖНЫЕ ИЛЛЮСТРАЦИИ С АНИМАЦИЯМИ (ANIMATED ILLUSTRATIONS) ──────────────

export const EmptyIllustration = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="120" height="100" viewBox="0 0 120 100" fill="none" {...props}>
    <style>{`
      @keyframes float-empty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      @keyframes pulse-dot { 0%,100%{opacity:0.3} 50%{opacity:1} }
      .empty-float { animation: float-empty 3s ease-in-out infinite; }
      .pdot1 { animation: pulse-dot 1.5s ease-in-out infinite; }
      .pdot2 { animation: pulse-dot 1.5s ease-in-out 0.5s infinite; }
      .pdot3 { animation: pulse-dot 1.5s ease-in-out 1s infinite; }
    `}</style>
    <g className="empty-float">
      <rect x="20" y="20" width="80" height="60" rx="10" fill="rgba(252,174,145,0.08)" stroke="rgba(252,174,145,0.3)" strokeWidth="1.5"/>
      <line x1="35" y1="38" x2="85" y2="38" stroke="rgba(252,174,145,0.3)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="35" y1="50" x2="70" y2="50" stroke="rgba(252,174,145,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="35" y1="62" x2="60" y2="62" stroke="rgba(252,174,145,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="60" cy="22" r="10" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.4)" strokeWidth="1.5"/>
      <line x1="60" y1="18" x2="60" y2="26" stroke="rgba(252,174,145,0.6)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="56" y1="22" x2="64" y2="22" stroke="rgba(252,174,145,0.6)" strokeWidth="2" strokeLinecap="round"/>
    </g>
    <circle className="pdot1" cx="46" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
    <circle className="pdot2" cx="60" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
    <circle className="pdot3" cx="74" cy="90" r="3" fill="rgba(252,174,145,0.4)"/>
  </svg>
);

export const LoadingBarsIllustration = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="48" height="32" viewBox="0 0 48 32" fill="none" {...props}>
    <style>{`
      @keyframes bar-grow { 0%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} 100%{transform:scaleY(0.3)} }
      .bar1{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0s}
      .bar2{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.2s}
      .bar3{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.4s}
      .bar4{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.6s}
      .bar5{animation:bar-grow 1.4s ease-in-out infinite;transform-origin:bottom;animation-delay:0.8s}
    `}</style>
    <rect className="bar1" x="2" y="8" width="6" height="24" rx="3" fill="rgba(249,160,139,0.7)"/>
    <rect className="bar2" x="11" y="4" width="6" height="28" rx="3" fill="rgba(91,171,114,0.7)"/>
    <rect className="bar3" x="20" y="12" width="6" height="20" rx="3" fill="rgba(64,168,160,0.7)"/>
    <rect className="bar4" x="29" y="6" width="6" height="26" rx="3" fill="rgba(74,128,196,0.7)"/>
    <rect className="bar5" x="38" y="10" width="6" height="22" rx="3" fill="rgba(123,108,212,0.7)"/>
  </svg>
);

export const ScheduleIllustration = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="100%" height="56" viewBox="0 0 200 56" fill="none" preserveAspectRatio="xMidYMid meet" {...props}>
    <style>{`
      @keyframes slide-in { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
      .si1{animation:slide-in 0.5s ease forwards;animation-delay:0.1s;opacity:0}
      .si2{animation:slide-in 0.5s ease forwards;animation-delay:0.3s;opacity:0}
      .si3{animation:slide-in 0.5s ease forwards;animation-delay:0.5s;opacity:0}
      .si4{animation:slide-in 0.5s ease forwards;animation-delay:0.7s;opacity:0}
    `}</style>
    <rect x="0" y="4" width="200" height="48" rx="8" fill="rgba(252,174,145,0.05)"/>
    <g className="si1">
      <rect x="8" y="10" width="44" height="18" rx="4" fill="rgba(249,160,139,0.25)"/>
      <rect x="10" y="13" width="24" height="3" rx="1.5" fill="rgba(249,160,139,0.6)"/>
      <rect x="10" y="19" width="14" height="2" rx="1" fill="rgba(249,160,139,0.35)"/>
    </g>
    <g className="si2">
      <rect x="58" y="28" width="44" height="18" rx="4" fill="rgba(91,171,114,0.25)"/>
      <rect x="60" y="31" width="24" height="3" rx="1.5" fill="rgba(91,171,114,0.6)"/>
      <rect x="60" y="37" width="14" height="2" rx="1" fill="rgba(91,171,114,0.35)"/>
    </g>
    <g className="si3">
      <rect x="108" y="10" width="44" height="18" rx="4" fill="rgba(64,168,160,0.25)"/>
      <rect x="110" y="13" width="24" height="3" rx="1.5" fill="rgba(64,168,160,0.6)"/>
      <rect x="110" y="19" width="14" height="2" rx="1" fill="rgba(64,168,160,0.35)"/>
    </g>
    <g className="si4">
      <rect x="156" y="20" width="36" height="18" rx="4" fill="rgba(123,108,212,0.25)"/>
      <rect x="158" y="23" width="20" height="3" rx="1.5" fill="rgba(123,108,212,0.6)"/>
      <rect x="158" y="29" width="12" height="2" rx="1" fill="rgba(123,108,212,0.35)"/>
    </g>
  </svg>
);