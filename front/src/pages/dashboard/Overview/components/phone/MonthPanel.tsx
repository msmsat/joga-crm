import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Segmented, useSmoothHeight } from '../../../../../components/ui/modal';
import type { BookingModeSlice } from '../../../../../api/analytics/analytics.types';
import { fmtMoney } from '../../../../../lib/format';
import type { PeriodSummary, ServiceReportRow, TrainerReportRow } from '../../types';
import { BAR_COLORS } from '../../constants';
import SectionHead from './SectionHead';
import s from './PhoneLists.module.css';

type Tab = 'finance' | 'services' | 'trainers' | 'modes';

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  summary: PeriodSummary | null;
  services: ServiceReportRow[];
  trainers: TrainerReportRow[];
  bookingModes: BookingModeSlice[];
  currencySymbol: string;
  loading: boolean;
}

interface Row { key: string; label: string; pct: number }

function Bars({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <div className={s.calm}>{empty}</div>;
  return (
    <div className={s.bars}>
      {rows.map((row, i) => (
        <div key={row.key}>
          <div className={s.barTop}>
            <span className={s.barLabel}>{row.label}</span>
            <span className={s.barValue}>{row.pct}%</span>
          </div>
          <div className={s.barTrack}>
            <motion.span
              className={s.barFill}
              style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.min(1, row.pct / 100) }}
              transition={{ duration: 0.8, delay: 0.05 + i * 0.06, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * «Месяц в студии»: деньги, услуги, тренеры и модели записи одной карточкой с
 * переключателем — на телефоне четыре отдельные карточки были бы четырьмя
 * экранами прокрутки ради цифр, которые смотрят не каждый день.
 */
export default function MonthPanel({ summary, services, trainers, bookingModes, currencySymbol, loading }: Props) {
  const { t } = useTranslation('dashboard');
  const [tab, setTab] = useState<Tab>('finance');
  const body = useRef<HTMLDivElement>(null);
  useSmoothHeight(body);

  const tabs: Tab[] = bookingModes.length > 0
    ? ['finance', 'services', 'trainers', 'modes']
    : ['finance', 'services', 'trainers'];
  // Загрузка тренера = его занятия / максимум по студии (как на большом экране).
  const maxLessons = Math.max(1, ...trainers.map(tr => tr.lessons_count));
  const money = (v: number | undefined) => fmtMoney(v ?? 0, currencySymbol);
  const profit = summary?.profit ?? 0;

  return (
    <section className={s.section}>
      <SectionHead title={t('phone.month.title')} />
      <div className={s.card}>
        <div className={s.monthTabs}>
          <Segmented<Tab>
            fit
            value={tab}
            onChange={setTab}
            ariaLabel={t('phone.month.title')}
            options={tabs.map(v => ({ value: v, label: t(`phone.month.${v}`) }))}
          />
        </div>

        <div ref={body} className={s.monthBody}>
          {loading ? (
            <div className={s.bars}>
              {[0, 1, 2].map(i => <span key={i} className={s.rowSkel} />)}
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                {tab === 'finance' && (
                  <dl className={s.fin}>
                    <div><dt>{t('summary.revenue')}</dt><dd>{money(summary?.revenue)}</dd></div>
                    <div><dt>{t('summary.expenses')}</dt><dd>{money(summary?.expenses)}</dd></div>
                    <div><dt>{t('summary.avgCheck')}</dt><dd>{money(summary?.avg_check)}</dd></div>
                    <div className={profit > 0 ? s.finGood : profit < 0 ? s.finBad : undefined}>
                      <dt>{t('summary.profit')}</dt><dd>{money(profit)}</dd>
                    </div>
                  </dl>
                )}
                {tab === 'services' && (
                  <Bars
                    empty={t('state.noData')}
                    rows={services.slice(0, 4).map(sv => ({ key: sv.service, label: sv.service, pct: Math.round(sv.share_pct) }))}
                  />
                )}
                {tab === 'trainers' && (
                  <Bars
                    empty={t('state.noData')}
                    rows={trainers.slice(0, 4).map(tr => ({
                      key: String(tr.trainer_id), label: tr.name, pct: Math.round((tr.lessons_count / maxLessons) * 100),
                    }))}
                  />
                )}
                {tab === 'modes' && (
                  <div className={s.modes}>
                    {bookingModes.map(row => (
                      <div key={row.booking_mode} className={s.mode}>
                        <div className={s.modeHead}>
                          <span>{t(`bookingModes.${row.booking_mode}`)}</span>
                          <span className={s.modeUtil}>
                            {t('bookingModes.utilization')}
                            <b>{row.utilization_pct == null ? t('bookingModes.noData') : `${row.utilization_pct}%`}</b>
                          </span>
                        </div>
                        <dl className={s.modeGrid}>
                          <div><dt>{t('bookingModes.events')}</dt><dd>{row.events}</dd></div>
                          <div><dt>{t('bookingModes.bookings')}</dt><dd>{row.bookings}</dd></div>
                          <div><dt>{t('bookingModes.attended')}</dt><dd>{row.attended}</dd></div>
                          <div className={s.muted}><dt>{t('bookingModes.pending')}</dt><dd>{row.pending}</dd></div>
                          <div className={s.muted}><dt>{t('bookingModes.hold')}</dt><dd>{row.hold}</dd></div>
                          <div className={s.muted}><dt>{t('bookingModes.cancelled')}</dt><dd>{row.cancelled}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </section>
  );
}
