import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import SettingRow from './SettingRow';
import { useTelegram } from '../../hooks/useTelegram';
import { cn } from '../../lib/utils';
import { chooseLanguage } from '../../lib/branding';

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

function FlagDE() {
  return (
    <svg viewBox={FLAG_VIEWBOX} width="28" height="20">
      <rect width="24" height="5.33" fill="#000" />
      <rect y="5.33" width="24" height="5.33" fill="#DD0000" />
      <rect y="10.67" width="24" height="5.33" fill="#FFCE00" />
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
//
// `short` — подпись для чипа, где на название места нет. Это НЕ код языка в
// верхнем регистре: у украинского он «uk», и «UK» рядом с «EN» читается как
// United Kingdom. Поэтому пишем страну флага, а не тег локали.
const LANGUAGES = [
  { code: 'uk', short: 'UA', name: 'Українська', flag: <FlagUA /> },
  { code: 'en', short: 'EN', name: 'English', flag: <FlagGB /> },
  { code: 'cs', short: 'CZ', name: 'Čeština', flag: <FlagCZ /> },
  { code: 'de', short: 'DE', name: 'Deutsch', flag: <FlagDE /> },
  { code: 'ru', short: 'RU', name: 'Русский', flag: <FlagRU /> },
];

/** Высота панели: строка списка — 44 плюс подбивка. Нужна ДО отрисовки. */
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
 *
 * `variant="card"` — тот же список под карточкой в боковом меню, над аккаунтом.
 * Он ровно для гостя: настроек у человека без аккаунта нет, а язык ему нужен.
 * Вошедшему эта карточка не показывается — у него язык живёт строкой в
 * профиле, и второй такой же выбор рядом был бы дублем. Отдельным компонентом
 * вариант делать нельзя: список языков, замер направления, закрытие по нажатию
 * снаружи и по Esc — один и тот же код, расходиться двум копиям незачем.
 *
 * `variant="chip"` — тот же выбор для гостя на телефоне, где боковой панели с
 * карточкой нет вовсе. Капсула с флагом и страной живёт в шапке главной: язык
 * гостю нужен в первую секунду (пришёл по ссылке из инстаграма и попал не в
 * свой язык), а не в разделе, которого у него ещё нет.
 */
export default function LanguagePopover({ variant = 'row' }: { variant?: 'row' | 'card' | 'chip' } = {}) {
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
    // chooseLanguage, а не i18n.changeLanguage: выбор обязан пережить язык
    // студии на следующем запуске (см. lib/language.ts).
    chooseLanguage(code);
    if (tg) tg.HapticFeedback.selectionChanged();
    setIsOpen(false);
  };

  return (
    <div ref={anchor} className="relative">
      {variant === 'card' ? (
        /* Карточка-близнец аккаунта под ней: тот же радиус, та же тень, тот же
           шеврон, разворачивающийся при открытии. Две карточки читаются парой —
           «кто я» и «на каком языке», — а не случайной кнопкой сверху.
           Флаг слева вместо иконки-глобуса: язык узнают, не читая. */
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t('profile.language', 'Мова')}
          className="group flex w-full min-w-0 items-center gap-3 rounded-[18px] bg-card px-3.5 py-3 text-left shadow-soft transition-shadow duration-200 hover:shadow-lift"
        >
          <span className="flex h-5 w-7 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-foreground/10">
            {active.flag}
          </span>

          <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-card-foreground">
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
              'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
              isOpen ? 'rotate-180' : 'group-hover:-translate-y-0.5',
            )}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      ) : variant === 'chip' ? (
        /* Капсула размером с подпись: флаг, страна, шеврон. Белая поверхность с
           мягкой тенью — тот же предмет, что карточки экрана, только ростом со
           строку. Без персика: акцент в шапке уже занят девизом дня, а второй
           цветной объект рядом с ним превратил бы выбор языка в кнопку
           действия, которой он не является. */
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t('profile.language', 'Мова')}
          className="flex items-center gap-1.5 rounded-full bg-card py-1.5 pl-1.5 pr-2.5 shadow-soft transition-shadow duration-200 active:shadow-none"
        >
          {/* Флаг рисуется в 28×20 атрибутами svg — в капсуле он вдвое меньше,
              поэтому размер задаётся дочернему элементу, иначе он вылезет за
              рамку и его срежет overflow. */}
          <span className="flex h-[13px] w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/10 [&>svg]:h-full [&>svg]:w-full">
            {active.flag}
          </span>

          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-card-foreground">
            {active.short}
          </span>

          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--v-muted-foreground)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              'h-2.5 w-2.5 shrink-0 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
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
      )}

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
              'absolute z-40 rounded-[20px] bg-card p-1.5 shadow-lift',
              // В колонке меню панель идёт во всю её ширину: колонка уже 252px,
              // и своя ширина вылезла бы за край, а `overflow-y-auto` на aside
              // делает горизонталь прокручиваемой — панель бы попросту обрезало.
              variant === 'card' ? 'inset-x-0' : 'right-0 w-[252px]',
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
