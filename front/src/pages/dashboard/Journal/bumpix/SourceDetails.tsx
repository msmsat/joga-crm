import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/ui/index';
import { BumpixEventCard } from '../../Clients/bumpix/BumpixEventCard';
import { useBumpixProfiles } from '../../Clients/bumpix/useBumpix';
import type { SourceJournalItem } from './types';

export function SourceDetails({item}: {item: SourceJournalItem}) {
  const { t } = useTranslation('bumpix');
  const profiles = useBumpixProfiles(item.client_id, true);
  return <div>
    <p>{item.client_name} · {item.master_name || t('unknownMaster', {id:item.event.master_source_id})}</p>
    {profiles.isPending ? <p role="status">{t('loading')}</p> : profiles.isError ? <p role="alert">{t('error')} <Button variant="ghost" size="sm" onClick={()=>void profiles.refetch()}>{t('retry')}</Button></p> :
      <BumpixEventCard key={item.event.id} event={item.event} clientId={item.client_id} profiles={profiles.data ?? []}/>}
  </div>;
}
