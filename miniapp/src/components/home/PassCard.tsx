import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import type { UserSubscription } from '../../api/user';
import { cn } from '../../lib/utils';

type Props = {
  /** Действующий абонемент; `null` — его нет (или человек гость). */
  active: UserSubscription | null;
  /** Ответа об абонементе ещё не было — карта держит своё место. */
  loading: boolean;
  /** Что студия продаёт. Пустой список — только при действующем абонементе:
   *  без того и другого карту не показывают вовсе (`home.tsx`). */
  packages: SubscriptionPackageInfo[];
  /** Абонемент есть — открыть его целиком (профиль). */
  onOpen: () => void;
  /** Абонемента нет — покупка. */
  onBuy: () => void;
};

/** Делениями шкала читается до этого числа занятий; дальше — сплошной полосой. */
const MAX_SEGMENTS = 16;

const ON = 'text-background dark:text-foreground';
/** Главное число карты: сколько осталось или сколько в пакете. */
const NUMBER = 'text-[length:var(--home-pass-number)] font-extrabold leading-[0.85] tabular-nums tracking-[-0.05em]';
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Абонемент на главной — клубной картой, а не строкой меню.
 *
 * Карта тёмная, как абонемент в профиле, со светом студии в углу и кольцами
 * той же сцены, что за названием: она часть вывески, а не баннер поверх неё.
 * Есть абонемент — главное число: сколько занятий осталось, и шкала, где
 * каждое деление — одно занятие. Нет — с чего начинается покупка: самый
 * доступный пакет, его цена и «Купить».
 *
 * Оба вида одной высоты, и заглушка тоже: пришедший ответ меняет содержимое,
 * а не раскладку главной. Высота и поля — из токенов сцены (`.home-hero` в
 * index.css): на низком экране карта ниже, строки распределяются по ней сами,
 * и все входы записи остаются над нижним меню.
 */
export default function PassCard({ active, loading, packages, onOpen, onBuy }: Props) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();

  if (loading) {
    return <div aria-busy="true" className="h-[var(--home-pass-h)] animate-pulse rounded-[26px] bg-foreground/[0.07] dark:bg-muted" />;
  }

  const cheapest = [...packages].sort((a, b) => a.final_price - b.final_price)[0];
  if (!active && !cheapest) return null;
  const name = active ? t(`subscription.${active.type}.name`, { defaultValue: active.type }) : null;
  const total = active?.total_classes ?? 0;
  const left = Math.max(0, Math.min(active?.classes_left ?? 0, total));
  const date = active
    ? new Date(active.expires_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })
    : '';

  return (
    <motion.button
      type="button"
      onClick={active ? onOpen : onBuy}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      className="relative isolate flex h-[var(--home-pass-h)] w-full flex-col justify-between overflow-hidden rounded-[26px] bg-foreground px-5 py-[var(--home-pass-pad)] text-left shadow-lift ring-1 ring-inset ring-white/[0.06] dark:bg-muted"
    >
      {/* Свет студии и кольца — та же сцена, что за названием на главной. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 h-44 w-44 rounded-full bg-brand/45 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 -z-10 h-56 w-56">
        {[0, 1, 2].map((ring) => (
          <span key={ring} className="absolute rounded-full border border-white/[0.07]" style={{ inset: ring * 28 }} />
        ))}
      </span>
      {/* Блик: один раз, когда карта встала, — как свет по пластику. */}
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/[0.13] to-transparent"
          initial={{ x: '0%' }}
          animate={{ x: '520%' }}
          transition={{ duration: 1.3, delay: 1.1, ease }}
        />
      )}

      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_10px_var(--v-brand)]" />
          <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.24em] text-brand">{t('pass.kicker')}</span>
        </span>
        {active ? (
          <span className={cn('min-w-0 truncate text-[12px] font-extrabold tracking-[-0.01em] opacity-70', ON)}>{name}</span>
        ) : cheapest.discount_label ? (
          <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-extrabold text-brand-foreground">
            {cheapest.discount_label}
          </span>
        ) : null}
      </span>

      {active ? (
        <>
          <span className="flex items-end justify-between gap-3">
            <span className="flex items-baseline gap-1.5">
              <span className={cn(NUMBER, ON)}>{left}</span>
              <span className={cn('text-[15px] font-bold tabular-nums opacity-45', ON)}>/ {total}</span>
              <span className={cn('pl-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-45', ON)}>{t('common.classes_count')}</span>
            </span>
            <span className={cn('shrink-0 pb-0.5 text-[11.5px] font-semibold opacity-60', ON)}>
              {t(active.is_frozen ? 'profile.frozen' : 'profile.expires', { date })}
            </span>
          </span>
          <Meter left={left} total={total} />
        </>
      ) : (
        <span className="flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <span className={cn(NUMBER, ON)}>{cheapest.class_count}</span>
              <span className={cn('text-[11px] font-bold uppercase tracking-[0.14em] opacity-45', ON)}>{t('common.classes_count')}</span>
            </span>
            {/* Цена — уже со скидкой клиента; базовая рядом зачёркнута. */}
            <span className={cn('mt-2 flex items-baseline gap-2 whitespace-nowrap text-[13px] font-extrabold tabular-nums', ON)}>
              {packages.length > 1 ? t('pass.from', { price: cheapest.final_price_str }) : cheapest.final_price_str}
              {cheapest.discount_label && (
                <span className="text-[11.5px] font-semibold line-through opacity-40">{cheapest.price_str}</span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand py-2 pl-4 pr-3 text-[12.5px] font-extrabold text-brand-foreground shadow-brand">
            {t('pass.buy')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </span>
      )}
    </motion.button>
  );
}

/**
 * Сколько осталось: деление — занятие, светлые — оставшиеся. В длинном
 * абонементе деления слились бы в штрихкод — там сплошная полоса.
 */
function Meter({ left, total }: { left: number; total: number }) {
  if (total <= 0) return null;
  if (total > MAX_SEGMENTS) {
    return (
      <span className="block h-1.5 overflow-hidden rounded-full bg-white/[0.12]">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${(left / total) * 100}%` }} />
      </span>
    );
  }
  return (
    <span className="flex gap-1">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={cn('h-1.5 flex-1 rounded-full', index < left ? 'bg-brand' : 'bg-white/[0.12]')} />
      ))}
    </span>
  );
}
