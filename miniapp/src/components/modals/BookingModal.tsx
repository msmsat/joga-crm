import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import { useTelegram } from '../../hooks/useTelegram';
import { layoutRows } from '../../lib/hall';
import { bookingState } from '../../lib/booking';
import type { LessonResponse } from '../../api/lessons';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSpot: number | null;
  onSpotSelect: (spot: number) => void;
  isProcessing: boolean;
  onPay: () => void;
  onCancel: () => void;
  lesson: LessonResponse | null;
  /** «Повторная запись» в правилах студии: на одном занятии можно занять
   *  второй коврик (пришла с подругой). Выключена — у своей брони остаётся
   *  только отмена. */
  allowRepeat?: boolean;
  /** Поверх листа расписания — иначе бронь открывается под ним. */
  layer?: number;
}

export default function BookingModal({
  isOpen,
  onClose,
  selectedSpot,
  onSpotSelect,
  isProcessing,
  onPay,
  onCancel,
  lesson,
  allowRepeat = false,
  layer = 0,
}: BookingModalProps) {
  const { t } = useTranslation();
  const { vibrateLight } = useTelegram();

  const total = lesson?.total_spots || 0;
  const taken = lesson?.taken_spots?.length || 0;
  const left = total - taken;
  // Что предлагает лист (отмена / запись / второй коврик / закрыто) решает
  // bookingState — там же это и проверяется без DOM (lib/booking.check.ts).
  // Свой занятый коврик в сетке всё равно погашен: taken_spots приходит со
  // всеми бронями, включая собственную.
  const { isBooked, isClosed, canBookMore, showGrid } = bookingState(lesson, allowRepeat);

  const facts = [
    {
      label: t('bookingModal.level'),
      value: lesson?.level
        ? t(`lesson.level.${lesson.level}`, { defaultValue: lesson.level })
        : '—',
    },
    {
      label: t('bookingModal.spots'),
      value: left > 0 ? t('bookingModal.spots_count', { left, total }) : t('bookingModal.no_spots'),
    },
    {
      label: t('bookingModal.equipment'),
      value: lesson?.equipment
        ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment })
        : '—',
    },
    {
      label: t('bookingModal.price'),
      // Подарок студии виден там же, где обычно стоит цена: иначе человек
      // выбирает коврик, глядя на сумму, которую с него не возьмут.
      value: lesson?.trial_available ? t('bookingModal.free') : lesson?.price_str ?? '—',
    },
  ];

  const initials = (lesson?.teacher ?? '')
    .split(' ')
    .map((part) => part[0])
    .join('');

  const rows = layoutRows(total);
  // Ширину коврика задаёт самый длинный (первый) ряд — иначе коврики «плывут»
  // в размере от ряда к ряду, а короткий ряд должен просто встать по центру.
  // Потолок в 58px — для малых залов: на четыре коврика в ряд доля ширины
  // выходит под 70px, и зал распухал по высоте вместе с ними (aspect).
  const columns = rows[0]?.length || 1;
  const matBasis = `calc((100% - ${(columns - 1) * 8}px) / ${columns})`;
  const matWidth = `min(${matBasis}, 58px)`;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      kicker={`${
        lesson?.equipment
          ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment })
          : t('bookingModal.training')
      } · ${lesson?.time ?? ''}`}
      title={
        lesson?.name ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name }) : ''
      }
      footer={
        canBookMore ? (
          // Оба действия сразу: занять ещё один коврик — главное, отмена своей
          // брони — вторым. Одно из них прятать нельзя, они не исключают друг друга.
          <div className="flex flex-col gap-2">
            <SheetAction onClick={onPay} disabled={isProcessing || !selectedSpot}>
              {isProcessing ? t('bookingModal.processing') : t('bookingModal.book_more')}
            </SheetAction>
            <SheetAction tone="danger" onClick={onCancel} disabled={isProcessing}>
              {t('bookingModal.cancel_booking')}
            </SheetAction>
          </div>
        ) : isBooked ? (
          <SheetAction tone="danger" onClick={onCancel} disabled={isProcessing}>
            {isProcessing ? t('bookingModal.processing') : t('bookingModal.cancel_booking')}
          </SheetAction>
        ) : isClosed ? (
          <SheetAction onClick={onClose} disabled>
            {t('bookingModal.not_bookable')}
          </SheetAction>
        ) : (
          <SheetAction onClick={onPay} disabled={isProcessing || !selectedSpot}>
            {isProcessing
              ? t('bookingModal.processing')
              : /* Кнопка называет то, что произойдёт по нажатию: бронь. Денег
                   она не берёт НИКОГДА — занятие покрывается абонементом,
                   дарится или оплачивается в студии (POST /checkout/pay
                   доступен только владельцу и администратору). Цена стоит
                   строкой «Стоимость» выше, а «Оплатить · 500 ₴» здесь
                   обещало списание, которого нет, — и то же занятие потом
                   показывалось в «Моих занятиях» как «Не оплачено». */
                lesson?.trial_available
                ? t('bookingModal.book_trial')
                : t('bookingModal.book')}
          </SheetAction>
        )
      }
    >
      {/* Тренер и параметры — одной карточкой. Раздельная плитка 2×2 под
          карточкой тренера занимала треть листа, и до выбора коврика — главного
          действия — приходилось скроллить. Тренер по-прежнему первый и с
          аватаром: клиент выбирает не «пилатес в 18:00», а «пилатес у Олены». */}
      <div className="rounded-[18px] bg-background px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-brand-foreground"
            style={{ background: lesson?.color || 'var(--v-brand)' }}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-extrabold tracking-[-0.015em] text-foreground">
              {lesson?.teacher}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
              {lesson?.time} · {lesson?.duration_min} {t('common.minutes')}
            </div>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-4 gap-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <div className="truncate text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
                {fact.label}
              </div>
              <div className="mt-1 text-[11.5px] font-extrabold leading-tight tracking-[-0.015em] text-foreground">
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isBooked && (
        <div className="mt-5 flex items-center gap-2.5 rounded-[18px] bg-success/14 px-4 py-3.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v-success)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[13px] font-bold text-foreground">
            {t('bookingModal.already_booked')}
          </span>
        </div>
      )}

      {/* Сетку ковриков не показываем вовсе: выбирать место, которое всё равно
          не забронировать, — это кнопка, ведущая в отказ. */}
      {isClosed && (
        <div className="mt-5 rounded-[18px] bg-background px-4 py-3.5">
          <div className="text-[13px] font-extrabold tracking-[-0.015em] text-foreground">
            {t('bookingModal.not_bookable')}
          </div>
          <div className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">
            {t('bookingModal.not_bookable_hint')}
          </div>
        </div>
      )}

      {showGrid && (
        <div className="mt-4">
          <div className="text-[9.5px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            {t('bookingModal.choose_spot')}
          </div>

          <div className="mt-2.5 rounded-[18px] bg-background px-3 pb-3 pt-2.5">
            {/* Тренер стоит лицом к залу — бейдж с его аватаром и стрелка вниз
                напоминают, куда «смотрят» коврики, прежде чем считать ряды. */}
            <div className="flex flex-col items-center gap-0.5 pb-2.5">
              <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 shadow-soft">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-extrabold text-brand-foreground"
                  style={{ background: lesson?.color || 'var(--v-brand)' }}
                >
                  {initials}
                </span>
                <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('bookingModal.facing_trainer')}
                </span>
              </div>
              <svg viewBox="0 0 16 8" className="h-1.5 w-3 fill-foreground/15">
                <path d="M8 8 0 0h16z" />
              </svg>
            </div>

            {/* Коврики нумерованы: «мой — седьмой» клиент запоминает числом, а
                не позицией в сетке. Занятый гасится, а не прячется — так видно,
                насколько полон зал. Ряды строятся сверху вниз лицом к тренеру;
                неполный последний ряд центрируется вместо прижатия к краю. */}
            <div className="flex flex-col gap-2">
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex justify-center gap-2">
                  {row.map((spot) => {
                    const isTaken = lesson?.taken_spots?.includes(spot) || false;
                    const isSelected = selectedSpot === spot;

                    return (
                      <motion.button
                        key={spot}
                        type="button"
                        disabled={isTaken}
                        whileTap={isTaken ? undefined : { scale: 0.9 }}
                        animate={{ scale: isSelected ? 1.05 : 1 }}
                        transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                        onClick={() => {
                          onSpotSelect(spot);
                          vibrateLight();
                        }}
                        style={{ flexBasis: matBasis, maxWidth: matWidth }}
                        className={[
                          'relative flex aspect-[7/8] flex-none flex-col items-center justify-end overflow-hidden rounded-[14px] pb-1 text-[11.5px] font-extrabold tabular-nums transition-colors',
                          isSelected
                            ? 'bg-brand text-brand-foreground shadow-brand'
                            : isTaken
                              ? 'bg-muted text-muted-foreground/40'
                              : 'bg-card text-foreground shadow-soft',
                        ].join(' ')}
                      >
                        {/* Рулон коврика у дальнего от клиента края — там, где
                            стоял бы тренер. */}
                        <span
                          className={[
                            'absolute inset-x-2 top-1.5 h-[2.5px] rounded-full',
                            isSelected
                              ? 'bg-brand-foreground/25'
                              : isTaken
                                ? 'bg-foreground/5'
                                : 'bg-foreground/8',
                          ].join(' ')}
                        />
                        <span
                          className={[
                            'absolute inset-x-2 top-[13px] h-[2.5px] rounded-full',
                            isSelected
                              ? 'bg-brand-foreground/15'
                              : isTaken
                                ? 'bg-foreground/5'
                                : 'bg-foreground/6',
                          ].join(' ')}
                        />
                        {spot}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
