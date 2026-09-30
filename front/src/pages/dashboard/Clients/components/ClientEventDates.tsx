import { useTranslation } from 'react-i18next';
import type { EventRecord } from '../../../../api/clients/clients.types';

function formatEventDate(value: string | null | undefined, locale: string): string | null {
  // API timestamps already use studio time. Preserve their wall clock even
  // when the viewer's browser runs in a different timezone.
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if (!parts) return null;
  const [, year, month, day, hour, minute] = parts;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +(hour ?? 0), +(minute ?? 0)));
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day
    || date.getUTCHours() !== +(hour ?? 0) || date.getUTCMinutes() !== +(minute ?? 0)) return null;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
    ...(hour !== undefined ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).format(date);
}

export function ClientEventDates({ event }: { event: EventRecord }) {
  const { t, i18n } = useTranslation('clients');
  const locale = i18n.resolvedLanguage || i18n.language;
  const rows: [string, string | null | undefined][] = [];
  if (event.type === 'booking' && event.scheduled_at) {
    rows.push(['lesson', event.scheduled_at], ['bookingCreated', event.occurred_at]);
  } else if (event.type === 'visit' && event.scheduled_at) {
    rows.push(['visit', event.scheduled_at]);
  } else if (event.type === 'cancel' && (event.occurred_at || event.scheduled_at)) {
    rows.push(['cancel', event.occurred_at]);
    if (event.scheduled_at) rows.push(['lesson', event.scheduled_at]);
  } else if (event.type === 'payment' && (event.occurred_at || event.recorded_at)) {
    rows.push([event.occurred_at ? 'payment' : 'paymentUnknown', event.occurred_at]);
    if (event.recorded_at) rows.push(['recorded', event.recorded_at]);
    if (event.scheduled_at) rows.push(['lesson', event.scheduled_at]);
  } else {
    rows.push(['event', event.occurred_at || event.date]);
  }
  return (
    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
      {rows.map(([label, value]) => {
        const formatted = formatEventDate(value, locale);
        return <div key={label}>{label === 'paymentUnknown' ? t('panel.events.dates.paymentUnknown')
          : formatted ? `${t(`panel.events.dates.${label}`)}: ${formatted}` : t('panel.events.dates.unknown')}</div>;
      })}
    </div>
  );
}
