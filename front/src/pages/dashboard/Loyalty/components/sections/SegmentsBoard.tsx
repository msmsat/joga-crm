import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import styles from '../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { errorMessage } from '../../../../../api/errorMessage';
import { useToast } from '../../../../../components/ui/Toast';
import { Dialog, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/index';
import type { Segment, SegmentKey } from '../../../../../api/loyalty/loyalty.types';

// Порядок, цвет и действие кампании каждого сегмента. at_risk дарит баллы
// («Выдать бонус»), остальные — рассылка письма («Запустить кампанию»).
const SEGMENT_META: { key: SegmentKey; color: string; action: 'points' | 'email' }[] = [
  { key: 'at_risk', color: '#D88C9A', action: 'points' },
  { key: 'vip_idle', color: '#9B8EC4', action: 'email' },
  { key: 'expiring_subscription', color: '#E8A55C', action: 'email' },
  { key: 'lost_newcomers', color: '#4A80C4', action: 'email' },
  { key: 'upsell_candidates', color: '#5BAB72', action: 'email' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: '12px', border: '1.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
  fontFamily: 'Manrope, sans-serif', outline: 'none',
};

export default function SegmentsBoard() {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: segments = [], isError } = useQuery({
    queryKey: queryKeys.loyaltySegments,
    queryFn: () => loyaltyApi.getSegments(),
  });

  const byKey = new Map(segments.map(s => [s.key, s]));

  // Открытая кампания: сегмент + его действие. Инпуты — points / message.
  const [campaign, setCampaign] = useState<{ seg: Segment; action: 'points' | 'email' } | null>(null);
  const [points, setPoints] = useState('200');
  const [message, setMessage] = useState('');

  const runMut = useMutation({
    mutationFn: () => {
      const c = campaign!;
      return loyaltyApi.runCampaign(c.seg.key, c.action === 'points'
        ? { action: 'points', points: Number(points) }
        : { action: 'email', message });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.loyaltyStats });
      qc.invalidateQueries({ queryKey: queryKeys.loyaltySegments });
      const key = campaign!.action === 'points' ? 'segmentsBoard.toasts.pointsDone' : 'segmentsBoard.toasts.emailDone';
      toast.success(t(key, { processed: res.processed, emails: res.emails_sent }));
      setCampaign(null);
      setMessage('');
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const openCampaign = (seg: Segment, action: 'points' | 'email') => {
    setPoints('200');
    setMessage('');
    setCampaign({ seg, action });
  };

  const canSubmit = campaign?.action === 'points'
    ? Number(points) > 0
    : (message.trim().length > 0);

  const previewLine = (name: string, days: number | null): string =>
    days === null ? `${name} · ${t('segmentsBoard.neverVisited')}` : `${name} · ${t('segmentsBoard.daysAgo', { count: days })}`;

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800 }}>{t('segmentsBoard.title')}</div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{t('segmentsBoard.subtitle')}</div>
      </div>

      {isError && <div style={{ fontSize: '12px', color: '#D88C9A', marginBottom: '12px' }}>{t('toasts.loadFailed')}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {SEGMENT_META.map(({ key, color, action }) => {
          const seg = byKey.get(key);
          const count = seg?.count ?? 0;
          const empty = count === 0;
          return (
            <div key={key} className={styles.statCard} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', fontWeight: 800 }}>{t(`segmentsBoard.segments.${key}.name`)}</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '3px' }}>{t(`segmentsBoard.segments.${key}.desc`)}</div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color, lineHeight: 1, flexShrink: 0 }}>{count}</div>
              </div>

              {empty ? (
                <div style={{ fontSize: '12px', color: 'var(--text3)', opacity: 0.6, padding: '8px 0' }}>{t('segmentsBoard.empty')}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: 'var(--text2)' }}>
                    {seg!.preview.map(c => (
                      <div key={c.client_id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {previewLine(c.name, c.days_inactive)}
                      </div>
                    ))}
                    {count > seg!.preview.length && (
                      <div style={{ color: 'var(--text3)' }}>{t('segmentsBoard.more', { count: count - seg!.preview.length })}</div>
                    )}
                  </div>
                  <button
                    onClick={() => seg && openCampaign(seg, action)}
                    className={styles.configureBtn}
                    style={{
                      marginTop: 'auto', justifyContent: 'center', width: '100%',
                      background: `linear-gradient(135deg, ${color}, ${color})`, color: '#fff', border: 'none', cursor: 'pointer',
                    }}
                  >
                    {t(`segmentsBoard.segments.${key}.action`)}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {campaign && (
        <Dialog onClose={() => setCampaign(null)}>
          <ModalHeader
            title={t(`segmentsBoard.segments.${campaign.seg.key}.action`)}
            subtitle={t('segmentsBoard.campaignSub', {
              name: t(`segmentsBoard.segments.${campaign.seg.key}.name`),
              count: campaign.seg.count,
            })}
          />
          <ModalBody>
            {campaign.action === 'points' ? (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>{t('segmentsBoard.pointsLabel')}</label>
                <input type="number" min="1" value={points} onChange={e => setPoints(e.target.value)} style={inputStyle} />
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>{t('segmentsBoard.messageLabel')}</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t('segmentsBoard.messagePlaceholder')}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>{t('segmentsBoard.emailNote')}</div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <GhostButton>{t('drawer.cancel')}</GhostButton>
            <PrimaryButton onClick={() => runMut.mutate()} disabled={!canSubmit} loading={runMut.isPending}>
              {t('segmentsBoard.confirm')}
            </PrimaryButton>
          </ModalFooter>
        </Dialog>
      )}
    </div>
  );
}
