import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import CoffeeStrip from '../mylessons/CoffeeStrip';
import ReviewBlock from '../mylessons/review/ReviewBlock';
import LessonTicket from '../mylessons/lesson/LessonTicket';
import LessonPayment from '../mylessons/lesson/LessonPayment';
import LessonLogistics from '../mylessons/lesson/LessonLogistics';
import LessonAboutBlock from '../mylessons/lesson/LessonAboutBlock';
import LessonFooter from '../mylessons/lesson/LessonFooter';
import { canPay } from '../mylessons/lesson/paymentState';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useLessonAbout } from '../../lib/lessonAbout';
import type { CalendarEvent } from '../../lib/calendar';
import type { StudioCatalog } from '../../api/studio';
import type {
  CoffeeState,
  PastLessonResponse,
  UpcomingLessonResponse,
} from '../../api/lessons';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  lesson: MyLesson | null;
  /** Занятие уже прошло: вместо отмены и кофе — оценка. */
  isPast: boolean;
  /** Название на языке интерфейса — переводит страница (у неё словарь занятий). */
  title: string;
  /** «пятница, 12 октября» — формат и локаль тоже знает страница. */
  dateLabel: string;
  /** «Залишилось 2г 15хв» — тикает на странице, здесь только показываем. */
  countdown?: string;
  /** Каталог студии: филиал с адресом, фото ведущего, правило отмены, описание. */
  catalog: StudioCatalog | null;
  isProcessing?: boolean;
  onCancel?: () => void;
  /** HB-21: перенос индивидуальной записи. Кнопки нет, пока сервер не
   *  положил `reschedule` в allowed_actions этой брони. */
  onReschedule?: () => void;
  onCoffeeChange?: (state: CoffeeState) => void;
  /** Открыть форму оплаты картой (useLessonPay). Кнопка — только при `pay`. */
  onPay?: () => void;
  paying?: boolean;
  /** Stripe ещё подтверждает оплату этой брони. */
  awaitingPayment?: boolean;
  onCheckPayment?: () => void;
  checkingPayment?: boolean;
  /** Контакты студии — лист поддержки поверх этого. */
  onContact?: () => void;
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * «Моё занятие» — билет, чек оплаты и всё, что нужно, чтобы дойти.
 *
 * Лист собирает части и ничего не решает сам: что клиенту можно (оплатить,
 * перенести, отменить), решил сервер в `allowed_actions`, а правила окна
 * отмены лист лишь пересказывает словами из правил студии в каталоге.
 *
 * Отдельно от BookingModal намеренно: там лист решает задачу «записаться» —
 * свободные места, цена, выбор коврика. Здесь всё это уже позади: время,
 * место, оплата и дорога.
 *
 * На десктопе лист будущего занятия — консоль: билет и «О занятии» живут
 * левой колонкой, оплата и дорога — правой. На телефоне и у прошедшего
 * занятия всё одной колонкой, билет первым.
 */
