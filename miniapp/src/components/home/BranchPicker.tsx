import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Studio } from '../../api/studio';
import { useTelegram } from '../../hooks/useTelegram';
import { cn } from '../../lib/utils';

type Props = {
  branches: Studio[];
  /** Выбранный филиал; `null` — «Все филиалы». */
  value: number | null;
  onChange: (id: number | null) => void;
};

const PIN = (
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" />
    <circle cx="12" cy="10" r="2.6" />
  </>
);

/** «Все» — стопка слоёв: несколько адресов сразу, а не один. */
const LAYERS = (
  <>
    <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z" />
    <path d="m3 12 9 4.5 9-4.5" />
    <path d="m3 16.5 9 4.5 9-4.5" />
  </>
);

const Icon = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

/**
 * Филиал записи на главной — капсула справа от «С чего начнём запись?».
 *
 * Показывается, только когда адресов несколько: при одном спрашивать нечего.
 * Открывается на «Все» — выбор сужает запись, а не требуется для неё.
 *
 * Выбор один из всех, а не любые из них, как у фильтра в расписании: это не
 * фильтр списка, а ответ на вопрос «куда я иду», и запись в итоге всё равно
 * случится по одному адресу.
 *
 * Список раскрывается НАД капсулой: под ней — три карточки входа в запись, и
 * накрыть их значило бы спрятать то, ради чего выбирают филиал. Над ней —
 * название студии, оно подождёт.
 *
 * Капсула выпуклая (`--v-surface-raised`, `shadow-button` в index.css) и
 * утапливается, пока нажата и пока список открыт: нажимаемость читается формой,
 * а не цветом. Персик в ней — только у значка, и он загорается целиком, когда
 * выбран конкретный адрес: видно, что запись сужена.
 */
export default function BranchPicker({ branches, value, onChange }: Props) {
  const { t } = useTranslation();
  const { tg, vibrateLight } = useTelegram();
  const [isOpen, setIsOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // pointerdown, а не click: список уходит в тот же миг, когда палец
    // коснулся страницы, а не висит поверх того, по чему уже нажали.
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const current = branches.find((branch) => branch.id === value) ?? null;
  const label = current?.name ?? t('booking.allBranches');
  // Подпись «всех» — города, а не число: «Praha · Brno» говорит, где это,
  // «Студий: 3» — только сколько.
  const cities = [...new Set(branches.map((branch) => branch.city).filter(Boolean))].join(' · ');
  const options = [
    { id: null, title: t('booking.allBranches'), hint: cities, icon: LAYERS },
    ...branches.map((branch) => ({
      id: branch.id,
      title: branch.name,
      hint: [branch.city, branch.address].filter(Boolean).join(', '),
      icon: PIN,
    })),
  ];

  const toggle = () => {
    if (!isOpen) vibrateLight();
    setIsOpen((open) => !open);
  };

  const choose = (id: number | null) => {
    if (id !== value && tg) tg.HapticFeedback.selectionChanged();
    onChange(id);
    setIsOpen(false);
  };

  return (
    <div ref={anchor} className="relative min-w-0">
      <motion.button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t('resource.branch')}: ${label}`}
        whileTap={{ scale: 0.95 }}
        whileHover={{ y: -1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        className={cn(
          'flex h-10 max-w-full items-center gap-2 rounded-full bg-[image:var(--v-surface-raised)] py-1 pl-1 pr-3 transition-shadow duration-200 active:shadow-button-press',
          isOpen ? 'shadow-button-press' : 'shadow-button',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
            current ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-brand/14 text-brand',
          )}
        >
          <Icon className="h-[15px] w-[15px]">{current ? PIN : LAYERS}</Icon>
        </span>

        <span className="min-w-0 truncate text-[13px] font-extrabold tracking-[-0.015em] text-card-foreground">
          {label}
        </span>

        {/* Двойной шеврон — знак выпадающего выбора, а не перехода: одинарная
            стрелка вправо здесь уже у карточек и значит «дальше». */}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground">
          <polyline points="8 9 12 5 16 9" />
          <polyline points="8 15 12 19 16 15" />
        </Icon>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label={t('resource.branch')}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            className="absolute bottom-[calc(100%+10px)] right-0 z-40 w-[min(288px,calc(100vw-2.5rem))] origin-bottom-right rounded-[22px] bg-card p-1.5 shadow-lift"
          >
            <div className="px-3 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
              {t('resource.branch')}
            </div>

            {/* Потолок высоты — от рамы, а не от окна: адресов бывает и десять,
                и список не должен упереться в шапку экрана. */}
            <div className="max-h-[calc(var(--app-h,100dvh)*0.45)] overflow-y-auto">
              {options.map((option, index) => {
                const active = option.id === value;
                return (
                  <motion.button
                    key={option.id ?? 'all'}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => choose(option.id)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.03 * index, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[16px] px-2.5 py-2 text-left transition-colors duration-150',
                      active ? 'bg-brand/10' : 'hover:bg-muted active:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                        active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4">{option.icon}</Icon>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className={cn(
                        'block truncate text-[14px] tracking-[-0.015em] text-foreground',
                        active ? 'font-extrabold' : 'font-bold',
                      )}>
                        {option.title}
                      </span>
                      {option.hint && (
                        <span className="mt-0.5 block truncate text-[12px] font-semibold text-muted-foreground">
                          {option.hint}
                        </span>
                      )}
                    </span>

                    {active && (
                      <motion.svg
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--v-brand)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mr-1 h-3.5 w-3.5 shrink-0"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </motion.svg>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
