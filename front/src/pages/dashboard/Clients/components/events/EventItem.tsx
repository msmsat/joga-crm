import { useTranslation } from 'react-i18next';
import {
  CalendarCheck, CalendarClock, CalendarX2, Check, CircleHelp, Clock, Coins, CreditCard,
  Gift, Snowflake, SunSnow, Ticket, UserRoundX, Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EventRecord } from '../../../../../api/clients/clients.types';
import { NotePhotos } from '../../../../../components/ui/index';
import { formatMoney } from '../../../../../lib/money';
import { describeDates, eventAmount, toneOf, type EventTone } from '../../utils/clientEvents';
import styles from './ClientEvents.module.css';

const ICONS: Record<EventTone, LucideIcon> = {
  upcoming: CalendarClock, ongoing: Clock, attended: Check, missed: UserRoundX, done: CalendarCheck,
  cancelled: CalendarX2, payment: Wallet, bonusIn: Gift, bonusOut: Coins, freeze: Snowflake, unfreeze: SunSnow,
};

/** Как оплачено занятие. «Неизвестно» не показываем: это шум, а не факт. */
const PAY: Record<string, { icon: LucideIcon; tone?: 'good' | 'bad' }> = {
  paid: { icon: CreditCard, tone: 'good' },
  unpaid: { icon: CreditCard, tone: 'bad' },
  subscription: { icon: Ticket },
  free: { icon: Gift },
};

export function EventItem({ event, currency }: { event: EventRecord; currency?: string }) {
  const { t, i18n } = useTranslation('clients');
  const locale = i18n.resolvedLanguage || i18n.language;
  const tone = toneOf(event);
  const Icon = ICONS[tone];
  const { when, notes } = describeDates(event, t, locale);
  const title = event.subject || freezeTitle(event, tone, t) || event.title;
  const value = valueOf(event, tone, currency, t);
  const pay = tone !== 'cancelled' && event.payment_status ? PAY[event.payment_status] : undefined;

  return (
    <li className={`${styles.item} ${styles[tone]}`}>
      <span className={styles.node} aria-hidden="true"><Icon size={15} strokeWidth={2.2}/></span>
      <div className={styles.body}>
        <div className={styles.line}>
          <span className={styles.state}>{t(`panel.events.state.${tone}`)}</span>
          {when && <span className={styles.when}>{when}</span>}
        </div>
        <div className={styles.line}>
          <span className={styles.title}>{title}</span>
          {value && <span className={styles.value}>{value}</span>}
        </div>
        {(event.trainer || pay || tone === 'done') && (
          <div className={styles.meta}>
            {event.trainer && <span>{event.trainer}</span>}
            {pay && <Chip icon={pay.icon} tone={pay.tone}>{t(`panel.events.pay.${event.payment_status}`)}</Chip>}
            {tone === 'done' && <Chip icon={CircleHelp}>{t('panel.events.noMark')}</Chip>}
          </div>
        )}
        {notes.map(note => <span key={note} className={styles.metaNote}>{note}</span>)}
        {event.notes && <div className={styles.note}>{event.notes}</div>}
        <NotePhotos photos={event.photos ?? []}/>
      </div>
    </li>
  );
}

function Chip({ icon: Icon, tone, children }: { icon: LucideIcon; tone?: 'good' | 'bad'; children: string }) {
  const toneClass = tone === 'good' ? styles.chipGood : tone === 'bad' ? styles.chipBad : '';
  return <span className={`${styles.chip} ${toneClass}`}><Icon size={12} aria-hidden="true"/>{children}</span>;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Заморозка клиента целиком (не абонемента) приходит с серверной фразой по-русски — называем сами. */
function freezeTitle(event: EventRecord, tone: EventTone, t: Translate): string | null {
  if (event.type !== 'freeze' || !event.freeze_action) return null;
  return t(tone === 'unfreeze' ? 'panel.events.unfrozenClient' : 'panel.events.frozenClient');
}

function valueOf(event: EventRecord, tone: EventTone, currency: string | undefined, t: Translate): string | null {
  const n = eventAmount(event);
  if (n === null) return null;
  if (event.type === 'payment') return formatMoney(n, currency);
  if (event.type === 'bonus') {
    return t('panel.events.points', { count: Math.abs(n), sign: tone === 'bonusOut' ? '−' : '+' });
  }
  return null;
}
