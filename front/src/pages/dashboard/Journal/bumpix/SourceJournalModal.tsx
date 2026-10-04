import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, Button } from '../../../../components/ui/index';
import type { SourceJournalItem } from './types';
import { SourceDetails } from './SourceDetails';
import { eventDate } from '../../Clients/bumpix/model';
import styles from './journalSource.module.css';

export function SourceJournalModal({items, initial, onClose}: {items: SourceJournalItem[]; initial?: SourceJournalItem; onClose: ()=>void}) {
  const {t, i18n} = useTranslation('bumpix');
  const [selected,setSelected] = useState(initial);
  const [limit,setLimit] = useState(50);
  return <ModalShell onClose={onClose} maxWidth="680px" enterSubmits={false} zIndex={10020}>
    <ModalHeader title={t('journal.title')}/>
    <ModalBody>
      <p className={styles.notice}>{t('journal.historyNotice')}</p>
      {selected ? <>
        {!initial && <Button variant="ghost" size="sm" onClick={()=>setSelected(undefined)}>{t('journal.back')}</Button>}
        <SourceDetails key={selected.event.id} item={selected}/>
      </> : <div className={styles.list}>
        {items.slice(0,limit).map(item=><Button key={item.event.id} variant="ghost" onClick={()=>setSelected(item)}>
          <span className={styles.row}><strong>{item.client_name}</strong><span>{eventDate(item.event.start_time,i18n.language)}</span><span>{String(item.event.details.services || t('lesson'))}</span><small>{item.master_name} · {t(`status.${item.event.status}`)}</small></span>
        </Button>)}
        {limit<items.length && <Button variant="ghost" onClick={()=>setLimit(v=>v+50)}>{t('more')}</Button>}
      </div>}
    </ModalBody>
  </ModalShell>;
}
