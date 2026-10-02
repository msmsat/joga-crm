import EventSchedule from './schedule/EventSchedule';
import type { StudioCatalog } from '../api/studio';

interface SheduleProps {
  catalog: StudioCatalog | null;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** Занятие из QR-кода студии: открыть его день и сам лист брони. */
  focusLesson?: { id: number; date?: string };
  /** Услуга из QR-кода студии: расписание с ней в фильтре. */
  focusServiceId?: number;
  /** Сотрудник из QR-кода студии: расписание с ним в фильтре. */
  focusStaffId?: number;
}

/**
 * Вкладка «Расписание» — групповые занятия по дням.
 *
 * Она есть ровно у студий, у которых есть расписание групп (`event` и
 * `hybrid`, см. `visibleNavItems`). Индивидуальная запись живёт только мастером
 * на главной: прежний экран «Записаться» со списком мастеров повторял его
 * «Мастер» и «Услугу», и у человека было два способа сделать одно и то же.
 *
 * QR-коды делятся так же (`lib/entry.wizardFocusOf`): занятие, групповая
 * услуга и тренер студии групп — сюда; мастер и индивидуальная услуга — в
 * мастер записи на главной.
 */
export default function Shedule({ catalog, onBuySubscription, onNeedAuth, focusLesson, focusServiceId, focusStaffId }: SheduleProps) {
  const mode = catalog?.booking_capabilities.booking_mode ?? 'event';
  // Механику услуги называет каталог, а не ссылка: напечатанный код переживает
  // превращение услуги из групповой в индивидуальную. Каталог к этому моменту
  // уже загружен — App не рисует разделы до него.
  const isGroupService = focusServiceId != null
    && catalog?.services.find((service) => service.id === focusServiceId)?.booking_mode === 'event';

  return (
    <EventSchedule
      catalog={catalog}
      onBuySubscription={onBuySubscription}
      onNeedAuth={onNeedAuth}
      focusLesson={focusLesson}
      focusServiceId={isGroupService ? focusServiceId : undefined}
      focusStaffId={mode === 'event' ? focusStaffId : undefined}
    />
  );
}
