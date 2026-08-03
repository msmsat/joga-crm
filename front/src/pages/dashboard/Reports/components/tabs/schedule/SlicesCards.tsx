import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../../../../../../components/ui/index';
import { fmtMoney, fmtPct } from '../../../../../../lib/format';
import { ProgressBar } from '../../ProgressBar';
import { useInsightAction } from '../../../hooks/useInsightAction';
import { CardHeading } from '../../shared/CardHeading';
import type { ChronicLowRow, HallUtilRow, LessonSliceRow } from '../../../types';

export const CHRONIC_LOW_ID = 'reports-chronic-low';

function SectionCard({ id, title, description, formulaKey, children }: { id?: string; title: string; description?: string; formulaKey?: string; children: React.ReactNode }) {
  return (
    <Card padding={24} id={id}>
      <CardHeading title={title} description={description} formulaKey={formulaKey} />
      {children}
    </Card>
  );
}

function LessonSliceList({ rows, valueKey }: { rows: LessonSliceRow[]; valueKey: 'revenue' | 'fill_pct' }) {
  const { t } = useTranslation('reports');
  if (rows.length === 0) return <EmptyState size="sm" icon="calendar" title={t('empty.noLessons')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>
            {valueKey === 'revenue' ? fmtMoney(row.revenue) : `${Math.round(row.fill_pct)}%`}
            <span style={{ color: 'var(--text3)', fontWeight: 500 }}> · {t('schedule.slices.held', { count: row.held })}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ChronicLowList({ rows }: { rows: ChronicLowRow[] }) {
  const { t } = useTranslation('reports');
  const runAction = useInsightAction();
  const weekdayLabels = t('schedule.weekdaysMonFirst', { returnObjects: true }) as string[];

  if (rows.length === 0) return <EmptyState size="sm" icon="calendar" title={t('empty.noLessons')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map((row, i) => {
        const lastLessonId = row.lesson_ids[row.lesson_ids.length - 1];
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
            padding: '8px 10px', borderRadius: '10px', background: 'rgba(216,140,154,0.08)',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name} · {weekdayLabels[row.weekday - 1]} {row.hour}:00 · {Math.round(row.fill_pct)}% · {t('schedule.slices.weeks', { count: row.weeks })}
            </span>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => runAction('open_journal', { lesson_id: lastLessonId })}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', background: 'rgba(249,160,139,0.14)',
                  color: '#C07060', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {t('schedule.slices.move')}
              </button>
              <button
                onClick={() => runAction('open_journal', { lesson_id: lastLessonId })}
                style={{
                  padding: '5px 10px', borderRadius: '8px', border: 'none', background: 'rgba(216,140,154,0.14)',
                  color: '#D88C9A', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {t('schedule.slices.cancel')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HallsList({ rows }: { rows: HallUtilRow[] }) {
  const { t } = useTranslation('reports');
  if (rows.length === 0) return <EmptyState size="sm" icon="calendar" title={t('empty.noLessons')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {rows.map(row => (
        <div key={row.hall_id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{row.name}</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>{fmtPct(row.fill_pct)}</span>
          </div>
          <ProgressBar value={row.fill_pct} />
          {row.evening_idle_pct > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
              {t('schedule.slices.eveningIdle', { pct: Math.round(row.evening_idle_pct) })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export interface SlicesCardsProps {
  topProfitable: LessonSliceRow[];
  topFilled: LessonSliceRow[];
  chronicLow: ChronicLowRow[];
  halls: HallUtilRow[];
}

export function SlicesCards({ topProfitable, topFilled, chronicLow, halls }: SlicesCardsProps) {
  const { t } = useTranslation('reports');
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', marginBottom: '20px' }}>
      <SectionCard title={t('schedule.slices.topProfitable')} description={t('descriptions.schedule.topProfitable')} formulaKey="topProfitable">
        <LessonSliceList rows={topProfitable} valueKey="revenue" />
      </SectionCard>
      <SectionCard title={t('schedule.slices.topFilled')} description={t('descriptions.schedule.topFilled')} formulaKey="topFilled">
        <LessonSliceList rows={topFilled} valueKey="fill_pct" />
      </SectionCard>
      <SectionCard id={CHRONIC_LOW_ID} title={t('schedule.slices.chronicLow')} description={t('descriptions.schedule.chronicLow')} formulaKey="chronicLow">
        <ChronicLowList rows={chronicLow} />
      </SectionCard>
      <SectionCard title={t('schedule.slices.halls')} description={t('descriptions.schedule.halls')} formulaKey="hallUtil">
        <HallsList rows={halls} />
      </SectionCard>
    </div>
  );
}
