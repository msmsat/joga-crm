// Живое превью нового занятия в сетке: стоит на слоте, пока открыта форма
// создания, и повторяет её — название услуги и выбранное время.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatIndexToTimeStr } from '../../utils';

export interface PreviewSlot {
  timeStart: number;
  timeEnd: number;
  bufferAfter?: number;
}

export function NewBookingPreview({ slot, ti, title, previewRef }: {
  slot: PreviewSlot;
  /** Час клетки, в которой превью начинается. */
  ti: number;
  title: string;
  previewRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation('journal');
  return (
    <div
      ref={previewRef}
      className="j-new-preview"
      style={{
        position: 'absolute', left: 0, right: 28,
        top: (slot.timeStart - ti) * 72,
        height: (slot.timeEnd - slot.timeStart) * 72 - 1,
        borderRadius: '10px', boxSizing: 'border-box', pointerEvents: 'none',
        zIndex: 9999, overflow: 'hidden',
        background: 'var(--bg-card)',
        boxShadow: `0 0 0 1.5px rgba(249,160,139,0.7), 0 16px 40px -4px rgba(26,26,26,0.15), 0 4px 12px rgba(249,160,139,0.2)`
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(249,160,139,0.18) 0%, rgba(249,160,139,0.04) 60%, rgba(255,200,180,0.10) 100%)',
        animation: 'preview-pulse 2.4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%',
        background: 'var(--peach)', boxShadow: '0 0 0 3px rgba(249,160,139,0.25)',
        animation: 'live-dot 1.4s ease-in-out infinite',
      }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '8px 18px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--onyx)', lineHeight: 1.2, letterSpacing: '-0.2px' }}>
          {title || t('grid.newLessonPreview')}
        </div>
        {(slot.timeEnd - slot.timeStart) * 72 > 36 && (
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--peach)', marginTop: 3, opacity: 0.9 }}>
            {formatIndexToTimeStr(slot.timeStart)} – {formatIndexToTimeStr(slot.timeEnd)}
          </div>
        )}
      </div>
    </div>
  );
}
