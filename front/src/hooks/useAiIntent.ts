import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Подписка страницы на интент ассистента (эпик AI-6, задача 8).
 *
 * Ассистент не дёргает страницу напрямую и не поднимает глобальную шину
 * событий: он переводит человека по адресу с параметром — /dashboard/staff?ai=
 * staff.create. Адрес переживает перезагрузку, копируется и открывается в новой
 * вкладке; шина не умеет ничего из этого.
 *
 * Параметр вычищается из адреса сразу после срабатывания — тем же приёмом, что
 * и ?client= в Клиентах (Clients.tsx): иначе F5 повторно откроет модалку.
 *
 * Использование:
 *   useAiIntent('staff.create', () => setIsAddModalOpen(true));
 *   useAiIntent('client.open', (id) => openClient(id));
 */
export function useAiIntent(name: string, handler: (entityId: number | null) => void) {
  const [params, setParams] = useSearchParams();
  const intent = params.get('ai');
  const rawId = params.get('ai_id');

  useEffect(() => {
    if (intent !== name) return;
    const entityId = rawId ? Number(rawId) : null;
    // Сначала чистим адрес, потом зовём обработчик: обработчик может сам
    // тронуть searchParams (открыть ?client=), и обратный порядок затёр бы это.
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('ai');
      next.delete('ai_id');
      return next;
    }, { replace: true });
    handler(Number.isFinite(entityId) ? entityId : null);
    // handler у страниц — обычная стрелка, в зависимостях он давал бы повторный
    // вызов на каждый рендер. Триггер здесь ровно один: параметр в адресе.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, rawId, name]);
}
