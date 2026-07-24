import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Действие по инсайту → переход в нужный раздел с нужным контекстом.
 * Набор action-строк фиксирован бэком (см. ROADMAP_REPORTS): расширять
 * список только вместе с бэком, который их генерирует.
 */
export function useInsightAction() {
  const navigate = useNavigate();

  return useCallback((action: string, params: Record<string, string | number>) => {
    switch (action) {
      case 'open_clients':
        navigate(`/dashboard/clients?filter=${encodeURIComponent(String(params.filter ?? ''))}`);
        break;
      case 'open_client':
        navigate(`/dashboard/clients?client=${params.id}`);
        break;
      case 'open_campaign':
        navigate(`/dashboard/loyalty?segment=${encodeURIComponent(String(params.segment ?? ''))}`);
        break;
      case 'add_lesson':
        navigate('/dashboard/journal', { state: { prefill: params } });
        break;
      case 'open_journal': {
        const qs = new URLSearchParams(
          Object.entries(params).reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {} as Record<string, string>),
        ).toString();
        navigate(`/dashboard/journal?${qs}`);
        break;
      }
      case 'open_trainer':
        navigate(`/dashboard/staff?staff=${params.id}`);
        break;
      case 'open_booking':
        navigate('/dashboard/booking');
        break;
    }
  }, [navigate]);
}
