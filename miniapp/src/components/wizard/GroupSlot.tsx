import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { startOf, type DaySlot } from '../../lib/groupWizard';
import { hasStaffAbout, type LessonAbout } from '../../lib/lessonAbout';
import { hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import { useClamp } from '../../hooks/useClamp';
import { RatingMark } from '../about/Rating';
import LessonAboutPanel from '../about/LessonAbout';
import '../about/about.css';

type Props = {
  slot: DaySlot;
  /** Это занятие сейчас выбрано — кольцо акцента. */
  active: boolean;
  /** Филиал занятия — когда лист открыт на «Все филиалы» и их несколько. */
  place?: string;
  onPick: () => void;
  /** Направление и тренер из каталога студии (lib/lessonAbout). */
  about?: LessonAbout;
  /** Раскрыта ли карточка. Раскрытой бывает одна на день — состояние у списка. */
  expanded?: boolean;
  /** Нет — «Подробнее» не показывается вовсе. */
  onToggle?: () => void;
};

/**
 * Карточка занятия во «Времени» групповой записи: час и длительность
 * колонкой слева — глаз идёт по ним, — справа название, описание, тренер,
 * места и цена.
 *
 * Тап выбирает занятие целиком (час, направление, тренер) и ведёт на итог.
 * Полное и закрытое для записи стоят погашенными, с причиной вместо мест:
 * день студии виден целиком.
 *
 * «Подробнее» раскрывает карточку вниз: тот же абзац описания дописывается
 * целиком, ниже выезжают средняя оценка направления, визитка тренера и кнопка
 * дальше — то же действие, что у тапа по карточке. Выбор и раскрытие — две
 * СОСЕДНИЕ кнопки: верх карточки накрыт прозрачной кнопкой выбора, содержимое
 * пропускает касания к ней, и только «Подробнее» стоит над ней своей кнопкой.
 *
 * Карточка — без motion: они монтируются вместе с листом, и каждая лишняя
 * пружина — в его первом кадре. Сжатие — CSS по :active кнопки выбора.
 */
export default function GroupSlot({ slot, active, place, onPick, about, expanded = false, onToggle }: Props) {
  const { t } = useTranslation();
  const { lesson, state, left } = slot;
  const off = state === 'full' || state === 'closed';
  const title = lesson.name ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name }) : '';
  const initials = lesson.teacher.split(' ').map((part) => part[0]).join('').slice(0, 2);
  const time = hhmm(startOf(lesson));

  const status = state === 'mine' ? t('schedule.booked')
    : state === 'full' ? t('groupWizard.full')
    : state === 'closed' ? t('groupWizard.closed')
    : t('groupWizard.left', { left, total: lesson.total_spots });

  const description = about?.service?.description ?? null;
  const { ref: textRef, cut, full } = useClamp<HTMLSpanElement>(description);
  const rating = about?.service?.rating_avg ?? null;
  // Кнопка — только когда раскрытие покажет что-то сверх видимого: хвост
  // описания, оценку направления или «О себе» тренера.
  const canExpand = Boolean(onToggle && about) && (cut || rating != null || hasStaffAbout(about?.trainer));
  const open = canExpand && expanded;
  const end = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        'relative rounded-[20px] [transition:background-color_0.2s,box-shadow_0.2s,scale_0.18s_cubic-bezier(0.2,0.8,0.2,1)]',
        !off && 'has-[.gs-hit:active]:scale-[0.985]',
        off ? 'ring-1 ring-inset ring-border'
          : active ? 'bg-card shadow-soft ring-2 ring-brand'
          : open ? 'bg-card shadow-soft'
          : 'bg-background dt:hover:bg-card dt:hover:shadow-lift',
      )}
    >
      <div className="relative">
        <button
          type="button"
          disabled={off}
          onClick={onPick}
          aria-pressed={active}
          aria-label={[time, title, lesson.teacher, status].filter(Boolean).join(' · ')}
          className="gs-hit absolute inset-0 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-default"
        />
        <div className="pointer-events-none relative flex gap-3.5 px-4 py-3.5 text-left">
          <span className={cn('w-[52px] shrink-0', off && 'opacity-55')}>
            <span className={cn(
              'block text-[17px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground',
              off && 'line-through decoration-1',
            )}>
              {time}
            </span>
            <span className="mt-1.5 block text-[11px] font-bold text-muted-foreground">
              {lesson.duration_min} {t('common.minutes')}
            </span>
            {rating != null && (
              <RatingMark avg={rating} className="mt-2.5 text-[11.5px] font-extrabold text-card-foreground" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-3">
              <span className={cn(
                'min-w-0 truncate text-[15px] font-extrabold leading-snug tracking-[-0.015em] text-card-foreground',
                off && 'opacity-55',
              )}>
                {title}
              </span>
              {!off && lesson.price_str && (
                <span className="shrink-0 pt-px text-[13.5px] font-extrabold tabular-nums tracking-[-0.01em] text-card-foreground">
                  {lesson.price_str}
                </span>
              )}
            </span>

            {description && (
              <span
                ref={textRef}
                data-cut={cut || undefined}
                data-open={open || undefined}
                style={open && cut ? { maxHeight: full } : undefined}
                className={cn('ab-text mt-1 block text-[13px] font-medium text-muted-foreground', off && 'opacity-55')}
              >
                {description}
              </span>
            )}

            <span className={cn('mt-1.5 flex min-w-0 items-center gap-1.5', off && 'opacity-55')}>
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[7.5px] font-extrabold text-brand-foreground"
                style={{ background: lesson.color }}
              >
                {initials}
              </span>
              <span className="truncate text-[12.5px] font-semibold text-muted-foreground">
                {[lesson.teacher, place].filter(Boolean).join(' · ')}
              </span>
            </span>

            <span className="mt-1.5 flex min-h-[18px] items-center justify-between gap-2">
              <span className={cn(
                'flex min-w-0 items-center gap-1.5 text-[11.5px] font-extrabold',
                state === 'mine' ? 'text-card-foreground' : 'text-muted-foreground',
              )}>
                {state === 'mine' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0 text-success">
                    <polyline points="5 12.5 10 17 19 7.5" />
                  </svg>
                ) : !off && (
                  // «Почти заполнено» (решает сервер, `badge`) — точка акцентом:
                  // места ещё есть, но тянуть не стоит.
                  <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', lesson.badge === 'almost' ? 'bg-brand' : 'bg-success')} />
                )}
                <span className="truncate">{status}</span>
              </span>

              {canExpand && (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={open}
                  aria-label={t('about.more_about', { name: title })}
                  className="pointer-events-auto relative -my-2 -mr-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-extrabold tracking-[-0.01em] text-card-foreground transition-colors duration-200 active:bg-muted dt:hover:bg-muted"
                >
                  {open ? t('about.less') : t('about.more')}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ab-toggle-icon h-3.5 w-3.5 text-muted-foreground">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              )}
            </span>
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && about && (
          <motion.div
            key="about"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            /* Та же кривая и длительность, что у дописывающегося абзаца
               (.ab-text): описание и панель едут вниз одним движением. */
            transition={{ height: { duration: 0.46, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.3 } }}
            // Раскрытая у нижнего края листа — подтянуть, чтобы кнопка дальше
            // не осталась за краем.
            onAnimationComplete={(done) => {
              if ((done as { height?: unknown }).height === 'auto') {
                end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }}
            className="overflow-hidden"
          >
            <LessonAboutPanel
              about={about}
              action={off ? null : state === 'mine' ? t('about.my_booking') : t('about.book', { time })}
              onAction={onPick}
            />
            <div ref={end} className="h-0 scroll-mb-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
