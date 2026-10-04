import { useTranslation } from 'react-i18next';
import type { BumpixProfile } from '../../../../api/clients/bumpix.types';
import { Button, Card } from '../../../../components/ui/index';
import { birthday, categoryNames, text } from './model';
import styles from './bumpix.module.css';

export function BumpixProfileData({ profiles, error, retry }: {
  profiles: BumpixProfile[]; error: boolean; retry: () => void;
}) {
  const { t, i18n } = useTranslation('bumpix');
  if (error) return <div className={styles.error} role="alert">
    <p>{t('error')}</p><Button variant="ghost" size="sm" onClick={retry}>{t('retry')}</Button>
  </div>;
  if (!profiles.length) return null;
  return <div className={styles.profiles}>
    {profiles.map(profile => {
      const fields: [string, string][] = [
        ['name', text(profile.profile.name)], ['phone', text(profile.profile.phone)],
        ['phone2', text(profile.profile.phone2)], ['email', text(profile.profile.email)],
        ['address', text(profile.profile.address)], ['birthday', birthday(profile.profile.birthday, i18n.language) ?? ''],
        ['balance', text(profile.profile.balance)], ['discount', text(profile.profile.discount)],
        ['categories', categoryNames(profile)],
      ];
      return <Card key={profile.snapshot_id} padding={16} style={{ boxShadow: 'none' }}>
        <details className={styles.profileDetails}>
          <summary>{t('profile')} <span className={styles.sourceId}>#{profile.source_client_id}</span></summary>
          <dl className={styles.fields}>
            {fields.filter(([, value]) => value !== '').map(([label, value]) => <div key={label}>
              <dt>{t(label)}</dt><dd>{value}</dd>
            </div>)}
          </dl>
          {text(profile.profile.comment) && <div className={styles.note}>
            <strong>{t('sourceNote')}</strong><p>{text(profile.profile.comment)}</p>
          </div>}
          <div className={styles.caption}>{t('importedAt', { date: new Intl.DateTimeFormat(i18n.language,
            { dateStyle: 'medium' }).format(new Date(profile.imported_at)) })}</div>
        </details>
      </Card>;
    })}
  </div>;
}
