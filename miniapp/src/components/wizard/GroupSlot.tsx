import { useTranslation } from 'react-i18next';
import { startOf, type DaySlot } from '../../lib/groupWizard';
import { hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';

type Props = {
  slot: DaySlot;
  /** Это занятие сейчас выбрано — кольцо акцента. */
  active: boolean;
  /** Филиал занятия — когда лист открыт на «Все филиалы» и их несколько. */
  place?: string;
  onPick: () => void;
};

/**
 * Карточка занятия во «Времени» групповой записи: час и длительность
 * колонкой слева — глаз идёт по ним, — справа название, тренер, места и цена.
 *
 * Тап выбирает занятие целиком (час, направление, тренер) и ведёт на итог.
 * Полное и закрытое для записи стоят погашенными, с причиной вместо мест:
 * день студии виден целиком.
 *
 * Обычная кнопка с CSS-сжатием, а не motion: карточки монтируются вместе с
 * листом, и каждая лишняя пружина — в его первом кадре.
 */
export default function GroupSlot({ slot, active, place, onPick }: Props) {
  const { t } = useTranslation();
  const { lesson, state, left } = slot;
  const off = state === 'full' || state === 'closed';
  const title = lesson.name ? t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name }) : '';
  const initials = lesson.teacher.split(' ').map((part) => part[0]).join('').slice(0, 2);

  const status = state === 'mine' ? t('schedule.booked')
    : state === 'full' ? t('groupWizard.full')
    : state === 'closed' ? t('groupWizard.closed')
    : t('groupWizard.left', { left, total: lesson.total_spots });

  return (
    <button
      type="button"
      disabled={off}
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-[20px] px-4 py-3.5 text-left transition-[transform,background-color,box-shadow] duration-200 enabled:active:scale-[0.985]',
        off ? 'cursor-default ring-1 ring-inset ring-border'
          : active ? 'bg-card shadow-soft ring-2 ring-brand'
          : 'bg-background dt:hover:bg-card dt:hover:shadow-lift',
      )}
    >
      <span className={cn('w-[52px] shrink-0', off && 'opacity-55')}>
        <span className={cn(
          'block text-[17px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground',
          off && 'line-through decoration-1',
        )}>
          {hhmm(startOf(lesson))}
        </span>
        <span className="mt-1.5 block text-[11px] font-bold text-muted-foreground">
          {lesson.duration_min} {t('common.minutes')}
        </span>
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

        <span className={cn('mt-1 flex min-w-0 items-center gap-1.5', off && 'opacity-55')}>
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

        <span className={cn(
          'mt-1.5 flex items-center gap-1.5 text-[11.5px] font-extrabold',
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
          {status}
        </span>
      </span>
    </button>
  );
}
