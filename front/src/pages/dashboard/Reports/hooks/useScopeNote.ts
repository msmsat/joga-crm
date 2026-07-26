import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type FilterKey = 'branch' | 'hall' | 'trainer' | 'service';

const PARAM_BY_FILTER: Record<FilterKey, string> = {
  branch: 'branch_id', hall: 'hall_id', trainer: 'trainer_id', service: 'service_id',
};

// Какие фильтры метрика физически не умеет применять → пометка при их активности
// (см. матрицу применимости в EPIC_R13_HONEST_FILTERS.md).
const UNSUPPORTED: Record<'money' | 'clientBase', FilterKey[]> = {
  money: ['branch', 'hall'],                            // Operation не привязан к залу
  clientBase: ['branch', 'hall', 'trainer', 'service'],  // registration_date, сегменты
};

/**
 * Текст тултипа «по всей студии», когда хоть один неприменимый к метрике
 * фильтр сейчас активен в URL. Читает фильтры напрямую из searchParams —
 * не требует прокидывать params через дерево компонентов.
 */
export function useScopeNote(kind: keyof typeof UNSUPPORTED): string | undefined {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('reports');
  return useMemo(() => {
    const active = UNSUPPORTED[kind].some(f => searchParams.get(PARAM_BY_FILTER[f]));
    return active ? t(`scopeNote.${kind}`) : undefined;
  }, [kind, searchParams, t]);
}
