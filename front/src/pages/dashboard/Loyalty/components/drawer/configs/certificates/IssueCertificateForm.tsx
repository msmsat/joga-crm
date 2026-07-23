import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import styles from '../../../../Loyalty.module.css';
import { loyaltyApi } from '../../../../../../../api/loyalty/loyalty.api';
import { clientsApi } from '../../../../../../../api/clients/clients.api';
import { financesApi } from '../../../../../../../api/finances/finances.api';
import { errorMessage } from '../../../../../../../api/errorMessage';
import { useToast } from '../../../../../../../components/ui/Toast';
import { useStudioCurrency } from '../../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../../components/UI';
import { queryKeys } from '../../../../../../../api/queryKeys';
import type { GiftCertificate } from '../../../../../../../api/loyalty/loyalty.types';

const DEFAULT_DENOMS = [1000, 2500, 5000, 10000];

interface Props {
  denominations: number[];
  onIssued: () => void;
}

export default function IssueCertificateForm({ denominations, onIssued }: Props) {
  const { t } = useTranslation('loyalty');
  const toast = useToast();
  const queryClient = useQueryClient();
  const currency = getCurrencySymbol(useStudioCurrency());
  const fmt = (n: number) => `${currency}${n.toLocaleString('ru-RU')}`;
  const choices = Array.from(new Set([...DEFAULT_DENOMS, ...denominations])).sort((a, b) => a - b);

  const [amount, setAmount] = useState(choices[0] ?? 1000);
  const [customAmount, setCustomAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [issued, setIssued] = useState<GiftCertificate | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: clientResults } = useQuery({
    queryKey: ['clients', 'search', clientQuery],
    queryFn: () => clientsApi.getList({ search: clientQuery, limit: 5 }),
    enabled: clientQuery.trim().length >= 2 && clientId === null,
  });

  const { data: accounts } = useQuery({
    queryKey: queryKeys.finAccounts,
    queryFn: financesApi.getAccounts,
  });

  const issueMut = useMutation({
    mutationFn: () => loyaltyApi.createCertificate({
      amount,
      cert_type: 'gift',
      recipient_name: recipientName || null,
      client_id: clientId,
      account_id: accountId,
    }),
    onSuccess: (cert) => {
      setIssued(cert);
      onIssued();
      if (accountId !== null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.finOperationsAll });
        queryClient.invalidateQueries({ queryKey: queryKeys.finAccounts });
      }
      toast.success(t('toasts.saved'));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const reset = () => {
    setIssued(null);
    setRecipientName('');
    setClientQuery('');
    setClientId(null);
    setCustomAmount('');
    setAccountId(null);
  };

  const copyCode = () => {
    if (!issued) return;
    navigator.clipboard.writeText(issued.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (issued) {
    return (
      <div style={{ padding: '20px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(91,171,114,0.3)', background: 'rgba(91,171,114,0.06)', textAlign: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#5BAB72', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>{t('config.certIssuedTitle')}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '14px' }}>{issued.code}</div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button onClick={copyCode} className={styles.configureBtn} style={{ background: copied ? '#5BAB72' : 'var(--bg)', color: copied ? 'white' : 'var(--text2)', border: '1px solid var(--border)' }}>
            {copied ? t('config.certCopied') : t('config.certCopyCode')}
          </button>
          <button onClick={reset} className={styles.configureBtn} style={{ background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            {t('config.certIssueAnother')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px' }}>{t('config.certIssue')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.denominations')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {choices.map(d => (
              <button
                key={d}
                onClick={() => { setAmount(d); setCustomAmount(''); }}
                className={styles.btnOption}
                style={{
                  padding: '8px 16px',
                  border: `1px solid ${amount === d && !customAmount ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`,
                  background: amount === d && !customAmount ? 'rgba(91,171,114,0.1)' : 'var(--bg)',
                  color: amount === d && !customAmount ? '#5BAB72' : 'var(--text)',
                  fontSize: '13px', fontWeight: 600,
                }}
              >
                {fmt(d)}
              </button>
            ))}
            <input
              type="number"
              min="1"
              value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); const n = Number(e.target.value); if (n > 0) setAmount(n); }}
              placeholder={t('config.certCustomAmount')}
              style={{ width: '110px', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: `1px solid ${customAmount ? 'rgba(91,171,114,0.4)' : 'var(--border)'}`, background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.certRecipientName')}</label>
          <input
            value={recipientName}
            onChange={e => setRecipientName(e.target.value)}
            placeholder={t('config.certRecipientPlaceholder')}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.certLinkClient')}</label>
          {clientId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(91,171,114,0.4)', background: 'rgba(91,171,114,0.08)' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{clientQuery}</span>
              <button onClick={() => { setClientId(null); setClientQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ) : (
            <input
              value={clientQuery}
              onChange={e => setClientQuery(e.target.value)}
              placeholder={t('config.certClientSearchPlaceholder')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          )}
          {!clientId && clientResults && clientResults.items.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, marginTop: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {clientResults.items.map(c => {
                const name = c.last_name ? `${c.name} ${c.last_name}` : c.name;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setClientId(c.id); setClientQuery(name); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>{t('config.certAccount')}</label>
          <select
            value={accountId ?? ''}
            onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
          >
            <option value="">{t('config.certAccountNone')}</option>
            {accounts?.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => issueMut.mutate()}
          disabled={amount <= 0 || issueMut.isPending}
          className={styles.configureBtn}
          style={{ background: amount > 0 ? '#5BAB72' : 'var(--border)', color: amount > 0 ? 'white' : 'var(--text3)', justifyContent: 'center', width: '100%' }}
        >
          {issueMut.isPending ? t('drawer.saving') : t('config.certIssueButton')}
        </button>
      </div>
    </div>
  );
}
