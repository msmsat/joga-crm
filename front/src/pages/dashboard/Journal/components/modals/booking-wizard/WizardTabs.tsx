// Шапка мастера записи — кнопки с иконками: время, клиент, услуга, мастер,
// итог (у группового занятия из журнала клиента нет — кнопок четыре).
// Кнопка — и прогресс, и переход: сделанное светится зелёным, текущий раздел
// обведён персиком, тап открывает раздел в любой момент — порядок
// не обязателен (свайп по листу листает их по очереди).
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import {
  CLIENT_STEP, MASTER_STEP, SERVICE_STEP, SUMMARY_STEP, TIME_STEP, type BookingWizardState,
} from './useBookingWizard';

const SVG = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

const ICONS: Record<'time' | 'client' | 'service' | 'master' | 'summary', ReactNode> = {
  time: <svg {...SVG}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>,
  client: <svg {...SVG}><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>,
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

export type BookingTab = { key: keyof typeof ICONS; done: boolean; conflict: boolean; current: boolean; disabled: boolean; onClick: () => void };

/** payable — запись можно подтверждать (итог светится, когда кнопка
    «Подтвердить» в подвале станет активной). */
export function WizardTabs({ w, payable }: { w: BookingWizardState; payable: boolean }) {
  const step = (s: number, key: BookingTab['key'], done: boolean): BookingTab => ({
    key, done: done && !(w.conflict && [TIME_STEP, SERVICE_STEP, MASTER_STEP].includes(s)),
    conflict: w.conflict && (s === TIME_STEP || (s === SERVICE_STEP && w.service != null)
      || (s === MASTER_STEP && w.masterChosen)), current: w.step === s,
    // Раздела может не быть вовсе: из карточки клиента он уже выбран — кнопка
    // тогда только показывает, что сделано.
    disabled: w.saving || w.step === s || !w.steps.includes(s),
    onClick: () => w.goTo(s),
  });
  const tabs: BookingTab[] = [
    step(TIME_STEP, 'time', w.done(TIME_STEP)),
    step(CLIENT_STEP, 'client', w.done(CLIENT_STEP)),
    step(SERVICE_STEP, 'service', w.done(SERVICE_STEP)),
    step(MASTER_STEP, 'master', w.done(MASTER_STEP)),
    step(SUMMARY_STEP, 'summary', payable),
  // Групповому занятию клиент не нужен — его кнопки нет вовсе.
  ].filter(tab => tab.key !== 'client' || w.steps.includes(CLIENT_STEP));
  return <BookingTabs tabs={tabs} />;
}

/** Навигация между разделами создания записи. */
export function BookingTabs({ tabs }: { tabs: BookingTab[] }) {
  const { t } = useTranslation('journal');
  return (
    <nav className="bw-tabs" aria-label={t('wizard.step', { n: tabs.findIndex(tab => tab.current) + 1, total: tabs.length })}>
      {tabs.map(tab => (
        <button key={tab.key} type="button" disabled={tab.disabled}
                className={`bw-tab${tab.done ? ' done' : ''}${tab.current ? ' current' : ''}${tab.conflict ? ' conflict' : ''}`}
                aria-invalid={tab.conflict || undefined}
                aria-current={tab.current ? 'step' : undefined} onClick={tab.onClick}>
          <span className="bw-tab-icon">
            {ICONS[tab.key]}
            {tab.done && <span className="bw-tab-badge"><Icons.Check /></span>}
          </span>
          <span className="bw-tab-label">{t(`wizard.tabs.${tab.key}`)}</span>
        </button>
      ))}
    </nav>
  );
}