export default function MyLessonModal({
  isOpen,
  onClose,
  lesson,
  isPast,
  title,
  dateLabel,
  countdown,
  catalog,
  isProcessing = false,
  onCancel,
  onReschedule,
  onCoffeeChange,
  onPay,
  paying = false,
  awaitingPayment = false,
  onCheckPayment,
  checkingPayment = false,
  onContact,
}: Props) {
  const { t, i18n } = useTranslation();
  const isDesktop = useIsDesktop();
  const business = useBusinessTerms(lesson?.booking_mode ?? 'event');
  const aboutOf = useLessonAbout(catalog);

  const cancelled = lesson?.status === 'cancelled';
  const upcoming = Boolean(lesson) && !isPast && !cancelled;
  const branches = catalog?.branches ?? [];
  const branch = branches.find((row) => row.id === lesson?.branch_id) ?? (branches.length === 1 ? branches[0] : undefined);
  // Адрес студии обычно уже с городом («Vinohradská 42, Praha 2») — город
  // отдельно только когда адреса нет вовсе.
  const address = branch ? branch.address || branch.city || '' : '';
  // На билете — филиал по имени, когда их несколько; один — тогда адрес.
  const ticketPlace = branch ? (branches.length > 1 ? branch.name : address || branch.name) : undefined;
  const about = lesson ? aboutOf(lesson) : null;
  const tz = lesson?.tz_iana || catalog?.studio.tz_iana || undefined;
  const start = lesson ? new Date(lesson.starts_at ?? lesson.start_time) : null;

  const calendar: CalendarEvent | undefined = upcoming && lesson && start
    ? {
        uid: `velora-reservation-${lesson.reservation_id}@velora`,
        title: catalog?.studio.name ? `${title} · ${catalog.studio.name}` : title,
        start,
        durationMin: lesson.duration_min,
        location: address || undefined,
        details: lesson.teacher,
      }
    : undefined;

  // Окно отмены — словами правила студии. Решает всё равно сервер: кнопка
  // «Отменить» есть, только пока он кладёт `cancel` в allowed_actions.
  let cancelNote: string | undefined;
  if (upcoming && lesson && start && catalog) {
    const minutes = catalog.rules.cancellation_deadline_min;
    if (!lesson.allowed_actions.includes('cancel')) cancelNote = t('lessonSheet.cancel.closed');
    else if (minutes <= 0) cancelNote = t('lessonSheet.cancel.until_start');
    else {
      const deadline = new Date(start.getTime() - minutes * 60_000);
      const when = deadline.toLocaleString(i18n.language, {
        weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: tz,
      });
      cancelNote = t('lessonSheet.cancel.until', { when });
    }
  }

  const ticket = lesson && (
    <LessonTicket
      lesson={lesson}
      isPast={isPast}
      countdown={countdown}
      staffLabel={business.staff?.singular ? capitalize(business.staff.singular) : t('resource.staff')}
      photoUrl={about?.trainer?.photo_url}
      place={ticketPlace}
    />
  );
  const aboutBlock = about && <LessonAboutBlock about={about} />;
  // Консоль — только у будущего занятия: правую колонку заполняют оплата и
  // дорога. У прошедшего и отменённого справа остались бы бейдж и сердца
  // посреди пустого окна — им обычный лист.
  const wide = isDesktop && upcoming;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      kicker={dateLabel}
      title={title}
      aside={wide ? <div className="flex flex-col gap-4 p-6">{ticket}{aboutBlock}</div> : undefined}
      footer={
        // У прошедшего занятия действий нет: отменять нечего, а оценка стоит
        // в самом листе — кнопкой во всю ширину её делать не за что.
        upcoming && (onCancel || onReschedule) ? (
          <LessonFooter
            key={lesson?.reservation_id}
            onCancel={onCancel}
            onReschedule={onReschedule}
            processing={isProcessing}
            when={`${dateLabel}, ${lesson?.time ?? ''}`}
          />
        ) : undefined
      }
    >
      {lesson && (
        <div className="flex flex-col gap-3">
          {!wide && ticket}

          <LessonPayment
            lesson={lesson}
            isPast={isPast}
            payable={canPay(lesson) && Boolean(onPay)}
            paying={paying}
            onPay={() => onPay?.()}
            awaiting={awaitingPayment}
            checking={checkingPayment}
            onCheck={lesson.status === 'hold' || awaitingPayment ? onCheckPayment : undefined}
          />

          {upcoming && (
            <LessonLogistics
              place={address ? { address } : undefined}
              calendar={calendar}
              onContact={onContact}
              cancelNote={cancelNote}
            />
          )}

          {/* Кофе — то, что клиент может изменить у будущего занятия, кроме
              самой записи. Состояние общее с карточкой списка. */}
          {upcoming && lesson.coffee.enabled && onCoffeeChange && (
            <div className="rounded-[22px] bg-background px-4 py-3.5">
              <CoffeeStrip variant="sheet" lessonId={lesson.id} coffee={lesson.coffee} onChange={onCoffeeChange} />
            </div>
          )}

          {/* Впечатление — тот же блок, что в карточке списка, из той же записи
              хранилища: оценка здесь сразу видна там, и наоборот. */}
          {isPast && !cancelled && 'review_photos' in lesson && (
            <div className="mt-1">
              <ReviewBlock
                variant="sheet"
                reservationId={lesson.reservation_id}
                canRate={lesson.allowed_actions.includes('rate')}
                teacher={lesson.teacher}
                color={lesson.color}
              />
            </div>
          )}

          {!wide && aboutBlock}
        </div>
      )}
    </Sheet>
  );
}
