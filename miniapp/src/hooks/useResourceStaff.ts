import { useEffect, useState } from 'react';
import { hybridApi } from '../api/hybrid.api';
import type { ResourceStaffMember } from '../api/hybrid.types';
import type { ApiError } from '../api/client';

/**
 * Мастера филиала для экрана «Записатись» — ВСЕ, без фильтра по услуге.
 *
 * Фильтр по услуге делается на экране по `service_ids`: один ответ сервера
 * обслуживает и «Усі послуги», и любой чип, и переключение чипов не стоит
 * запроса и скелета. Сервер свою проверку делает дальше — в quote и confirm.
 *
 * ОТВЕТ ПОМЕЧЕН СВОИМ ЗАПРОСОМ. Хранится не «список», а «список вместе с
 * филиалом и попыткой, по которым его спросили»: ответ прошлого филиала не
 * отрисуется, даже если приедет последним.
 *
 * «ЕЩЁ НЕ ЗНАЕМ» — НЕ «НИКОГО НЕТ». До ответа `staff === null`, и экран обязан
 * показывать загрузку, а не пустое состояние.
 */
type Loaded = { key: string; staff: ResourceStaffMember[] | null; reason: string | null; error: ApiError | null };

export function useResourceStaff(branchId: number | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = branchId ? `${branchId}|${attempt}` : null;

  useEffect(() => {
    if (key === null || branchId === null) return;
    let cancelled = false;
    hybridApi
      .resourceStaff({ branch_id: branchId })
      .then((data) => {
        if (!cancelled) setLoaded({ key, staff: data.staff, reason: data.reason, error: null });
      })
      .catch((error: ApiError) => {
        if (!cancelled) setLoaded({ key, staff: null, reason: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [key, branchId]);

  const fresh = loaded && loaded.key === key ? loaded : null;
  return {
    /** `null` — ответа нет (грузится или ошибка). `[]` — ответ «никого». */
    staff: fresh?.staff ?? null,
    reason: fresh?.reason ?? null,
    error: fresh?.error ?? null,
    isLoading: key !== null && fresh === null,
    retry: () => setAttempt((value) => value + 1),
  };
}
