import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loyaltyApi } from '../../../../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../../../../api/queryKeys';
import { errorMessage } from '../../../../../../../api/errorMessage';
import { useToast } from '../../../../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../../../../components/ui/index';
import { useStudioCurrency } from '../../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../../components/UI';
import type { GiftCertificate } from '../../../../../../../api/loyalty/loyalty.types';
import IssueCertificateForm from './IssueCertificateForm';

const STATUS_COLOR: Record<GiftCertificate['status'], string> = {
  active: '#5BAB72',
  used: 'var(--text3)',
  expired: '#D88C9A',
};

interface Props {
  denominations: number[];
}

export default function IssuedCertificates({ denominations }: Props) {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const qc = useQueryClient();
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;

  const { data: certificates = [], isError } = useQuery({
    queryKey: queryKeys.loyaltyCertificates,
    queryFn: () => loyaltyApi.getCertificates(),
  });

  const [redeemTarget, setRedeemTarget] = useState<GiftCertificate | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyCertificates });
    qc.invalidateQueries({ queryKey: queryKeys.loyaltyStats });
  };

  const redeemMut = useMutation({
    mutationFn: (id: number) => loyaltyApi.redeemCertificate(id),
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const copyCode = (cert: GiftCertificate) => {
    navigator.clipboard.writeText(cert.code);
    setCopiedId(cert.id);
    setTimeout(() => setCopiedId(prev => (prev === cert.id ? null : prev)), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {isError && <div style={{ fontSize: '12px', color: '#D88C9A' }}>{t('toasts.loadFailed')}</div>}

      <IssueCertificateForm denominations={denominations} onIssued={invalidate} />

      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.certIssued')}</div>
        {certificates.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t('config.certEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {certificates.map(cert => (
              <div key={cert.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.03em' }}>{cert.code}</span>
                    <button
                      onClick={() => copyCode(cert)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: copiedId === cert.id ? '#5BAB72' : 'var(--text3)', display: 'flex' }}
                    >
                      {copiedId === cert.id ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      )}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {fmt(cert.amount)}
                    {cert.expires_at && ` · ${t('config.promoUntil')} ${cert.expires_at}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: STATUS_COLOR[cert.status] }}>{t(`config.certStatus.${cert.status}`)}</span>
                  {cert.status === 'active' && (
                    <button
                      onClick={() => setRedeemTarget(cert)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      {t('config.certRedeem')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {redeemTarget && (
        <ConfirmModal
          title={t('config.certRedeemTitle')}
          message={t('config.certRedeemMessage', { code: redeemTarget.code })}
          onConfirm={async () => { await redeemMut.mutateAsync(redeemTarget.id); }}
          onClose={() => setRedeemTarget(null)}
        />
      )}
    </div>
  );
}
