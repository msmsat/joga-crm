import type { ReactNode } from 'react';
import type { WizardStep } from '../../lib/wizard';

const SVG = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

/** Те же знаки, что у кнопок главной и вкладок мастера записи в журнале. */
export const STEP_ICONS: Record<WizardStep, ReactNode> = {
  time: <svg {...SVG}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>,
  service: (
    <svg {...SVG}>
      <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  ),
  master: (
    <svg {...SVG}>
      <rect x="4" y="3" width="16" height="18" rx="3" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17.5a4.5 4.5 0 0 1 9 0" />
    </svg>
  ),
  summary: (
    <svg {...SVG}>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="12" y2="16" />
    </svg>
  ),
};
