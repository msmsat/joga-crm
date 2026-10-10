import { useCallback, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Studio, StudioCatalog } from '../../api/studio';
import { STEP_ICONS } from '../wizard/stepIcons';
import LanguagePopover from '../profile/LanguagePopover';
import BranchPicker from './BranchPicker';
import { useBranch, type BranchStore } from './branchStore';

/** С чего человек начинает запись. */
export type BookingStart = 'time' | 'master' | 'service';
const STARTS: BookingStart[] = ['time', 'master', 'service'];
// Мастер в студии один — начинать с него не с чего: он и так выбран.
const SOLO_STARTS: BookingStart[] = ['time', 'service'];

type Props = {
  catalog: StudioCatalog | null;
  /** Имя клиента; гость — пусто. */
  name: string;
  /** Филиал, выбранный на главной (branchStore.ts). Шапка на него не
   *  подписана: перерисовываются только капсула и строка адреса. */
  branches: BranchStore;
  onStart: (start: BookingStart) => void;
  /** Карта абонемента — под названием и адресом, частью вывески. */
  pass?: ReactNode;
};

const ease = [0.16, 1, 0.3, 1] as const;
const EASE_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';

/*
 * Появление главной — на видеокарте, а не на главном потоке.
 *
 * Сдвиг и масштаб здесь заданы строкой `transform`, а не `y`/`scale`: такие
 * framer считает в JS на каждом кадре, а `transform` (как и прозрачность и
 * фильтр) отдаёт браузеру через Web Animations. Появление идёт ровно в те
 * секунды, когда главный поток занят — первая раскладка, сборка листов записи
 * и разделов в простое, — и JS-анимация на каждой такой задаче замирала.
 * Цель — явная тождественная (`translateY(0px)`, `scale(1)`), а не `none`:
 * `none` framer «обнуляет» по начальному значению, и `scale(0.85)` уходил в
 * `scale(0)`. А по окончании — `none` (`transitionEnd`): любое значение
 * transform делает узел опорой для `fixed`-потомков и своим слоем наложения,
 * и список филиалов в этой строке открылся бы не там.
 */
const settled = { transform: 'none' } as const;

/** Слово без букв и цифр — разделитель в названии: «·», «|», «—», «&». */
const isMark = (word: string) => !/[\p{L}\p{N}]/u.test(word);

/**
 * Слова вывески. Разделитель приклеен к следующему слову: «FIGARO Barber
 * Club · Demo» иначе ломалось с точкой, висящей в конце строки.
 */
function signWords(name: string) {
  const words: { mark: string; word: string }[] = [];
  let mark = '';
  for (const word of name.split(/\s+/).filter(Boolean)) {
    if (isMark(word)) mark = mark ? `${mark} ${word}` : word;
    else {
      words.push({ mark, word });
      mark = '';
    }
  }
  if (mark) words.push({ mark, word: '' });
  return words;
}

/**
 * Главная — одна сцена: название студии и три входа в запись.
 *
 * Человек открыл мини-приложение ради одного — записаться, и первым экраном он
 * видит студию, в которую пришёл, и три способа начать: со времени, с мастера,
 * с услуги. Всё остальное (свои записи, клуб, профиль) — в нижнем меню.
 *
 * Название набрано крупно и ломается по словам: это вывеска, а не заголовок
 * раздела. Свет за ним — фирменный цвет студии (как и у всего приложения),
 * кольца — тонкие, чтобы сцена не превращалась в баннер.
 */
