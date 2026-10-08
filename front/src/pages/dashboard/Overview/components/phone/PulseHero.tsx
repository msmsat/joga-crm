import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Segmented } from '../../../../../components/ui/modal';
import { fmtInt, fmtMoney, fmtPct } from '../../../../../lib/format';
import { useCountUp } from '../../hooks/useCountUp';
import type { MetricConfig, SeriesPoint } from '../../types';
import PulseChart from './PulseChart';
import RetentionBars from './RetentionBars';
import { ArrowUpRight, TrendArrow } from './icons';
import { cap, localDate } from './dates';
import s from './PulseHero.module.css';

export type Period = 'week' | 'month' | 'year';

const EASE = [0.22, 1, 0.36, 1] as const;
/** Карточка въезжает 0.75 с; число и кривая стартуют, когда она почти на месте. */
const INTRO_DELAY = 0.35;

interface Props {
  metric: MetricConfig;
  /** Сырое значение активной метрики; null — сводка ещё едет. */
  value: number | null;
  series: SeriesPoint[];
  seriesLoading: boolean;
  period: Period;
  setPeriod: (p: Period) => void;
  currencySymbol: string;
}

function tickLabel(iso: string, period: Period, locale: string): string {
  const d = localDate(iso);
  if (period === 'week') return d.toLocaleDateString(locale, { weekday: 'short' });
  if (period === 'month') return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return d.toLocaleDateString(locale, { month: 'short' });
}

function pointLabel(iso: string, period: Period, locale: string): string {
  const d = localDate(iso);
  return cap(period === 'year'
    ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long' }));
}

/**
 * Главная карточка телефона — «пульс» студии: значение активной метрики
 * крупно, тренд к прошлому месяцу и живая кривая за период. Единственная
 * тёмная поверхность страницы: на неё глаз падает первым.
 */
export default function PulseHero({ metric, value, series, seriesLoading, period, setPeriod, currencySymbol }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const navigate = useNavigate();
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  // Пауза нужна только при входе на страницу: смена периода или метрики
  // перерисовывает кривую сразу.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);
  const delay = intro ? INTRO_DELAY : 0;

  const isMoney = metric.id === 'revenue';
  const isRetention = metric.id === 'retention';
  const format = (v: number) => isMoney ? fmtMoney(v, currencySymbol)
    : isRetention ? `${Math.round(v)}%` : fmtInt(v);
  const countRef = useCountUp(value, format, metric.id, delay);
  // Миллионы в валюте не влезают в строку кеглем 44 — число ужимается, а не
  // уезжает за край карточки.
  const length = value != null ? format(value).length : 0;
  const numberClass = length > 13 ? `${s.number} ${s.numberXs}` : length > 10 ? `${s.number} ${s.numberSm}` : s.number;

  const locale = i18n.language;
  const point = scrubIndex != null ? series[scrubIndex] : undefined;
  const label = point
    ? (metric.id === 'clients'
      ? t('phone.newClientsOn', { date: pointLabel(point.period, period, locale) })
      : pointLabel(point.period, period, locale))
    : metric.title;

  const ticks = series.length > 0
    ? [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
    : [];
  const changePct = metric.changePct;

  return (
    <motion.section
      className={s.hero}
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.1, ease: EASE }}
    >
      <div className={s.top}>
        <span className={s.label}>{label}</span>
        <button type="button" className={s.more} onClick={() => navigate(metric.route)}>
          {t('metrics.more')}
          <ArrowUpRight />
        </button>
      </div>

      <div className={numberClass}>
        {value == null ? (
          <span className={s.numberSkel} />
        ) : (
          <>
            <span ref={countRef} className={point ? s.ghost : undefined} />
            {point && <span className={s.scrubValue}>{format(point.value)}</span>}
          </>
        )}
      </div>

      <div className={s.delta}>
        {!point && value != null && changePct != null && (
          <>
            <span className={changePct >= 0 ? s.chipUp : s.chipDown}>
              <TrendArrow up={changePct >= 0} />
              {fmtPct(changePct)}
            </span>
            <span>{t('phone.vsPrev')}</span>
          </>
        )}
      </div>

      {/* Удержание повторяет раскладку графика (полотно, строка подписей,
          подвал): высота карточки не меняется, и лента метрик под ней не
          прыгает при переключении. */}
      {isRetention ? (
        <>
          <RetentionBars pct={value ?? 0} delay={delay} />
          <div className={s.ticks} />
          <div className={s.foot}>
            <p className={s.hint}>{t('phone.retentionHint')}</p>
          </div>
        </>
      ) : (
        <>
          {series.length === 0 ? (
            <div className={s.chartEmpty}>
              {seriesLoading ? <span className={s.chartSkel} /> : t('chart.noData')}
            </div>
          ) : (
            <PulseChart
              values={series.map(p => p.value)}
              drawKey={`${period}:${series.length}`}
              scrubIndex={scrubIndex}
              onScrub={setScrubIndex}
              delay={delay}
            />
          )}
          <div className={s.ticks}>
            {ticks.map(i => <span key={i}>{tickLabel(series[i].period, period, locale)}</span>)}
          </div>
          <div className={s.foot}>
            <Segmented<Period>
              value={period}
              onChange={setPeriod}
              ariaLabel={metric.title}
              options={[
                { value: 'week', label: t('chart.tabWeek') },
                { value: 'month', label: t('chart.tabMonth') },
                { value: 'year', label: t('chart.tabYear') },
              ]}
            />
          </div>
        </>
      )}
    </motion.section>
  );
}
