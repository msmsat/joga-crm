import { useTranslation } from 'react-i18next';
import { CalendarClock, CircleCheck, CircleHelp, CircleX, Clock3, CreditCard, Ticket, UserCheck, UserRoundX } from 'lucide-react';
import type { EventRecord } from '../../../../api/clients/clients.types';
import type { LucideIcon } from 'lucide-react';
const icons: Record<string, LucideIcon> = {upcoming: CalendarClock, ongoing: Clock3, completed: CircleCheck, cancelled: CircleX,
  expected: CalendarClock, attended: UserCheck, missed: UserRoundX, unknown: CircleHelp, paid: CreditCard, unpaid: CreditCard, subscription: Ticket, free: Ticket};
export function ClientEventStatus({ event }: { event: EventRecord }) {
  const { t } = useTranslation('clients');
  const states = [['appointment', event.appointment_status], ['attendance', event.attendance_status], ['payment', event.payment_status]] as const;
  return <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px'}}>
    {states.map(([kind, state]) => {
      if (!state || (kind === 'attendance' && (state === 'cancelled' || state === 'expected'))) return null;
      const Icon=icons[state];
      const color=state === 'missed' || state === 'cancelled' ? '#B75B70' : state === 'paid' || state === 'attended' ? '#36824B' : 'var(--text2)';
      return <span key={kind} style={{display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, color, background: 'rgba(var(--ink),.035)'}}>
        <Icon size={12} aria-hidden="true"/>{t(`panel.events.statuses.${kind}.${state}`)}
      </span>;
    })}
  </div>;
}
