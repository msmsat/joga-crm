import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/ui/index';
import { getActiveContextKey } from '../../../../utils/auth';
import { sourceDetail } from './api';
import { SourceDetails } from './SourceDetails';
import styles from './journalSource.module.css';

export function NativeSourceDetails({lessonId}: {lessonId:number}) {
  const {t} = useTranslation('bumpix');
  const query = useQuery({queryKey:['bumpixNativeSource',getActiveContextKey(),lessonId],queryFn:({signal})=>sourceDetail(lessonId,signal),retry:false});
  if (query.isError) return <p role="alert">{t('journal.sourceError')} <Button variant="ghost" size="sm" onClick={()=>void query.refetch()}>{t('retry')}</Button></p>;
  if (!query.data) return null;
  return <section className={styles.native}>
    <h3>{t('journal.title')}</h3>
    <p className={styles.notice}>{t('journal.paymentUnknown')}</p>
    <SourceDetails item={query.data}/>
  </section>;
}
