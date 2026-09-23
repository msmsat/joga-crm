import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { setSpaceTerms } from '../i18n';
import { settingsApi } from '../api/settings/settings.api';
import type { BookingMode, BusinessMessage, TerminologyProfile } from '../api/booking/hybrid.types';
import { getActiveContextKey } from '../utils/auth';

function subscribe(callback: () => void) {
  window.addEventListener('auth-context-changed', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('auth-context-changed', callback);
    window.removeEventListener('storage', callback);
  };
}

export function useBusinessTerms(mode: BookingMode = 'resource', override?: TerminologyProfile | null) {
  const context = useSyncExternalStore(subscribe, getActiveContextKey);
  const { i18n } = useTranslation();
  const query = useQuery({
    queryKey: ['businessTerms', context, i18n.language],
    queryFn: () => settingsApi.getGeneral(i18n.language),
    enabled: Boolean(context), staleTime: 60_000, refetchInterval: 60_000,
  });
  const config = query.data?.terminology;
  const profile = config?.profiles[override ?? config.profile];
  const staff = profile?.staff;
  const offering = profile?.offering[mode];
  const space = profile?.space;
  // Слово студии уезжает в i18n как переменная по умолчанию: подписи каталога,
  // журнала и отчётов подставляют его сами, без третьего аргумента в каждом
  // t(). Отдаём только слово САМОЙ студии — предпросмотр чужого профиля в
  // настройках (override) не должен переименовывать интерфейс вокруг себя.
  const ownSpace = override ? config?.profiles[config.profile]?.space : space;
  // Зависимость — сам объект: react-query держит ссылку стабильной, пока ответ
  // не изменился (структурное разделение), а повторный вызов с тем же словом
  // всё равно ничего не делает — setSpaceTerms сравнивает значения.
  useEffect(() => { setSpaceTerms(ownSpace); }, [ownSpace]);
  return {
    ready: Boolean(profile), staff, offering, space, capabilities: query.data?.booking_capabilities,
    // Участвует ли место в расписании У ЭТОЙ СТУДИИ: отрасль плюс тумблер
    // владельца, посчитанные сервером. `undefined`, пока термины не пришли —
    // это НЕ «нет»: колонку залов лучше показать на кадр позже, чем спрятать
    // у студии, которая ей пользуется.
    spaceIsAxis: query.data?.booking_capabilities?.space_is_axis,
    // Значение по умолчанию для самой отрасли, без тумблера. Нужно карточке
    // настроек, чтобы честно подписать, от чего владелец отступает.
    industrySpaceIsAxis: profile?.space_is_axis,
    // Готовый набор для интерполяции в подписи интерфейса. Три формы — потолок:
    // подписи написаны так, чтобы род и лишние падежи не требовались, иначе
    // «Новый зал» превращался бы в «Новый кресло».
    spaceVars: space
      ? { space: space.singular, spacePlural: space.plural, spaceAcc: space.accusative }
      : {},
    message: (key: BusinessMessage): string => profile ? String(i18n.t(`business:${key}`, {
      lng: config!.locale, defaultValue: profile.messages[key], staff, offering,
    })) : '…',
  };
}

/** Подпись роли в КОМАНДЕ СВОЕЙ СТУДИИ: «тренер» у студии и спорта, «мастер» у
 *  бьюти, «специалист» у остальных — слово приходит с сервера, как и для места
 *  (services/terminology.py). Владелец и администратор от отрасли не зависят и
 *  остаются словарными.
 *
 *  Списки ЧУЖИХ студий (выбор кабинета, профиль, страница приглашения) зовут
 *  словарь напрямую и дальше: там роль относится к другой студии, а слово
 *  отсюда — только текущей.
 */
export function useRoleLabel() {
  const { t, i18n } = useTranslation(['staff']);
  const { staff } = useBusinessTerms();
  return useCallback((role?: string | null): string => {
    if (!role) return '';
    // Слова словаря хранятся строчными — подпись роли открывает строку, поэтому
    // тот же formatter, что и у {{space, capitalize}} в локалях.
    if (role === 'trainer' && staff) {
      return i18n.services.formatter?.format(staff.singular, 'capitalize', i18n.language) ?? staff.singular;
    }
    return t(`staff:roles.${role}`, { defaultValue: role });
  }, [t, i18n, staff]);
}
