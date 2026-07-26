import { useTranslation } from 'react-i18next';
import type { PeriodSummary, ServiceReportRow, TrainerReportRow } from '../../types';
import { BAR_COLORS } from '../../constants';
import { fmtMoneyCompact } from '../../../../../lib/format';
import styles from '../../Overview.module.css';

interface Props {
  services: ServiceReportRow[];
  trainers: TrainerReportRow[];
  summary: PeriodSummary | null;
  currencySymbol: string;
  loading?: boolean;
}

/** Три полоски-заглушки: пока данные едут, «Нет данных» было бы враньём. */
const RowsSkeleton = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} className={styles.skel} style={{ height: '22px', marginBottom: '10px' }} />
    ))}
  </>
);

export default function SummaryWidgets({ services, trainers, summary, currencySymbol, loading }: Props) {
  const { t } = useTranslation('dashboard');
  // Загрузка тренера = его занятия / максимум по студии.
  const maxLessons = Math.max(1, ...trainers.map(tr => tr.lessons_count));

  return (
    <div className="grid-3">
      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>{t('summary.topServices')}</div>
        <div>
          {loading && <RowsSkeleton />}
          {!loading && services.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('state.noData')}</div>}
          {services.slice(0, 4).map((s, i) => (
            <div key={s.service} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span>{s.service}</span><span style={{ fontWeight: 700 }}>{Math.round(s.share_pct)}%</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                <div style={{ width: `${s.share_pct}%`, height: '100%', background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: '4px', transition: 'width 1s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>{t('summary.trainersLoad')}</div>
        <div>
          {loading && <RowsSkeleton />}
          {!loading && trainers.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('state.noData')}</div>}
          {trainers.slice(0, 4).map((tr, i) => {
            const pct = Math.round((tr.lessons_count / maxLessons) * 100);
            return (
              <div key={tr.trainer_id} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span>{tr.name}</span><span style={{ fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: '4px' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>{t('summary.financeMonth')}</div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{t('summary.revenue')}</div>
          <div style={{ fontSize: '22px', fontWeight: 800 }}>{fmtMoneyCompact(summary?.revenue ?? 0, currencySymbol)}</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{t('summary.expenses')}</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{fmtMoneyCompact(summary?.expenses ?? 0, currencySymbol)}</div>
        </div>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{t('summary.avgCheck')}</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{fmtMoneyCompact(summary?.avg_check ?? 0, currencySymbol)}</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('summary.profit')}</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent2)' }}>{fmtMoneyCompact(summary?.profit ?? 0, currencySymbol)}</div>
        </div>
      </div>
    </div>
  );
}
