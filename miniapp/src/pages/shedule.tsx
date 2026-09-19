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
  /** Услуга из QR-кода студии: открыть раздел с уже выбранной услугой. */
  focusServiceId?: number;
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
export default function Shedule({ catalog, onBuySubscription, onNeedAuth, focusLesson, focusServiceId }: SheduleProps) {
  const { t } = useTranslation();
  const mode = catalog?.booking_capabilities.booking_mode ?? 'event';
  // Ссылка на УСЛУГУ сама говорит, какой это раздел, — но не словом в адресе, а
  // механикой услуги в каталоге: напечатанный код переживает превращение услуги
  // из групповой в индивидуальную. Каталог приезжает позже первого кадра,
  // поэтому раздел ВЫЧИСЛЯЕТСЯ, а не выставляется эффектом.
  const focusMode = focusServiceId != null
    ? catalog?.services.find((service) => service.id === focusServiceId)?.booking_mode
    : undefined;

  // Выбор человека сильнее ссылки — но только после того, как он его сделал.
  // `null` — «ещё не переключал»: тогда раздел называет ссылка, а по умолчанию
  // открыта индивидуальная запись. Ссылка на занятие — всегда групповой раздел:
  // индивидуальная запись идёт от мастера, занятия с номером там нет.
  const [picked, setPicked] = useState<ScheduleView | null>(focusLesson ? 'event' : null);
  const view: ScheduleView = picked
    ?? (focusMode === 'event' ? 'event' : 'resource');
  const showResource = mode === 'resource' || (mode === 'hybrid' && view === 'resource');
  const rules = catalog?.rules ?? null;

  // Расчёт, quote и подтверждение — тот же домен, что у записи с главной и
  // переноса в «Моих записях»: экран добавляет шаги ДО выбора времени, а не
  // вторую механику брони.
  const resource = useResourceBooking({ onNeedAuth, catalog });
  const segment = mode === 'hybrid' ? <ModeSwitch value={view} onChange={setPicked} /> : null;

  return (
    <>
      {mode !== 'event' && (
        <div hidden={!showResource}>
          <ScreenHeader kicker={catalog?.studio.name} title={t('booking.title')} />
          {segment}
          {rules && !rules.booking_active && <BookingClosedNotice />}
          <BookingPage catalog={catalog} resource={resource} focusServiceId={focusMode === 'resource' ? focusServiceId : undefined} />
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
            focusServiceId={focusMode === 'event' ? focusServiceId : undefined}
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
