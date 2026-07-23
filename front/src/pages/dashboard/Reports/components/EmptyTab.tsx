import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/ui/index';

export function EmptyTab() {
  const { t } = useTranslation('reports');
  return (
    <Card padding={48} style={{ textAlign: 'center', color: 'var(--text3)' }}>
      {t('empty.inDevelopment')}
    </Card>
  );
}