export default function HomeHero({ catalog, name, branches: branchStore, onStart, pass }: Props) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [brokenLogo, setBrokenLogo] = useState(false);
  const studio = catalog?.studio;
  const branches = catalog?.branches ?? [];
  const words = signWords(studio?.name ?? '');
  const logo = !brokenLogo ? studio?.logo_url : null;
  const monogram = words.filter(({ word }) => word).map(({ word }) => word[0]).join('').slice(0, 2).toUpperCase();
  const starts = catalog && catalog.staff.length < 2 ? SOLO_STARTS : STARTS;

  const rise = (delay: number) => (reduce ? {} : {
    initial: { opacity: 0, transform: 'translateY(18px)' },
    animate: { opacity: 1, transform: 'translateY(0px)', transitionEnd: settled },
    transition: { duration: 0.7, delay, ease },
  });

  // Входы в запись появляются Web Animations по свойству `translate`, а не
  // через framer: у кнопок есть пружина нажатия (`whileTap`), и framer пишет
  // её в `transform` — строка `transform` для появления её бы отменила.
  // `translate` складывается с `transform`, а `fill: backwards` держит
  // начальное состояние только на время задержки и после конца не мешает.
  const riseIn = useCallback((button: HTMLElement | null) => {
    if (!button || reduce) return;
    const animation = button.animate(
      [{ opacity: 0, translate: '0 22px' }, { opacity: 1, translate: '0 0' }],
      { duration: 600, delay: Number(button.dataset.riseDelay ?? 0), easing: EASE_CSS, fill: 'backwards' },
    );
    return () => animation.cancel();
  }, [reduce]);

  return (
    <section className="home-hero relative flex min-h-[calc(var(--app-h,100dvh)-var(--nav-clearance))] flex-col px-5 pt-[calc(var(--home-top)+env(safe-area-inset-top,0px))] dt:min-h-[calc(100dvh-5rem)] dt:px-0">
      {/* Кольца за названием — свет студии, а не картинка. Обрезает их своя
          рамка, а не вся секция: у секции на низком экране нет нижнего поля,
          и её обрезка срезала бы прямой линией тень последнего входа. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-28 top-10 h-[360px] w-[360px] dt:-right-10 dt:h-[520px] dt:w-[520px]">
          {[0, 1, 2].map((ring) => (
            <motion.span
              key={ring}
              className="absolute rounded-full border border-brand/25"
              style={{ inset: ring * 46 }}
              initial={reduce ? false : { opacity: 0, transform: 'scale(0.85)' }}
              animate={{ opacity: 1 - ring * 0.25, transform: 'scale(1)', transitionEnd: settled }}
              transition={{ duration: 1.1, delay: 0.1 + ring * 0.12, ease }}
            />
          ))}
          <span className="absolute inset-[138px] rounded-full bg-brand/30 blur-2xl dt:inset-[180px]" />
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <motion.div {...rise(0)} className="flex min-w-0 items-center gap-2.5">
          {logo ? (
            <img src={logo} alt="" onError={() => setBrokenLogo(true)} className="h-10 w-10 shrink-0 rounded-full object-cover shadow-soft" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-extrabold tracking-[-0.02em] text-background">
              {monogram || '•'}
            </span>
          )}
          <span className="truncate text-[10.5px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
            {t('hero.kicker')}
          </span>
        </motion.div>
        <motion.div {...rise(0.05)} className="shrink-0">
          <LanguagePopover variant="chip" />
        </motion.div>
      </div>

      {/* Сцена забирает всю свободную высоту и ставит вывеску по центру. Отступ
          здесь — только минимум: воздух вокруг названия даёт свободное место,
          а не число, иначе длинное имя в две строки уводило бы входы под меню. */}
      <div className="relative flex flex-1 flex-col justify-center py-[var(--home-stage-padding)]">
        <motion.div {...rise(0.08)} className="home-welcome text-[12px] font-extrabold uppercase tracking-[0.24em] text-brand">
          {name ? t('hero.welcomeBack', { name }) : t('hero.welcome')}
        </motion.div>
        {/* Строки выровнены по длине: вывеска в две строки не оставляет одно
            слово сиротой под длинной первой. Разделитель — цветом студии. */}
        <h1 className="mt-[var(--home-title-gap)] text-balance text-[length:var(--home-title-size)] font-extrabold leading-[0.95] tracking-[-0.05em] text-foreground">
          {words.map(({ mark, word }, index) => (
            <motion.span
              key={`${mark}${word}-${index}`}
              className="mr-[0.22em] inline-block max-w-full [overflow-wrap:anywhere]"
              initial={reduce ? false : { opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)', filter: 'blur(0px)', transitionEnd: { transform: 'none', filter: 'none' } }}
              transition={{ duration: 0.8, delay: 0.14 + index * 0.08, ease }}
            >
              {mark && <span className="font-bold text-brand">{mark}{word ? ' ' : ''}</span>}
              {word}
            </motion.span>
          ))}
        </h1>
        <HeroPlace store={branchStore} branches={branches} reduce={reduce} />
        {/* Зазор до карты сжимается первым, когда высоты мало, и растёт до
            потолка, когда её много. */}
        {pass && <div aria-hidden="true" className="min-h-[var(--home-pass-gap-min)] max-h-[var(--home-pass-gap)] flex-1" />}
        {pass && (
          <motion.div {...rise(0.36)} className="max-w-[440px]">
            {pass}
          </motion.div>
        )}
      </div>

      <div className="relative pb-[var(--home-bottom)]">
        {/* Филиал — справа от вопроса, а не отдельным шагом: он сужает все три
            входа сразу, и спрашивать его в каждом было бы трижды одно и то же. */}
        <motion.div {...rise(0.34)} className="flex items-center justify-between gap-3 pb-3">
          <span className="min-w-0 text-[11px] font-extrabold uppercase leading-snug tracking-[0.2em] text-muted-foreground">
            {t('hero.chooseHow')}
          </span>
          {branches.length > 1 && (
            <div className="min-w-0 max-w-[58%] shrink-0">
              <BranchPicker branches={branches} store={branchStore} />
            </div>
          )}
        </motion.div>
        <div className={`flex flex-col gap-[var(--home-cards-gap)] dt:grid ${starts.length === 3 ? 'dt:grid-cols-3' : 'dt:grid-cols-2'}`}>
          {starts.map((start, index) => (
            <motion.button
              key={start}
              type="button"
              onClick={() => onStart(start)}
              ref={riseIn}
              data-rise-delay={400 + index * 80}
              whileTap={{ scale: 0.975 }}
              whileHover={{ y: -2 }}
              className="home-start group flex items-center gap-[var(--home-card-gap)] rounded-[24px] bg-card p-[var(--home-card-padding)] text-left shadow-soft ring-1 ring-inset ring-border/60 transition-shadow duration-300 dt:flex-col dt:items-start dt:hover:shadow-lift"
            >
              <span className={`flex h-[var(--home-icon-size)] w-[var(--home-icon-size)] shrink-0 items-center justify-center rounded-[16px] p-[var(--home-icon-padding)] ${
                index === 0 ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-brand/12 text-brand'
              }`}>
                {STEP_ICONS[start]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--home-card-title-size)] font-extrabold tracking-[-0.02em] text-card-foreground">{t(`hero.start.${start}`)}</span>
                <span className="mt-0.5 block text-[length:var(--home-hint-size)] font-semibold leading-snug text-muted-foreground">{t(`hero.startHint.${start}`)}</span>
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-foreground transition-transform duration-300 group-hover:translate-x-0.5 dt:hidden">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Адрес под названием — куда человек идёт: выбранного филиала, а пока выбраны
 * все — их число. Один филиал выводится сам. Подписан на выбор сам, чтобы
 * смена адреса не перерисовывала шапку.
 */
function HeroPlace({ store, branches, reduce }: { store: BranchStore; branches: Studio[]; reduce: boolean | null }) {
  const { t } = useTranslation();
  const branch = useBranch(store, branches);
  const here = branches.length === 1 ? branches[0] : branches.find((row) => row.id === branch);
  const place = here
    ? [here.city, here.address].filter(Boolean).join(', ')
    : branches.length > 1 ? t('hero.branches', { count: branches.length }) : '';
  if (!place) return null;
  return (
    <motion.div
      {...(reduce ? {} : { initial: { opacity: 0, transform: 'translateY(18px)' }, animate: { opacity: 1, transform: 'translateY(0px)', transitionEnd: settled }, transition: { duration: 0.7, delay: 0.3, ease } })}
      className="mt-[var(--home-title-gap)] flex items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
      </svg>
      {/* Ключ — сам адрес: смена филиала проявляет новый, а не подменяет
          буквы на месте. */}
      <motion.span
        key={place}
        initial={reduce ? false : { opacity: 0, transform: 'translateY(4px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)', transitionEnd: settled }}
        transition={{ duration: 0.35, ease }}
        className="truncate"
      >
        {place}
      </motion.span>
    </motion.div>
  );
}
