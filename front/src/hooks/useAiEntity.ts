import { useEffect } from 'react';

/**
 * Какая карточка открыта прямо сейчас — для ассистента.
 *
 * Зачем это отдельно от адреса. Ассистент уже получает `current_page`, но
 * идентификатора в нём нет: параметр `?client=` Клиенты вычищают из адреса
 * сразу после открытия панели (Clients.tsx), а журнал и каталог открывают
 * карточки вовсе локальным состоянием. Поэтому «покажи её расписание» на
 * карточке клиента модель через раз резолвила в тренера — не потому что плохо
 * думает, а потому что ей не сказали.
 *
 * Почему модуль-переменная, а не контекст. Значение нужно ровно в одной точке и
 * ровно в один момент — когда `useAssistant` отправляет сообщение. Контекст
 * заставил бы перерисовываться всё поддерево на каждое открытие карточки ради
 * данных, которые никто не рисует.
 *
 * Отправляем ТИП и ЧИСЛОВОЙ id, без имени: имя с экрана сервер всё равно не
 * примет — он читает название сам и под правами спрашивающего
 * (back/services/ai_entity.py).
 *
 * Использование:
 *   useAiEntity('client', isPanelOpen ? activeClientId : null);
 */
export type AiEntityType = 'client' | 'staff' | 'lesson' | 'reservation' | 'hall';

export interface AiEntity {
  type: AiEntityType;
  id: number;
}

let openEntity: AiEntity | null = null;

/** Текущая открытая карточка или null. Читается в момент отправки сообщения. */
export function currentAiEntity(): AiEntity | null {
  return openEntity;
}

export function useAiEntity(type: AiEntityType, id: number | null | undefined) {
  useEffect(() => {
    if (id == null || !Number.isFinite(id)) return;
    openEntity = { type, id };
    return () => {
      // Снимаем только СВОЮ запись: карточки закрываются не в том порядке, в
      // котором открывались, и безусловный сброс стирал бы чужую, ещё живую.
      if (openEntity?.type === type && openEntity?.id === id) openEntity = null;
    };
  }, [type, id]);
}
