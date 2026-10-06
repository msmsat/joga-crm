import { useEffect, useState } from 'react';
import { getUserSubscription, type UserSubscription } from '../api/user';
import { useLessonsVersion } from '../lib/revision';

type Loaded = { active: UserSubscription | null; failed: boolean };

/**
 * Действующий абонемент человека — для карты на главной.
 *
 * Гостю не спрашивается вовсе: абонемента у него нет, и запрос был бы 401.
 * Перечитывается после брони и отмены (остаток занятий изменился) и когда
 * каталог перечитан после покупки (`refresh` — его ссылка). Свежий ответ едет
 * поверх прежнего: карта не мигает заглушкой на каждой записи.
 *
 * Ошибка — не «абонемента нет»: тогда карта не обещает купить то, что у
 * человека, возможно, уже есть, а просто не показывается.
 */
export function useMySubscription(signedIn: boolean, refresh: unknown) {
  const version = useLessonsVersion();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    getUserSubscription()
      .then((rows) => {
        if (!cancelled) setLoaded({ active: rows.find((row) => row.status === 'active') ?? null, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ active: null, failed: true });
      });
    return () => { cancelled = true; };
  }, [signedIn, version, refresh]);

  return {
    /** Ответа ещё не было ни разу — держать место под карту. */
    loading: signedIn && loaded === null,
    active: signedIn ? loaded?.active ?? null : null,
    failed: signedIn && Boolean(loaded?.failed),
  };
}
