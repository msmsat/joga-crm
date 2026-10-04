import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../../../components/ui/index';
import type { BumpixEvent, BumpixProfile } from '../../../../api/clients/bumpix.types';
import { ProtectedPhotos } from './ProtectedPhotos';
import { eventDate, masterName, text } from './model';
import styles from './bumpix.module.css';

export function BumpixEventCard({ event, clientId, profiles }: {
  event: BumpixEvent; clientId: number; profiles: BumpixProfile[];
}) {
  const { t, i18n } = useTranslation('bumpix');
  const [expanded, setExpanded] = useState(false);
  const name = masterName(profiles.filter(p => p.source_client_id === event.source_client_id), event.master_source_id);
  const details = event.details;
  const status = ['new', 'completed', 'canceled'].includes(event.status) ? event.status : 'unknown';
  return <Card padding={16} style={{ boxShadow: 'none' }}>
    <article className={styles.event}>
      <div className={styles.eventHeader}>
        <h3>{text(details.services) || t('lesson')}</h3>
        <span className={`${styles.status} ${styles[status] ?? ''}`}>{t(`status.${status}`)}</span>
      </div>
      <div className={styles.date}>{eventDate(event.start_time, i18n.language) ?? t('unknownDate')}</div>
      <div className={styles.caption}>{t('master')}: {name ?? t('unknownMaster', { id: event.master_source_id })}</div>
      {text(details.comment) && <p className={styles.comment}>{text(details.comment)}</p>}
      <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}>
        {expanded ? t('hideDetails') : t('details')}{event.photos.length > 0 && ` · ${t('photoCount', { count: event.photos.length })}`}
      </Button>
      {expanded && <div className={styles.eventDetails}>
        <dl className={styles.fields}>
          <div><dt>{t('end')}</dt><dd>{eventDate(event.end_time, i18n.language) ?? t('unknownDate')}</dd></div>
          {(['income', 'outlay'] as const).map(field => text(details[field]) !== '' && <div key={field}>
            <dt>{t(field)}</dt><dd>{text(details[field])}</dd>
          </div>)}
          <div><dt>{t('sourceId')}</dt><dd>{event.source_event_id}</dd></div>
        </dl>
        <ProtectedPhotos clientId={clientId} photos={event.photos}/>
      </div>}
    </article>
  </Card>;
}
