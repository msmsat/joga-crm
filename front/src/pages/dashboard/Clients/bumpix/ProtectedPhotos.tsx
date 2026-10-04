import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Lightbox } from '../../../../components/ui/index';
import type { BumpixPhoto } from '../../../../api/clients/bumpix.types';
import { useProtectedPhotos } from './useProtectedPhotos';
import styles from './bumpix.module.css';

export function ProtectedPhotos({ clientId, photos, enabled = true, avatar, fallback }: {
  clientId: number; photos: BumpixPhoto[]; enabled?: boolean; avatar?: boolean; fallback?: ReactNode;
}) {
  const { t } = useTranslation('bumpix');
  const [requested, setRequested] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const library = useProtectedPhotos(clientId, requested ? photos : photos.slice(0, 1), enabled);
  const urls = library.urls.filter((url): url is string => url !== null);
  const cover = library.urls[0];
  const show = () => { setRequested(true); setIndex(0); };
  if (!photos.length) return <>{fallback}</>;
  return (
    <div className={avatar ? styles.avatar : styles.photos}>
      <Button variant="ghost" size="sm" onClick={show} ariaLabel={avatar ? t('profilePhoto') : t('viewPhotos')}
        style={avatar ? { padding: 0, border: 0, borderRadius: 14, width: 52, height: 52, overflow: 'hidden' }
          : { width: '100%', textAlign: 'left', justifyContent: 'flex-start', gap: 10 }}>
        {cover ? <img src={cover} alt={avatar ? t('profilePhoto') : t('photoAlt', { number: 1 })}
          className={avatar ? styles.avatarImage : styles.cover}/>
          : avatar ? fallback : <span className={styles.photoPlaceholder} aria-hidden="true">{photos.length}</span>}
        {!avatar && <span>{library.pending ? t('loading') : t('photoCount', { count: photos.length })}</span>}
      </Button>
      {library.failed > 0 && <div role="alert" className={styles.photoError}>
        <span>{t('photosError', { count: library.failed })}</span>
        <Button variant="ghost" size="sm" onClick={library.retry}>{t('retry')}</Button>
      </div>}
      {requested && library.pending && <div role="status" className={styles.loading}>{t('loading')}</div>}
      <Lightbox photos={urls} index={requested && !library.pending ? index : null} onIndex={setIndex} zIndex={20000}/>
    </div>
  );
}
