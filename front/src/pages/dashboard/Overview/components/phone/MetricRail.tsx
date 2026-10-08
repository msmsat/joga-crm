import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { fmtPct } from '../../../../../lib/format';
import type { MetricConfig, MetricId } from '../../types';
import { TrendArrow } from './icons';
import s from './PhoneOverview.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  metrics: MetricConfig[];
  /** Выбранная метрика — у владельца она в главной карточке. Без неё (админ,
   *  тренер) плитка ведёт прямо в раздел. */
  activeId?: MetricId;
  onPick: (metric: MetricConfig) => void;
  loading?: boolean;
  /** Сеткой 2×2 вместо ленты: у админа и тренера плитки — главное на экране. */
  grid?: boolean;
}

/**
 * Ряд метрик: у владельца — переключатель главной карточки (персиковая рамка
 * переезжает на выбранную плитку), у остальных ролей — сводка со ссылками.
 */
export default function MetricRail({ metrics, activeId, onPick, loading, grid }: Props) {
  const { t } = useTranslation('dashboard');

  return (
    <div className={grid ? s.tileGrid : s.rail} role={activeId ? 'tablist' : undefined}>
      {metrics.map((m, i) => {
        const active = m.id === activeId;
        return (
          <motion.button
            key={m.id}
            type="button"
            role={activeId ? 'tab' : undefined}
            aria-selected={activeId ? active : undefined}
            className={active ? `${s.tile} ${s.tileOn}` : s.tile}
            onClick={() => onPick(m)}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.42 + i * 0.06, ease: EASE }}
          >
            {active && (
              <motion.span
                layoutId="phone-metric-ring"
                className={s.tileRing}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className={s.tileLabel}>
              <span className={s.tileDot} style={{ background: m.color }} />
              {t(`phone.metricShort.${m.id}`)}
            </span>
            {loading ? (
              <span className={s.tileSkel} />
            ) : (
              <span className={s.tileValue}>{m.value}</span>
            )}
            <span className={s.tileTrend}>
              {!loading && m.changePct !== null && (
                <span className={m.changePct >= 0 ? s.up : s.down}>
                  <TrendArrow up={m.changePct >= 0} />
                  {fmtPct(m.changePct)}
                </span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
