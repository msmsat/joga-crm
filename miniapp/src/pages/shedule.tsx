import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PhoneSheet from '../components/modals/PhoneSheet';
import SubscriptionSheet from '../components/modals/SubscriptionSheet';
import ModeSwitch, { type ScheduleView } from '../components/schedule/ModeSwitch';
import BookingClosedNotice from '../components/schedule/BookingClosedNotice';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import BookingPage from './booking/BookingPage';
import EventSchedule from './schedule/EventSchedule';
import { useResourceBooking } from '../hooks/useResourceBooking';
import type { StudioCatalog } from '../api/studio';

interface SheduleProps {
  catalog: StudioCatalog | null;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** Занятие из QR-кода студии: открыть его день и сам лист брони. */
  focusLesson?: { id: number; date?: string };
}

/**
 * Вкладка записи. Режим студии решает, ЧТО это за экран (MA-01, §4.4).
 *
 * `event` — расписание занятий по дням, как и было. `resource` — запись к
 * мастеру: услуги-фильтр и мастера, без календаря над ними (pages/booking).
 * `hybrid` — оба раздела под переключателем: индивидуальная запись первой,
 * потому что записаться — действие, а расписание групп — справка.
 *
 * Оба раздела гибридной студии остаются смонтированными и прячутся атрибутом:
 * переключение не теряет ни выбранного мастера, ни пролистанную неделю.
 */
export default function Shedule({ catalog, onBuySubscription, onNeedAuth, focusLesson }: SheduleProps) {
  const { t } = useTranslation();
  const mode = catalog?.booking_capabilities.booking_mode ?? 'event';
  // Ссылка на занятие открывает групповой раздел: индивидуальная запись идёт
  // от мастера, занятия с номером там нет.
  const [view, setView] = useState<ScheduleView>(focusLesson ? 'event' : 'resource');
  const showResource = mode === 'resource' || (mode === 'hybrid' && view === 'resource');
  const rules = catalog?.rules ?? null;

  // Расчёт, quote и подтверждение — тот же домен, что у записи с главной и
  // переноса в «Моих записях»: экран добавляет шаги ДО выбора времени, а не
  // вторую механику брони.
  const resource = useResourceBooking({ onNeedAuth, catalog });
  const segment = mode === 'hybrid' ? <ModeSwitch value={view} onChange={setView} /> : null;

  return (
    <>
      {mode !== 'event' && (
        <div hidden={!showResource}>
          <ScreenHeader kicker={catalog?.studio.name} title={t('booking.title')} />
          {segment}
          {rules && !rules.booking_active && <BookingClosedNotice />}
          <BookingPage catalog={catalog} resource={resource} />
        </div>
      )}

      {mode !== 'resource' && (
        <div hidden={showResource}>
          <EventSchedule
            catalog={catalog}
            onBuySubscription={onBuySubscription}
            onNeedAuth={onNeedAuth}
            segment={segment}
            focusLesson={focusLesson}
          />
        </div>
      )}

      <PhoneSheet
        isOpen={resource.needsPhone}
        onClose={resource.closePhone}
        onSaved={resource.retryAfterPhone}
        layer={3}
      />

      <SubscriptionSheet
        isOpen={resource.needsSubscription !== null}
        onClose={resource.closeSubscription}
        message={resource.needsSubscription}
        onBuy={() => { resource.closeSubscription(); onBuySubscription(); }}
      />
    </>
  );
}
