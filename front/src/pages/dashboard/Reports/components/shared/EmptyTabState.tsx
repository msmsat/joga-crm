import { useTranslation } from 'react-i18next';
import { Card, EmptyState, Button } from '../../../../../components/ui/index';
import type { EmptyStateProps } from '../../../../../components/ui/index';

export interface EmptyTabStateProps {
  icon: EmptyStateProps['icon'];
  onWiden: () => void;
}

// Пустое состояние вкладки целиком (аудит 10) — тулбар остаётся над ним,
// меняется только тело вкладки.
export function EmptyTabState({ icon, onWiden }: EmptyTabStateProps) {
  const { t } = useTranslation('reports');

  return (
    <Card style={{ minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        size="lg"
        icon={icon}
        title={t('empty.noData.title')}
        text={t('empty.noData.text')}
        action={<Button size="sm" variant="ghost" onClick={onWiden}>{t('empty.noData.widen')}</Button>}
      />
    </Card>
  );
}
