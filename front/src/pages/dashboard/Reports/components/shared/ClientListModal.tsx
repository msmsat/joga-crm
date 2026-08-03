import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ModalShell, ModalHeader, ModalBody, GhostButton, PrimaryButton, Input, EmptyState,
} from '../../../../../components/ui/index';
import { fmtInt, fmtRelativeDate } from '../../../../../lib/format';
import { getInitials, getFullName } from '../../../Clients/utils/mapClient';
import type { SegmentClientRow } from '../../types';

export interface ClientListModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: SegmentClientRow[];
  valueLabel: string;
  loading?: boolean;
  onCampaign?: () => void;
}

const EASE: [number, number, number, number] = [0.34, 1.1, 0.64, 1];

function exportCsv(rows: SegmentClientRow[]) {
  if (!rows.length) return;
  const body = rows.map(r => [
    getFullName(r.name, r.last_name),
    r.phone ?? '',
    r.last_visit_date ?? '',
    r.value != null ? String(r.value) : '',
  ].map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿name,phone,lastVisit,value\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clients-export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ClientRow({ row, valueLabel, index, reduceMotion }: {
  row: SegmentClientRow; valueLabel: string; index: number; reduceMotion: boolean;
}) {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const fullName = getFullName(row.name, row.last_name);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.02, 0.3), duration: 0.24, ease: EASE }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/dashboard/clients?client=${row.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
        borderRadius: '12px', cursor: 'pointer',
        background: hovered ? 'rgba(249,160,139,0.06)' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
        background: 'rgba(249,160,139,0.14)', color: '#C07060',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', fontWeight: 800,
      }}>
        {getInitials(row.name, row.last_name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13.5px', fontWeight: 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={fullName}>
          {fullName}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
          {row.phone ?? '—'}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
          {row.value != null ? fmtInt(row.value) : '—'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{valueLabel}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
          {row.last_visit_date ? fmtRelativeDate(row.last_visit_date) : t('clients.neverVisited')}
        </div>
      </div>

      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}
      >
        <path d={hovered ? 'M11 6l8 6-8 6' : 'M9 6l8 6-8 6'} />
      </svg>
    </motion.div>
  );
}

export function ClientListModal({ open, onClose, title, subtitle, rows, valueLabel, loading, onCampaign }: ClientListModalProps) {
  const { t } = useTranslation('reports');
  const reduceMotion = !!useReducedMotion();
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      getFullName(r.name, r.last_name).toLowerCase().includes(q) || (r.phone ?? '').includes(q));
  }, [rows, search]);

  if (!open) return null;

  // На планшете левая панель модалки скрыта — вместе с ней исчезали и оба
  // действия. Те же кнопки рисуются вторым экземпляром внизу списка,
  // видим всегда ровно один (см. .vm-narrow-only в App.css).
  const actions = (
    <>
      {onCampaign && <PrimaryButton onClick={onCampaign}>{t('clients.campaign')}</PrimaryButton>}
      <GhostButton onClick={() => exportCsv(filteredRows)}>{t('clients.exportList')}</GhostButton>
    </>
  );

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(249,160,139,0.55)', marginBottom: '20px' }}>
        <circle cx="12" cy="12" r="11" fill="rgba(249,160,139,0.08)" />
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="2.3" />
          <path d="M4.6 18c.6-2.6 2.3-4 4.4-4s3.8 1.4 4.4 4" />
          <circle cx="16.2" cy="9.6" r="1.9" />
          <path d="M14.9 14.3c1.6.3 2.7 1.6 3.1 3.7" />
        </g>
      </svg>

      <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-1px' }}>
        {fmtInt(rows.length)}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.4 }}>
          {subtitle}
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '20px' }}>
        {actions}
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose} size="lg" left={left}>
      <ModalHeader title={title} />
      <ModalBody>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>…</div>
        ) : rows.length === 0 ? (
          <EmptyState size="sm" icon="clients" title={t('empty.noRows')} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={search}
                  onChange={setSearch}
                  placeholder={t('clients.listSearch')}
                  icon={
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  }
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {t('clients.shownOf', { shown: filteredRows.length, total: rows.length })}
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState
                size="sm"
                icon="search"
                title={t('clients.noMatches', { query: search })}
                action={<GhostButton onClick={() => setSearch('')}>{t('clients.resetSearch')}</GhostButton>}
              />
            ) : (
              // Скроллится сам список, а не тело модалки: поиск и счётчик
              // остаются на месте. flex:0 1 auto — короткий список не растягивает
              // модалку, длинный ужимается до её высоты и скроллится внутри.
              <div className="ms-scroll" style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {filteredRows.map((row, i) => (
                  <ClientRow key={row.id} row={row} valueLabel={valueLabel} index={i} reduceMotion={reduceMotion} />
                ))}
              </div>
            )}
          </>
        )}
        <div className="vm-narrow-only" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px' }}>{actions}</div>
        </div>
      </ModalBody>
    </ModalShell>
  );
}
