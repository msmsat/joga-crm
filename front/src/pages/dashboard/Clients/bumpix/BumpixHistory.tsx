import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Select } from '../../../../components/ui/index';
import type { BumpixFilter, BumpixProfile } from '../../../../api/clients/bumpix.types';
import { BumpixEventCard } from './BumpixEventCard';
import { uniqueEvents } from './model';
import { useBumpixEvents } from './useBumpix';
import styles from './bumpix.module.css';

const FILTERS = ['all_source', 'all', 'new', 'completed', 'canceled', 'history', 'online'] as const;

export function BumpixHistory({ clientId, profiles }: { clientId: number; profiles: BumpixProfile[] }) {
  const { t } = useTranslation('bumpix');
  const [filter, setFilter] = useState<BumpixFilter>('all_source');
  const query = useBumpixEvents(clientId, filter);
  const events = uniqueEvents(query.data?.pages ?? []);
  const counts = Object.fromEntries(FILTERS.map(f => [f, profiles.reduce((n, p) => n + (p.counts[f] ?? 0), 0)]));
  return <section className={styles.history} aria-label={t('title')}>
    <div><h2>{t('title')}</h2><p className={styles.caption}>{t('subtitle')}</p></div>
    <label className={styles.filter}><span>{t('filter')}</span>
      <Select value={filter} onChange={value => setFilter(value as BumpixFilter)}
        options={FILTERS.filter(f => f !== 'online' || counts.online > 0)
          .map(f => ({ value: f, label: t(`filters.${f}`), hint: String(counts[f]) }))}/>
    </label>
    {query.isPending && <div role="status" className={styles.loading}>{t('loading')}</div>}
    {query.isError && <div role="alert" className={styles.error}>
      <p>{t('error')}</p><Button variant="ghost" size="sm" onClick={() => { void query.refetch(); }}>{t('retry')}</Button>
    </div>}
    {!query.isPending && !query.isError && events.length === 0 && <EmptyState icon="calendar" size="sm" title={t('empty')}/>}
    {events.map(event => <BumpixEventCard key={event.id} event={event} clientId={clientId} profiles={profiles}/>)}
    {query.data && <div className={styles.caption} aria-live="polite">
      {t('loaded', { shown: events.length, total: query.data.pages[0].total })}
    </div>}
    {query.hasNextPage && <Button variant="ghost" fullWidth loading={query.isFetchingNextPage}
      onClick={() => { void query.fetchNextPage(); }}>{t('more')}</Button>}
  </section>;
}
