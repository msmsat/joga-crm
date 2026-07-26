import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ModalShell, ModalHeader, ModalBody, EmptyState } from '../../../../../../components/ui/index';
import { fmtInt, fmtMoney } from '../../../../../../lib/format';
import i18n from '../../../../../../i18n';
import { RingIndicator } from '../../shared/RingIndicator';
import { LESSON_STATUS_STYLE } from '../../shared/chartTheme';
import { ProgressBar } from '../../ProgressBar';
import type { SlotLessonRow } from '../../../types';

export interface SlotModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: SlotLessonRow[];
  loading?: boolean;
}

const EASE: [number, number, number, number] = [0.34, 1.1, 0.64, 1];

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDayMonth(iso: string): { day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(i18n.language, { month: 'short' }).replace('.', ''),
  };
}

function StatusChip({ status, label }: { status: string; label: string }) {
  const style = LESSON_STATUS_STYLE[status] ?? { bg: 'rgba(26,26,26,0.05)', fg: 'var(--text2)' };
  return (
    <span style={{
      padding: '3px 9px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
      background: style.bg, color: style.fg, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function LessonCard({ row, index, reduceMotion }: { row: SlotLessonRow; index: number; reduceMotion: boolean }) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const { day, month } = fmtDayMonth(row.date);
  const fillPct = row.total_spots ? (row.occupied / row.total_spots) * 100 : 0;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.3), duration: 0.24, ease: EASE }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/dashboard/journal?lesson_id=${row.id}`)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', borderRadius: '12px',
        cursor: 'pointer', background: hovered ? 'rgba(249,160,139,0.06)' : 'rgba(26,26,26,0.02)',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{ width: '34px', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{day}</div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{month}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{
            fontSize: '13.5px', fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={row.name}>
            {row.name}
          </span>
          <StatusChip status={row.status} label={t(`schedule.status.${row.status}`, row.status)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
              background: 'rgba(249,160,139,0.14)', color: '#C07060',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: 800,
            }}>
              {initials(row.teacher_name)}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{row.teacher_name}</span>
          </div>
          {row.hall && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text3)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.hall_color ?? 'var(--border)', flexShrink: 0 }} />
              {row.hall}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0, minWidth: '58px', marginTop: '3px' }}>
        <div style={{ width: '56px' }}><ProgressBar value={fillPct} height={5} /></div>
        <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>{row.occupied}/{row.total_spots}</span>
      </div>
    </motion.div>
  );
}

export function SlotModal({ open, onClose, title, subtitle, rows, loading }: SlotModalProps) {
  const { t } = useTranslation('reports');
  const reduceMotion = !!useReducedMotion();

  const summary = useMemo(() => {
    const totalLessons = rows.length;
    const avgFillPct = totalLessons
      ? rows.reduce((s, r) => s + (r.total_spots ? (r.occupied / r.total_spots) * 100 : 0), 0) / totalLessons
      : 0;
    const freeSpots = rows.reduce((s, r) => s + Math.max(r.total_spots - r.occupied, 0), 0);
    const lostRevenue = rows.reduce((s, r) => s + Math.max(r.total_spots - r.occupied, 0) * r.price, 0);
    return { totalLessons, avgFillPct, freeSpots, lostRevenue };
  }, [rows]);

  if (!open) return null;

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>
        {fmtInt(summary.totalLessons)}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>
        {t('schedule.slot.lessonsCount')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        <RingIndicator pct={summary.avgFillPct} reduceMotion={reduceMotion} />
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', marginTop: '8px' }}>
        {t('schedule.kpi.avgFillPct')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {t('schedule.kpi.freeSpots')}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{fmtInt(summary.freeSpots)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {t('schedule.kpi.lostRevenue')}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{fmtMoney(summary.lostRevenue)}</div>
        </div>
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} size="lg" left={left}>
      <ModalHeader title={title} subtitle={subtitle} />
      <ModalBody>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>{t('table.loading')}</div>
        ) : rows.length === 0 ? (
          <EmptyState size="sm" icon="calendar" title={t('empty.noLessons')} />
        ) : (
          <div className="ms-scroll" style={{ maxHeight: 'min(60vh, 520px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {rows.map((row, i) => (
              <LessonCard key={row.id} row={row} index={i} reduceMotion={reduceMotion} />
            ))}
          </div>
        )}
      </ModalBody>
    </ModalShell>
  );
}
