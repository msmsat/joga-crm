import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { SubscriptionPackageInfo } from '../../api/studio';
import type { UserSubscription } from '../../api/user';
import { cn } from '../../lib/utils';
import { PassEmblem } from '../profile/SubscriptionPurchaseButton';
import Ring from '../pass/Ring';

type Props = {
  active: UserSubscription | null;
  loading: boolean;
  packages: SubscriptionPackageInfo[];
  canPayOnline: boolean;
  onOpen: () => void;
  onBuy: () => void;
};

/**
 * Клубная карта: баланс действующего абонемента или вход в выбор пакета.
 *
 * Карта — билет: корешок с остатком визитов (или эмблемой), линия отрыва с
 * вырезами по краям, справа — что это и куда ведёт. Высота одна на все
 * случаи (`--home-pass-h`): главная обязана помещаться в экран целиком, и
 * карта, которая разрасталась на длинной подписи, уводила последний вход в
 * запись под меню. Поэтому пояснение «купить только в студии» здесь не
 * пишется — его показывает сам лист покупки, куда ведёт карта.
 *
 * Свет на карте — фирменный цвет студии, как и всё освещение приложения.
 */
export default function PassCard({ active, loading, packages, canPayOnline, onOpen, onBuy }: Props) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  if (loading) {
    return <div aria-busy="true" className="pass-ticket min-h-[var(--home-pass-h)] rounded-[22px] bg-card motion-safe:animate-pulse" />;
  }

  const cheapest = [...packages].sort((a, b) => a.final_price - b.final_price)[0];
  if (!active && !cheapest && canPayOnline) return null;
  const name = active ? t(`subscription.${active.type}.name`, { defaultValue: active.type }) : '';
  const total = Math.max(0, active?.total_classes ?? 0);
  const left = Math.max(0, Math.min(active?.classes_left ?? 0, total));
  const date = active ? new Date(active.expires_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }) : '';
  // Без абонемента крупно — цена: короткая на любом языке, а «Переглянути
  // абонементи» в крупном кегле на узком телефоне обрезалось многоточием.
  const offer = cheapest ? (packages.length > 1 ? t('pass.from', { price: cheapest.final_price_str }) : cheapest.final_price_str) : '';
  const cta = t(canPayOnline ? 'pass.choose' : 'pass.view');

  return (
    <motion.button
      type="button"
      onClick={active ? onOpen : onBuy}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className="pass-lift group block w-full rounded-[22px] text-left transition-transform duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand dt:hover:-translate-y-0.5"
    >
      <span
        className={cn(
          'pass-ticket relative flex min-h-[var(--home-pass-h)] items-center overflow-hidden rounded-[22px]',
          active ? 'bg-foreground text-background dark:bg-muted dark:text-foreground' : 'bg-card text-foreground ring-1 ring-inset ring-border/60',
        )}
      >
        <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0', active ? 'pass-glow-dark' : 'pass-glow-light')} />
        {/* Один проблеск при появлении — карта «блестит», а не мигает. */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-120%' }}
            animate={{ x: '420%' }}
            transition={{ duration: 1.3, delay: 0.9, ease: 'easeInOut' }}
          />
        )}

        <span className="relative flex w-[var(--pass-stub)] shrink-0 items-center justify-center self-stretch">
          {active ? <Ring left={left} total={total} reduce={Boolean(reduce)} className="roomy:h-16 roomy:w-16" /> : <PassEmblem className="h-12 w-12 rounded-[16px] roomy:h-14 roomy:w-14 roomy:rounded-[18px]" />}
        </span>
        <span aria-hidden="true" className="absolute bottom-3.5 top-3.5 left-[var(--pass-stub)] border-l-[1.5px] border-dashed border-current opacity-20" />

        <span className="relative min-w-0 flex-1 py-3 pl-4 pr-2">
          <span className={cn('block text-[10px] font-extrabold uppercase leading-none tracking-[0.2em]', active ? 'opacity-55' : 'text-muted-foreground')}>
            {t('pass.kicker')}
          </span>
          <span className="mt-1.5 flex min-w-0 items-center gap-2 text-[15px] font-extrabold leading-tight tracking-[-0.025em] roomy:text-[17px]">
            <span className={cn('truncate', !active && offer && 'tabular-nums')}>{active ? name : offer || cta}</span>
            {!active && cheapest?.discount_label && (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold tracking-normal text-brand-foreground">{cheapest.discount_label}</span>
            )}
          </span>
          {active ? (
            <span className="mt-1 block truncate text-[12px] font-semibold opacity-65">
              {t(active.is_frozen ? 'profile.frozen' : 'profile.expires', { date })}
              <span className="sr-only"> · {t('pass.details')}</span>
            </span>
          ) : offer && (
            <span className="mt-1 block truncate text-[12px] font-semibold text-muted-foreground">{cta}</span>
          )}
        </span>

        <span
          className={cn(
            'relative mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5',
            active ? 'bg-white/10 dark:bg-white/5' : 'bg-brand text-brand-foreground shadow-brand',
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </span>
      </span>
    </motion.button>
  );
}
