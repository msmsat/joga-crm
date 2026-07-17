import type { PeriodSummary, ServiceReportRow, TrainerReportRow } from '../../types';
import { BAR_COLORS, formatMoney } from '../../constants';

interface Props {
  services: ServiceReportRow[];
  trainers: TrainerReportRow[];
  summary: PeriodSummary | null;
}

export default function SummaryWidgets({ services, trainers, summary }: Props) {
  // Загрузка тренера = его занятия / максимум по студии.
  const maxLessons = Math.max(1, ...trainers.map(t => t.lessons_count));

  return (
    <div className="grid-3">
      <div className="card card-sm">
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Топ услуги</div>
        <div>
          {services.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Нет данных</div>}
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
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Нагрузка тренеров</div>
        <div>
          {trainers.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Нет данных</div>}
          {trainers.slice(0, 4).map((t, i) => {
            const pct = Math.round((t.lessons_count / maxLessons) * 100);
            return (
              <div key={t.trainer_id} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span>{t.name}</span><span style={{ fontWeight: 700 }}>{pct}%</span>
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
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>Финансы (месяц)</div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Выручка</div>
          <div style={{ fontSize: '22px', fontWeight: 800 }}>{summary ? formatMoney(summary.revenue) : '—'}</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Расходы</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{summary ? formatMoney(summary.expenses) : '—'}</div>
        </div>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>Средний чек</div>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{summary ? formatMoney(summary.avg_check) : '—'}</div>
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Прибыль</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent2)' }}>{summary ? formatMoney(summary.profit) : '—'}</div>
        </div>
      </div>
    </div>
  );
}
