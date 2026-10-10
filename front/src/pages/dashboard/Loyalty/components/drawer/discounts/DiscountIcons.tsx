import type { TemplateKey } from './discountModel';

// Иконки панели скидок — inline SVG, как во всём проекте (эмодзи запрещены).
// Один размер сетки 24, одна толщина штриха: рядом стоят плитками и не должны
// спорить друг с другом весом.

interface P { size?: number }

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IconSprout = ({ size = 18 }: P) => svg(size, <>
  <path d="M12 21v-8" /><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6Z" /><path d="M12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5Z" />
</>);

export const IconCake = ({ size = 18 }: P) => svg(size, <>
  <path d="M4 21h16" /><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
  <path d="M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0" /><path d="M12 12V8" />
  <path d="M12 3.5c.9.9.9 2.2 0 3-.9-.8-.9-2.1 0-3Z" />
</>);

export const IconGem = ({ size = 18 }: P) => svg(size, <>
  <path d="M6 4h12l3 5-9 11L3 9l3-5Z" /><path d="M3 9h18" /><path d="m9 4 3 16 3-16" />
</>);

export const IconPulse = ({ size = 18 }: P) => svg(size, <>
  <path d="M3 12h4l2.5-6 4 12L16 12h5" />
</>);

export const IconMoon = ({ size = 18 }: P) => svg(size, <>
  <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
</>);

export const IconTicket = ({ size = 18 }: P) => svg(size, <>
  <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z" />
  <path d="M13 6v2M13 11v2M13 16v2" />
</>);

export const IconUsers = ({ size = 18 }: P) => svg(size, <>
  <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
  <path d="M16 5.2a3 3 0 0 1 0 5.6" /><path d="M17.5 13.6A5.5 5.5 0 0 1 20.5 19" />
</>);

export const IconLayers = ({ size = 18 }: P) => svg(size, <>
  <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" />
</>);

export const IconUserCheck = ({ size = 18 }: P) => svg(size, <>
  <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="m15.5 11.5 2 2 4-4" />
</>);

export const IconInfinity = ({ size = 18 }: P) => svg(size, <>
  <path d="M7 15.5a3.5 3.5 0 1 1 0-7c3.5 0 6.5 7 10 7a3.5 3.5 0 1 0 0-7c-3.5 0-6.5 7-10 7Z" />
</>);

export const IconTarget = ({ size = 18 }: P) => svg(size, <>
  <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" />
</>);

export const IconPlus = ({ size = 16 }: P) => svg(size, <><path d="M12 5v14M5 12h14" /></>);

export const IconBack = ({ size = 18 }: P) => svg(size, <><path d="M15 5 8 12l7 7" /></>);

export const IconChevron = ({ size = 16, dir = 'right' }: P & { dir?: 'left' | 'right' }) =>
  svg(size, <path d={dir === 'right' ? 'm9 5 7 7-7 7' : 'm15 5-7 7 7 7'} />);

export const IconTrash = ({ size = 16 }: P) => svg(size, <>
  <path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7l1 13h10l1-13" />
</>);

export const IconCalendar = ({ size = 16 }: P) => svg(size, <>
  <rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" />
</>);

export const IconX = ({ size = 12 }: P) => svg(size, <><path d="M18 6 6 18M6 6l12 12" /></>);

export const IconCheck = ({ size = 12 }: P) => svg(size, <><path d="m5 12.5 4.5 4.5L19 7.5" /></>);

export const IconLayersStack = ({ size = 16 }: P) => svg(size, <>
  <rect x="4" y="9" width="16" height="11" rx="2.5" /><path d="M7 6h10M9.5 3h5" />
</>);

export const IconCoins = ({ size = 16 }: P) => svg(size, <>
  <ellipse cx="9" cy="7" rx="5.5" ry="2.5" /><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
  <path d="M9.5 16.4c.9.4 2.1.6 3.5.6 3 0 5.5-1.1 5.5-2.5v-4c0-1-1.2-1.9-3-2.3" />
</>);

export const IconSparkle = ({ size = 16 }: P) => svg(size, <>
  <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
</>);

/** Значок шаблона скидки — один и в пустом списке, и в новом редакторе. */
export function TemplateIcon({ name, size = 18 }: { name: TemplateKey | 'blank'; size?: number }) {
  switch (name) {
    case 'birthday': return <IconCake size={size} />;
    case 'newcomers': return <IconSprout size={size} />;
    case 'comeback': return <IconMoon size={size} />;
    case 'passes': return <IconTicket size={size} />;
    case 'week': return <IconCalendar size={size} />;
    case 'blank': return <IconSparkle size={size} />;
  }
}
