import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SettingRow from './SettingRow';
import { useTelegram } from '../../hooks/useTelegram';
import { cn } from '../../lib/utils';

const FLAG_VIEWBOX = '0 0 24 16';

function FlagUA() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#0057B7" />
      <rect y="8" width="24" height="8" fill="#FFD700" />
    </svg>
  );
}

function FlagGB() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="16" fill="#00247D" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3" />
      <path d="M0 0L24 16M24 0L0 16" stroke="#CF142B" strokeWidth="1.4" />
      <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5" />
      <path d="M12 0V16M0 8H24" stroke="#CF142B" strokeWidth="2.4" />
    </svg>
  );
}

function FlagCZ() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="8" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#D7141A" />
      <path d="M0 0L12 8L0 16Z" fill="#11457E" />
    </svg>
  );
}

function FlagRU() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="5.33" fill="#fff" />
      <rect y="5.33" width="24" height="5.33" fill="#0039A6" />
      <rect y="10.67" width="24" height="5.33" fill="#D52B1E" />
    </svg>
  );
}

// Названия на самих языках, а не переводы: человек ищет в списке ту строку,
// которую узнаёт, — «Čeština», а не «Чеська».
const LANGUAGES = [
  { code: 'uk', name: 'Українська', flag: <FlagUA /> },
  { code: 'en', name: 'English', flag: <FlagGB /> },
  { code: 'cz', name: 'Čeština', flag: <FlagCZ /> },
  { code: 'ru', name: 'Русский', flag: <FlagRU /> },
];

/** Высота панели: четыре строки по 44 плюс подбивка. Нужна ДО отрисовки. */
const PANEL_HEIGHT = LANGUAGES.length * 44 + 12;

// Детектор языка отдаёт и «en-US», поэтому сверяем по префиксу.
const matches = (current: string, code: string) =>
  current === code || current.startsWith(`${code}-`);

/**
 * Выбор языка — строка настроек с выпадающим списком, а не лист во весь экран.
 *
 * Полноэкранная модалка с киккером, заголовком и подзаголовком ради четырёх
 * вариантов — это три экрана внимания на выбор, который делают раз в жизни.
 * Список раскрывается прямо под строкой: выбор виден вместе с тем, что он
 * меняет, и закрывается тем же тапом.
 *
 * Направление раскрытия считается в момент открытия, а не задано константой:
 * язык — последняя строка последней группы настроек, то есть почти всегда у
 * нижней кромки окна. Раскрытый вниз список там просто ушёл бы за экран.
 * Замер разовый — окно во время выбора не меняют, а список закрывается сам.
 *
 * Панель позиционируется относительно строки (absolute), а не портируется в
 * body с координатами: прокручивается вся страница целиком, и привязанная к
 * документу панель едет вместе со строкой без единого слушателя скролла.
 */
export default function LanguagePopover() {
  const { i18n, t } = useTranslation();
  const { tg } = useTelegram();

  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  const current = i18n.language || 'uk';
  const active = LANGUAGES.find((lang) => matches(current, lang.code)) ?? LANGUAGES[0];

  useEffect(() => {
    if (!isOpen) return;

    // pointerdown, а не click: список должен уходить в тот же момент, когда
    // палец коснулся страницы, иначе он ещё мгновение висит поверх того, по
    // чему уже нажали.
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

  const toggle = () => {
    if (!isOpen) {
      const rect = anchor.current?.getBoundingClientRect();
      setDropUp(Boolean(rect && window.innerHeight - rect.bottom < PANEL_HEIGHT + 16));
    }
    setIsOpen((open) => !open);
  };

  const pick = (code: string) => {
    i18n.changeLanguage(code);
    if (tg) tg.HapticFeedback.selectionChanged();
    setIsOpen(false);
  };

  return (
    <div ref={anchor} className="relative">
      <SettingRow
        label={t('profile.language', 'Мова')}
        onClick={toggle}
        expanded={isOpen}
        icon={
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </>
        }
        /* Текущий язык виден прямо в строке — ради того, чтобы его узнать,
           открывать список больше не нужно. */
        trailing={
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-[13px] font-bold tracking-[-0.01em] text-muted-foreground">
              {active.name}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--v-muted-foreground)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                isOpen && (dropUp ? 'rotate-90' : '-rotate-90'),
              )}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        }
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label={t('profile.language', 'Мова')}
            initial={{ opacity: 0, scale: 0.96, y: dropUp ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: dropUp ? 4 : -4,
              transition: { duration: 0.12 },
            }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            className={cn(
              'absolute right-0 z-40 w-[252px] rounded-[20px] bg-card p-1.5 shadow-lift',
              dropUp
                ? 'bottom-[calc(100%+8px)] origin-bottom-right'
                : 'top-[calc(100%+8px)] origin-top-right',
            )}
          >
            {LANGUAGES.map((lang) => {
              const isCurrent = matches(current, lang.code);

              return (
                <button
                  key={lang.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => pick(lang.code)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150',
                    isCurrent ? 'bg-brand/10' : 'hover:bg-muted',
                  )}
                >
                  <span className="flex h-5 w-7 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/10">
                    {lang.flag}
                  </span>

                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[14px] tracking-[-0.01em]',
                      isCurrent ? 'font-extrabold text-foreground' : 'font-semibold text-foreground/80',
                    )}
                  >
                    {lang.name}
                  </span>

                  {isCurrent && (
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
                      className="h-3.5 w-3.5 shrink-0"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
