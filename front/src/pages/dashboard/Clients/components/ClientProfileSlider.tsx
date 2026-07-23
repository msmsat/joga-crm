import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClientData, EventRecord } from '../types';
import type { ClientProfile } from '../../../../api/clients/clients.types';
import { STATUSES, STATUS_COLORS, EVENT_FILTER_TABS, BONUS_OPTION_IDS, BONUS_POINTS } from '../constants';
import { useClientActions, type NoteItem } from '../hooks/useClientActions';
import { InlineEdit } from './InlineEdit';
import ClientOffersPanel from './ClientOffersPanel';
import { WalletTab } from './WalletTab';
import { useClientEvents, useClientNotes, useClientActivity, useClientInviteCode, useReferralEnabled } from '../hooks/useClientsList';
import { formatDate, formatMoney, getAvatarColor, getInitials } from '../utils/mapClient';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../components/UI';
import { ConfirmModal } from '../../../../components/ui/index';

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 7.09 7.09l1.08-1.08a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconNote = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const IconFreeze = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M7 7l10 10M17 7L7 17"/>
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconLocation = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconTelegram = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
  </svg>
);
const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IconGift = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
);
const IconHistory = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
    <polyline points="12 7 12 12 16 14"/>
  </svg>
);
const IconMessage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconTrendUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconCoin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <path d="M15 9H10.5a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5H9"/>
  </svg>
);
const IconSnow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="12" y1="2" x2="12" y2="22"/>
    <path d="M17 7l-5 5-5-5"/>
    <path d="M17 17l-5-5-5 5"/>
    <path d="M2 12h20"/>
    <path d="M7 7l-5 5 5 5"/>
    <path d="M17 7l5 5-5 5"/>
  </svg>
);

// ─── EVENT ICON ───────────────────────────────────────────────────────────────
function EventIcon({ type, c }: { type: EventRecord['type']; c: string }) {
  const cfg = {
    payment: { bg: 'rgba(91,171,114,0.12)', color: '#5BAB72', icon: <IconCoin/> },
    visit:   { bg: `${c}18`,                color: c,          icon: <IconCheck/> },
    booking: { bg: 'rgba(155,181,216,0.15)', color: '#4A80C4', icon: <IconPlus/> },
    cancel:  { bg: 'rgba(216,140,154,0.12)', color: '#D88C9A', icon: <IconClose/> },
    bonus:   { bg: 'rgba(252,174,145,0.15)', color: '#F9A08B', icon: <IconGift/> },
    freeze:  { bg: 'rgba(147,181,216,0.15)', color: '#4a7ca8', icon: <IconSnow/> },
  }[type];
  return (
    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: cfg.color }}>
      {cfg.icon}
    </div>
  );
}

// ─── LOYALTY ILLUS ────────────────────────────────────────────────────────────
function LoyaltyIllus({ points }: { points: number }) {
  const { t } = useTranslation('clients');
  const tier = points >= 8000 ? 'Platinum' : points >= 3000 ? 'Gold' : points >= 1000 ? 'Silver' : 'Bronze';
  const tierColors: Record<string, [string, string]> = {
    Platinum: ['#e8e8ff', '#9090d0'],
    Gold:     ['#fff8d6', '#f0c040'],
    Silver:   ['#f0f0f0', '#aaaaaa'],
    Bronze:   ['#fde8d8', '#c87941'],
  };
  const [bg, stroke] = tierColors[tier];
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const maxPoints = tier === 'Platinum' ? 15000 : tier === 'Gold' ? 8000 : tier === 'Silver' ? 3000 : 1000;
  const pct  = Math.min(points / maxPoints, 1);
  const dash = pct * circ;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: `${bg}60`, borderRadius: '12px', border: `1px solid ${stroke}40`, marginBottom: '12px' }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke={`${stroke}22`} strokeWidth="6"/>
        <circle cx="42" cy="42" r={r} fill="none" stroke={stroke} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 42 42)" style={{ transition: 'stroke-dasharray 1s ease' }}/>
        <text x="42" y="38" textAnchor="middle" fill={stroke} fontSize="10" fontWeight="800" fontFamily="Manrope">{tier}</text>
        <text x="42" y="52" textAnchor="middle" fill={stroke} fontSize="9" fontWeight="600" fontFamily="Manrope">{points.toLocaleString()}</text>
        <text x="42" y="62" textAnchor="middle" fill={`${stroke}99`} fontSize="7" fontWeight="500" fontFamily="Manrope">{t('panel.loyalty.points')}</text>
      </svg>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.loyalty.level', { tier })}</div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', lineHeight: 1.5 }}>
          {t('panel.loyalty.toNext', { points: (maxPoints - points).toLocaleString() })}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '6px' }}>
          <span style={{ background: `${stroke}22`, color: stroke, padding: '2px 8px', borderRadius: '20px', fontWeight: 700, fontSize: '10px' }}>
            {t('panel.loyalty.multiplier', { value: pct >= 1 ? '2.0' : pct >= 0.6 ? '1.5' : '1.0' })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── INVITE CODE (V5-7, 2.1) ──────────────────────────────────────────────────
function InviteCodeCard({ clientId, onCopy }: { clientId: number; onCopy: (value: string) => void }) {
  const { t } = useTranslation('clients');
  const referralEnabled = useReferralEnabled(true);
  const inviteCode = useClientInviteCode(clientId, referralEnabled);

  if (!referralEnabled || !inviteCode) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', background: 'rgba(252,174,145,0.08)', borderRadius: '12px', border: '1px solid rgba(249,160,139,0.25)', marginBottom: '12px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('panel.referral.title')}</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', letterSpacing: '1px', marginTop: '3px' }}>{inviteCode}</div>
      </div>
      <button
        onClick={() => onCopy(inviteCode)}
        style={{ fontSize: '11px', fontWeight: 700, padding: '6px 12px', borderRadius: '8px', background: 'var(--peach)', border: 'none', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}
      >
        <IconCopy/>{t('panel.referral.copy')}
      </button>
    </div>
  );
}

// ─── ABONEMENT CARD ───────────────────────────────────────────────────────────
function AbonementCard({ used, total, color, onRemind }: { used: number; total: number; color: string; onRemind: () => void }) {
  const { t } = useTranslation('clients');
  const remaining = Math.max(0, total - used);
  const pct   = total > 0 ? (remaining / total) * 100 : 0;
  const isMissing = total === 0;
  const isLow = total > 0 && remaining / total <= 0.25;
  const needsReminder = isMissing || isLow;
  return (
    <div style={{ padding: '14px 16px', background: needsReminder ? 'rgba(216,140,154,0.06)' : 'rgba(91,171,114,0.05)', borderRadius: '12px', border: `1px solid ${needsReminder ? 'rgba(216,140,154,0.2)' : 'rgba(91,171,114,0.18)'}`, marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.abonement.title')}</div>
        <div style={{ fontSize: '11px', color: needsReminder ? '#D88C9A' : '#5BAB72', fontWeight: 700 }}>{isMissing ? t('panel.abonement.noSubscription') : t('panel.abonement.lessons', { remaining, total })}</div>
      </div>
      <div style={{ position: 'relative', height: '8px', background: 'rgba(26,26,26,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: isLow ? 'linear-gradient(90deg,#D88C9A,#c07080)' : `linear-gradient(90deg,${color},${color}bb)`, borderRadius: '10px', transition: 'width 0.6s ease' }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: i < remaining ? color : 'rgba(26,26,26,0.1)', transition: 'background 0.3s' }}/>
        ))}
      </div>
      {needsReminder && (
        <div style={{ marginTop: '10px', color: '#D88C9A', fontSize: '11px', fontWeight: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {isMissing ? t('panel.abonement.noSubscriptionWarning') : remaining === 0 ? t('panel.abonement.finishedWarning') : t('panel.abonement.lowWarning')}
          </div>
          <button onClick={onRemind} style={{ marginTop: '8px', padding: '6px 9px', border: '1px solid rgba(216,140,154,0.45)', borderRadius: '7px', background: '#fff', color: '#B5677A', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope' }}>
            {t('panel.abonement.remind')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ACTIVITY CHART ───────────────────────────────────────────────────────────
type ChartPeriod = 'month3' | 'month6';
const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;

function ActivityChart({ clientId, c, clientName }: { clientId: number; c: string; clientName: string }) {
  const { t } = useTranslation('clients');
  const [expanded, setExpanded] = useState(false);
  const [period,   setPeriod]   = useState<ChartPeriod>('month3');
  const [hovered,  setHovered]  = useState<number | null>(null);

  const activity = useClientActivity(clientId); // 12 месяцев, хронологически, от старого к новому

  const miniBars = activity.map(a => a.visits);
  const miniMax  = Math.max(...miniBars, 1);

  const periodMonths = period === 'month3' ? 3 : 6;
  const detailedData = activity.slice(-periodMonths).map(a => ({
    l: t(`panel.activity.months.${MONTH_KEYS[Number(a.month.slice(5, 7)) - 1]}`),
    v: a.visits,
  }));

  const detailedMax  = Math.max(...detailedData.map(d => d.v), 1);
  const totalVisits  = detailedData.reduce((s, d) => s + d.v, 0);
  const avgPerMonth  = detailedData.length > 0 ? totalVisits / detailedData.length : 0;

  return (
    <div style={{
      padding: expanded ? '24px' : '14px 16px',
      background: expanded ? '#FFFFFF' : 'rgba(26,26,26,0.02)',
      borderRadius: '16px',
      border: expanded ? `1px solid ${c}40` : '1px solid var(--border)',
      marginBottom: '14px',
      cursor: expanded ? 'default' : 'pointer',
      transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
      boxShadow: expanded ? `0 16px 40px -8px ${c}25` : 'none',
      position: 'relative',
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}
    onClick={() => !expanded && setExpanded(true)}
    >
      <style>{`@keyframes chartFadeIn { from{opacity:0;transform:scale(0.98) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }`}</style>

      {expanded ? (
        <div style={{ animation: 'chartFadeIn 0.4s ease both' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{t('panel.activity.detailedTitle')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{clientName}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); setExpanded(false); }} style={{ background: 'rgba(26,26,26,0.04)', border: 'none', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background='rgba(216,140,154,0.1)'; e.currentTarget.style.color='#D88C9A'; }} onMouseLeave={e => { e.currentTarget.style.background='rgba(26,26,26,0.04)'; e.currentTarget.style.color='var(--text3)'; }}>
              <IconClose/>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: c, letterSpacing: '-1.5px', lineHeight: 1 }}>{totalVisits}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '6px' }}>{t('panel.activity.visitsInPeriod')}</div>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(26,26,26,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(26,26,26,0.04)' }}>
              {(['month3','month6'] as const).map(p => (
                <button key={p} onClick={e => { e.stopPropagation(); setPeriod(p); }} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: "'Manrope',sans-serif", background: period === p ? '#FFFFFF' : 'transparent', color: period === p ? 'var(--text)' : 'var(--text3)', boxShadow: period === p ? '0 2px 8px rgba(26,26,26,0.06)' : 'none', transition: 'all 0.2s' }}>{t(`panel.activity.periods.${p}`)}</button>
              ))}
            </div>
          </div>

          <div style={{ height: '160px', display: 'flex', alignItems: 'flex-end', gap: '6px', justifyContent: 'center', position: 'relative', marginTop: '10px', width: '100%', minWidth: 0 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 0 }}>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
              <div style={{ borderTop: '1px dashed rgba(26,26,26,0.06)', width: '100%' }}/>
            </div>
            {detailedData.map((d, i) => {
              const hPct     = (d.v / detailedMax) * 100;
              const isHov    = hovered === i;
              const showLbl  = period === 'month6' ? i % 2 === 0 : true;
              const isFirst  = i === 0;
              const isLast   = i === detailedData.length - 1;
              return (
                <div key={i} style={{ flex: 1, maxWidth: '30px', minWidth: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', position: 'relative', zIndex: isHov ? 10 : 1 }}
                  onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                    {isHov && (
                      <div style={{ position: 'absolute', bottom: `calc(${hPct}% + 8px)`, left: isFirst ? '0' : isLast ? '100%' : '50%', transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)', background: '#1A1A1A', color: '#FFF', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20 }}>
                        {t('panel.activity.visitsTooltip', { count: d.v })}
                        <div style={{ position: 'absolute', bottom: '-4px', left: isFirst ? '15px' : isLast ? 'calc(100% - 15px)' : '50%', transform: 'translateX(-50%) rotate(45deg)', width: '10px', height: '10px', background: '#1A1A1A', borderRadius: '2px' }}/>
                      </div>
                    )}
                    <div style={{ width: '100%', height: `${hPct}%`, background: `linear-gradient(180deg,${c} 0%,${c}20 100%)`, borderRadius: '6px 6px 4px 4px', transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)', opacity: hovered !== null && !isHov ? 0.4 : 1, transform: isHov ? 'scaleY(1.05)' : 'scaleY(1)', transformOrigin: 'bottom', border: isHov ? `1px solid ${c}` : '1px solid transparent', borderBottom: 'none' }}/>
                  </div>
                  <div style={{ fontSize: '9px', color: isHov ? 'var(--text)' : 'var(--text3)', fontWeight: 800, transition: 'color 0.2s', textTransform: 'uppercase', whiteSpace: 'nowrap', opacity: showLbl ? 1 : 0 }}>{d.l}</div>
                </div>
              );
            })}
          </div>

          {totalVisits > 0 ? (
            <div style={{ marginTop: '24px', padding: '16px', background: `${c}08`, borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '14px', border: `1px solid ${c}25` }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `linear-gradient(135deg,${c},${c}88)`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${c}40` }}>
                <IconTrendUp/>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>{t('panel.activity.insightTitle')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                  {t('panel.activity.insightBody', { avg: avgPerMonth.toFixed(1) })}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '24px', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>
              {t('panel.activity.emptyState')}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{t('panel.activity.compactTitle')}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.4 }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>{t('panel.activity.clickForDetails')}</span>
          </div>
          <svg width="100%" height="48" viewBox={`0 0 ${miniBars.length * 16} 48`} preserveAspectRatio="none">
            {miniBars.map((h, i) => {
              const barH = (h / miniMax) * 38;
              return (
                <g key={i}>
                  <rect x={i * 16 + 2} y={44 - barH} width="12" height={barH} rx="3" fill={`${c}30`} style={{ transition: 'all 0.3s' }}/>
                  <rect x={i * 16 + 2} y={44 - barH} width="12" height={Math.min(barH, 4)} rx="3" fill={c} style={{ transition: 'all 0.3s' }}/>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}

// ─── CLIENT PANEL ─────────────────────────────────────────────────────────────
function ClientPanel({ client, profile, onClose, onDelete }: {
  client: ClientData;
  profile?: ClientProfile | null;
  onClose: () => void;
  onDelete: (id: number) => void;
}) {
  void profile;
  const { t, i18n: i18nInstance } = useTranslation('clients');
  const currency = getCurrencySymbol(useStudioCurrency());
  const [activeTab,    setActiveTab]    = useState<'info' | 'events' | 'notes' | 'wallet'>('info');
  const [showStatusDD, setShowStatusDD] = useState(false);
  const [tagInput,     setTagInput]     = useState('');
  const [regValue,     setRegValue]     = useState(client.registration_date ?? '');
  const [editingReg,   setEditingReg]   = useState(false);
  const status = client.status;
  const frozen = client.frozen ?? false;
  const displaySubscription = client.active_subscription ?? client.subscription_alert;
  const tags = client.tags;
  const color = getAvatarColor(client.id, client.avatar_color);
  const sc = STATUS_COLORS[status] || '#999';

  // Полный список (профиль отдаёт только 3 последних) — грузим при открытии вкладки.
  const fullNotes = useClientNotes(client.id, activeTab === 'notes');
  const noteItems: NoteItem[] = (activeTab === 'notes' ? fullNotes : (client.notes ?? [])).map(n => ({
    id: n.id,
    text: n.text,
    date: new Date(n.created_at).toLocaleDateString(i18nInstance.language, { day: 'numeric', month: 'long' }),
  }));

  const actions = useClientActions(client.id);

  // Панель не перемонтируется при смене клиента — сбрасываем локальный UI-стейт
  // вручную вместо остатка предыдущей вкладки/дропдауна/черновика.
  useEffect(() => {
    setActiveTab('info');
    setShowStatusDD(false);
    setTagInput('');
    setRegValue(client.registration_date ?? '');
    setEditingReg(false);
  }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс только на смену клиента, не на каждое изменение полей client

  const apiEvents = useClientEvents(client.id, actions.eventFilter, activeTab === 'events');

  const bookingWindowStart = actions.bookingWindowStart;
  const next7Days = (() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const offset = bookingWindowStart + i;
      const d = new Date(now);
      d.setDate(now.getDate() + offset);
      return {
        offset,
        dayName: offset === 0 ? t('panel.bookingPanel.today') : d.toLocaleDateString(i18nInstance.language, { weekday: 'short' }),
        dayNum: d.getDate(),
      };
    });
  })();

  return (
    <div style={{ flex: 1, background: '#fff', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeSlide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes panelSlideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .cl-contact-link:hover .cl-cv { color: var(--peach) !important; }
        .cl-contact-link:hover .cl-cv-sub { color: var(--peach) !important; opacity: 0.6; }
        .cl-copy-btn:hover { background: rgba(26,26,26,0.06) !important; color: var(--peach) !important; }
        .cl-tag-suggest:hover { border-color: var(--peach) !important; color: var(--peach) !important; background: rgba(249,160,139,0.07) !important; }
        .cl-action-btn:hover { transform: translateY(-1px); }
        .cl-action-btn:active { transform: scale(0.94); }
        .cl-ev-row:hover { border-color: rgba(0,0,0,0.1) !important; background: rgba(26,26,26,0.01) !important; }
        .cl-bonus-opt:hover { border-color: var(--peach) !important; background: rgba(249,160,139,0.06) !important; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)', background: '#fdfcfb', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `linear-gradient(135deg,${color},${color}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: '#fff', boxShadow: `0 8px 20px -4px ${color}55`, flexShrink: 0 }}>{getInitials(client.name, client.last_name)}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{client.name}{client.last_name ? ' ' + client.last_name : ''}</div>
                {frozen && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: 'rgba(147,181,216,0.18)', color: '#4a7ca8', border: '1px solid rgba(147,181,216,0.3)', whiteSpace: 'nowrap' }}>
                    ❄ {t('status.frozen')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                  <button onClick={() => setShowStatusDD(v => !v)} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: `1px solid ${sc}44`, background: `${sc}18`, color: sc, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'Manrope' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc, display: 'inline-block' }}/>
                    {t(`status.${status}`, { defaultValue: status })}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {showStatusDD && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden', minWidth: '140px' }}>
                      {STATUSES.map(s => (
                        <div key={s} onClick={() => { setShowStatusDD(false); actions.updateStatus(s); }} style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: STATUS_COLORS[s], cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = `${STATUS_COLORS[s]}12`)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: STATUS_COLORS[s] }}/>{t(`status.${s}`)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>·</span>
                {editingReg ? (
                  <input
                    autoFocus
                    value={regValue}
                    onChange={e => setRegValue(e.target.value)}
                    onBlur={() => { setEditingReg(false); actions.updateRegistrationDate(regValue); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingReg(false); }}
                    style={{ fontSize: '11px', color: 'var(--peach)', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(249,160,139,0.5)', outline: 'none', fontFamily: 'Manrope', fontWeight: 600, width: '120px', padding: '0 2px' }}
                  />
                ) : (
                  <span
                    onClick={() => setEditingReg(true)}
                    title={t('panel.editDateHint')}
                    style={{ fontSize: '11px', color: 'var(--text3)', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.color='var(--peach)'; e.currentTarget.style.textDecoration='underline dotted'; }}
                    onMouseLeave={e => { e.currentTarget.style.color='var(--text3)'; e.currentTarget.style.textDecoration='none'; }}
                  >{t('panel.since', { date: formatDate(regValue) || regValue })}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', transition: 'all 0.2s', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background='rgba(26,26,26,0.06)'; e.currentTarget.style.color='var(--text)'; }} onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text3)'; }}>
            <IconClose/>
          </button>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {/* П.11 — Позвонить */}
          <button
            className="cl-action-btn"
            onClick={() => actions.handleCall(client.phone ?? '')}
            style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: '1px solid var(--border)', background: 'transparent', color: '#5BAB72', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(91,171,114,0.1)'; e.currentTarget.style.borderColor='#5BAB72'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='var(--border)'; }}
          >
            <IconPhone/>{t('panel.actions.call')}
          </button>
          {/* П.12 — Сообщение */}
          <button
            className="cl-action-btn"
            onClick={actions.toggleMessage}
            style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: `1px solid ${actions.showMessage ? '#4A80C4' : 'var(--border)'}`, background: actions.showMessage ? 'rgba(74,128,196,0.1)' : 'transparent', color: '#4A80C4', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(74,128,196,0.1)'; e.currentTarget.style.borderColor='#4A80C4'; }}
            onMouseLeave={e => { if (!actions.showMessage) { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='var(--border)'; } }}
          >
            <IconMessage/>{t('panel.actions.message')}
          </button>
          {/* П.13 — Записать */}
          <button
            className="cl-action-btn"
            onClick={actions.toggleBooking}
            style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: `1px solid ${actions.showBooking ? 'var(--peach)' : 'rgba(249,160,139,0.4)'}`, background: actions.showBooking ? 'rgba(249,160,139,0.12)' : 'rgba(249,160,139,0.06)', color: 'var(--peach)', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(249,160,139,0.14)'; e.currentTarget.style.borderColor='var(--peach)'; }}
            onMouseLeave={e => { if (!actions.showBooking) { e.currentTarget.style.background='rgba(249,160,139,0.06)'; e.currentTarget.style.borderColor='rgba(249,160,139,0.4)'; } }}
          >
            <IconCalendar/>{t('panel.actions.book')}
          </button>
          {/* П.14 — Бонус */}
          <button
            className="cl-action-btn"
            onClick={actions.toggleBonus}
            style={{ flex: 1, padding: '8px 4px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, border: `1px solid ${actions.showBonus ? '#f0c040' : 'var(--border)'}`, background: actions.showBonus ? 'rgba(240,192,64,0.1)' : 'transparent', color: '#c8a84b', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(240,192,64,0.1)'; e.currentTarget.style.borderColor='#f0c040'; }}
            onMouseLeave={e => { if (!actions.showBonus) { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='var(--border)'; } }}
          >
            <IconGift/>{t('panel.actions.bonus')}
          </button>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: 'flex' }}>
          {(['info','events','notes','wallet'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '9px 8px', fontSize: '12px', fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'Manrope', color: activeTab === tab ? 'var(--peach)' : 'var(--text3)', borderBottom: `2px solid ${activeTab === tab ? 'var(--peach)' : 'transparent'}`, transition: 'all 0.2s' }}>{t(`panel.tabs.${tab}`)}</button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 20px', minWidth: 0 }}>

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>

            {/* П.4 — Контакты: реальные ссылки (tel/mailto/t.me) + копирование отдельной иконкой */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>{t('panel.contacts.title')}</div>
              {(() => {
                const phoneDigits = client.phone ? client.phone.replace(/\D/g, '') : '';
                // П.3.2 — edit: ключ ClientUpdate + тип инпута; ссылка — по значению, карандаш — редактирование
                const rows: { icon: JSX.Element; val: string; sub: string; href: string | null; copyValue: string | null; edit?: { key: 'phone' | 'email' | 'birth_date' | 'city'; type: 'tel' | 'email' | 'date' | 'text' } }[] = [
                  { icon: <IconPhone/>,    val: client.phone ?? '—',      sub: t('panel.contacts.phone'),     href: client.phone ? `tel:${phoneDigits}` : null,             copyValue: client.phone ?? null, edit: { key: 'phone', type: 'tel' } },
                  { icon: <IconMail/>,     val: client.email ?? '—',      sub: t('panel.contacts.email'),     href: client.email ? `mailto:${client.email}` : null,          copyValue: client.email ?? null, edit: { key: 'email', type: 'email' } },
                  { icon: <IconTelegram/>, val: client.phone ? `+${phoneDigits}` : '—', sub: t('panel.contacts.telegram'), href: phoneDigits ? `https://t.me/+${phoneDigits}` : null, copyValue: null },
                  { icon: <IconCalendar/>, val: client.birth_date ?? '—', sub: t('panel.contacts.birthDate'), href: null, copyValue: null, edit: { key: 'birth_date', type: 'date' } },
                  { icon: <IconLocation/>, val: client.city ?? '—',       sub: t('panel.contacts.city'),      href: null, copyValue: null, edit: { key: 'city', type: 'text' } },
                ];
                return rows.map(({ icon, val, sub, href, copyValue, edit }) => {
                  const display = href ? (
                    <a href={href} target={href.startsWith('https://') ? '_blank' : undefined} rel={href.startsWith('https://') ? 'noopener' : undefined} className="cl-contact-link" style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
                      <div className="cl-cv" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', transition: 'color 0.15s' }}>{val}</div>
                      <div className="cl-cv-sub" style={{ fontSize: '10px', color: 'var(--text3)', transition: 'color 0.15s' }}>{sub}</div>
                    </a>
                  ) : (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{val}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{sub}</div>
                    </div>
                  );
                  return (
                  <div
                    key={sub}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '9px', marginBottom: '2px' }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(26,26,26,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', flexShrink: 0 }}>{icon}</div>
                    {edit ? (
                      <InlineEdit
                        key={client.id}
                        value={client[edit.key] ?? ''}
                        type={edit.type}
                        title={t('panel.editDateHint')}
                        clickToEdit={!href}
                        onSave={v => actions.updateField(edit.key, v || null)}
                      >{display}</InlineEdit>
                    ) : display}
                    {copyValue && (
                      <button
                        className="cl-copy-btn"
                        onClick={() => actions.copyToClipboard(copyValue)}
                        title={t('panel.contacts.copyHint')}
                        style={{ width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                      >
                        <IconCopy/>
                      </button>
                    )}
                  </div>
                  );
                });
              })()}
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
              {[
                { v: client.visit_count,                                                                                         l: t('panel.stats.visits'),       svg: <IconHistory/> },
                { v: formatMoney(client.total_spent, currency),                                                                  l: t('panel.stats.spent'),        svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
                { v: `${Math.max(0, (displaySubscription?.total ?? 0) - (displaySubscription?.used ?? 0))}/${displaySubscription?.total ?? 0}`, l: t('panel.stats.subscription'), svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
              ].map(({ v, l, svg }) => (
                <div key={l} style={{ padding: '12px 10px', background: 'rgba(26,26,26,0.02)', borderRadius: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text3)', marginBottom: '6px', display: 'flex', justifyContent: 'center' }}>{svg}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>{v}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{l}</div>
                </div>
              ))}
            </div>

            <LoyaltyIllus points={client.loyalty_points}/>
            <InviteCodeCard clientId={client.id} onCopy={actions.copyToClipboard}/>
            <AbonementCard used={displaySubscription?.used ?? 0} total={displaySubscription?.total ?? 0} color={frozen ? '#93b5d8' : (client.avatar_color ?? '#999')} onRemind={actions.remindAboutSubscription}/>
            <ClientOffersPanel clientId={client.id}/>
            <ActivityChart clientId={client.id} c={client.avatar_color ?? '#999'} clientName={client.name}/>

            {/* П.5 — Теги */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '8px' }}>{t('panel.tags.title')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: (actions.showTagPanel || tags.length > 0) ? '10px' : '0' }}>
                {tags.map(tag => (
                  <span key={tag} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px 3px 10px', borderRadius: '20px', background: `${client.avatar_color ?? '#999'}18`, color: client.avatar_color ?? '#999', border: `1px solid ${client.avatar_color ?? '#999'}30`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {tag}
                    <button onClick={() => actions.removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: client.avatar_color ?? '#999', opacity: 0.5, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', transition: 'opacity 0.15s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                ))}
                <button
                  onClick={actions.toggleTagPanel}
                  style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: actions.showTagPanel ? 'rgba(249,160,139,0.1)' : 'transparent', border: `1px ${actions.showTagPanel ? 'solid rgba(249,160,139,0.4)' : 'dashed var(--border)'}`, color: actions.showTagPanel ? 'var(--peach)' : 'var(--text3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', fontFamily: 'Manrope', transition: 'all 0.2s' }}
                >
                  <IconPlus/>{actions.showTagPanel ? t('panel.tags.close') : t('panel.tags.add')}
                </button>
              </div>
              {actions.showTagPanel && (
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(26,26,26,0.02)', border: '1px solid var(--border)', animation: 'fadeSlide 0.25s ease both' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                    {(t('tags.suggested', { returnObjects: true }) as string[]).filter(tag => !tags.includes(tag)).map(tag => (
                      <button key={tag} className="cl-tag-suggest" onClick={() => actions.addTag(tag, tags)} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}>{tag}</button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    placeholder={t('panel.tags.customPlaceholder')}
                    onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { actions.addTag(tagInput, tags); setTagInput(''); } }}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: '#fff', fontSize: '12px', outline: 'none', fontFamily: 'Manrope', color: 'var(--text)', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                    onFocus={e => { e.target.style.borderColor='var(--peach)'; e.target.style.boxShadow='0 0 0 3px rgba(249,160,139,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor='var(--border)'; e.target.style.boxShadow='none'; }}
                  />
                </div>
              )}
            </div>

            {/* П.6 + П.7 — Заморозить / Удалить */}
            <div style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(216,140,154,0.2)', background: 'rgba(216,140,154,0.03)', display: 'flex', gap: '6px' }}>
              <button
                onClick={() => actions.toggleFreeze(frozen)}
                style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: `1px solid ${frozen ? 'rgba(147,181,216,0.4)' : 'rgba(123,108,212,0.25)'}`, background: frozen ? 'rgba(147,181,216,0.12)' : 'rgba(123,108,212,0.06)', color: frozen ? '#4a7ca8' : '#7b6cd4', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
                onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
              >
                <IconFreeze/>{frozen ? t('panel.danger.unfreeze') : t('panel.danger.freeze')}
              </button>
              <button
                onClick={() => onDelete(client.id)}
                style={{ flex: 1, padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, border: '1px solid rgba(216,140,154,0.3)', background: 'rgba(216,140,154,0.06)', color: '#D88C9A', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(216,140,154,0.14)'; e.currentTarget.style.transform='scale(0.98)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(216,140,154,0.06)'; e.currentTarget.style.transform='scale(1)'; }}
              >
                <IconTrash/>{t('panel.danger.delete')}
              </button>
            </div>
          </div>
        )}

        {/* П.8 — EVENTS TAB */}
        {activeTab === 'events' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both', minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
            <div style={{ display: 'flex', gap: '0', marginBottom: '14px', borderBottom: '1px solid var(--border)' }}>
              {EVENT_FILTER_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => actions.setEventFilter(tab)}
                  style={{ padding: '6px 10px', fontSize: '11px', fontWeight: actions.eventFilter === tab ? 700 : 500, color: actions.eventFilter === tab ? 'var(--peach)' : 'var(--text3)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Manrope', borderBottom: `2px solid ${actions.eventFilter === tab ? 'var(--peach)' : 'transparent'}`, marginBottom: '-1px', transition: 'all 0.2s' }}
                >{t(`panel.events.filterTabs.${tab}`)}</button>
              ))}
            </div>

            {apiEvents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: '13px' }}>{t('panel.events.empty')}</div>
            )}

            {apiEvents.map((ev, i) => (
              <div key={i} className="cl-ev-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderRadius: '10px', marginBottom: '4px', border: '1px solid var(--border)', background: '#fff', transition: 'all 0.15s', cursor: 'default', minWidth: 0 }}>
                <EventIcon type={ev.type} c={color}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.trainer ? `${ev.trainer} · ` : ''}{ev.date}
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: ev.type === 'payment' ? '#5BAB72' : ev.type === 'freeze' ? '#4a7ca8' : ev.type === 'bonus' ? '#F9A08B' : 'var(--text3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {ev.paid ?? ev.amount}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* П.9 + П.10 — NOTES TAB */}
        {activeTab === 'notes' && (
          <div style={{ animation: 'fadeSlide 0.2s ease both' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '12px' }}>{t('panel.notes.title')}</div>

            {noteItems.map(note => (
              <div key={note.id} style={{ padding: '12px 14px', borderRadius: '12px', background: 'rgba(249,160,139,0.05)', border: '1px solid rgba(249,160,139,0.18)', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{t('panel.notes.prefix', { date: note.date })}</span>
                  {actions.editingNoteId !== note.id && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button
                        onClick={() => actions.startEditNote(note.id, note.text)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color='var(--peach)'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
                      ><IconEdit/></button>
                      <button
                        onClick={() => actions.requestDeleteNote(note.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color='#D88C9A'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
                      ><IconTrash/></button>
                    </div>
                  )}
                </div>
                {actions.editingNoteId === note.id ? (
                  <div>
                    <textarea
                      autoFocus
                      value={actions.editingNoteText}
                      onChange={e => actions.setEditingNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) actions.saveNote(note.id); }}
                      style={{ width: '100%', minHeight: '80px', padding: '8px 10px', borderRadius: '8px', border: '2px solid var(--peach)', outline: 'none', boxShadow: '0 0 0 4px rgba(249,160,139,0.15)', fontSize: '13px', fontFamily: 'Manrope', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, background: '#fff' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button onClick={() => actions.saveNote(note.id)} style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: 'var(--peach)', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}>{t('panel.notes.save')}</button>
                      <button onClick={actions.cancelEditNote} style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}>{t('panel.notes.cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{note.text}</div>
                )}
              </div>
            ))}

            {actions.isAddingNote ? (
              <div style={{ animation: 'fadeSlide 0.25s ease both' }}>
                <textarea
                  autoFocus
                  value={actions.newNoteText}
                  onChange={e => actions.setNewNoteText(e.target.value)}
                  placeholder={t('panel.notes.addPlaceholder')}
                  style={{ width: '100%', minHeight: '72px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', outline: 'none', fontSize: '13px', fontFamily: 'Manrope', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, background: '#fff', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                  onFocus={e => { e.target.style.borderColor='var(--peach)'; e.target.style.boxShadow='0 0 0 4px rgba(249,160,139,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor='var(--border)'; e.target.style.boxShadow='none'; }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button onClick={actions.saveNewNote} style={{ padding: '7px 16px', borderRadius: '8px', border: 'none', background: 'var(--peach)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}>{t('panel.notes.save')}</button>
                  <button onClick={actions.cancelAddNote} style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}>{t('panel.notes.cancel')}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={actions.startAddNote}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: 'rgba(26,26,26,0.03)', fontSize: '12px', fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Manrope', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(249,160,139,0.08)'; e.currentTarget.style.color='var(--peach)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(26,26,26,0.03)'; e.currentTarget.style.color='var(--text2)'; }}
              >
                <IconNote/>{t('panel.notes.add')}
              </button>
            )}
          </div>
        )}

        {/* CL-6.6 — WALLET TAB */}
        {activeTab === 'wallet' && (
          <WalletTab clientId={client.id} enabled={activeTab === 'wallet'}/>
        )}
      </div>

      {/* П.12 — MESSAGE PANEL */}
      {actions.showMessage && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: '#fff', animation: 'panelSlideIn 0.3s ease both', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.messagePanel.title')}</span>
            <button onClick={actions.toggleMessage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><IconClose/></button>
          </div>
          <textarea
            value={actions.messageText}
            onChange={e => actions.setMessageText(e.target.value)}
            placeholder={t('panel.messagePanel.placeholder')}
            rows={3}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '14px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Manrope', color: 'var(--text)', outline: 'none', resize: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s', background: '#fff' }}
            onFocus={e => { e.target.style.borderColor='var(--peach)'; e.target.style.boxShadow='0 0 0 4px rgba(249,160,139,0.12)'; }}
            onBlur={e => { e.target.style.borderColor='var(--border)'; e.target.style.boxShadow='none'; }}
          />
          <button
            onClick={() => actions.sendMessage(client.phone ?? '')}
            style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,var(--peach),#F5866E)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}
          >{t('panel.messagePanel.send')}</button>
        </div>
      )}

      {/* П.13 — BOOKING PANEL */}
      {actions.showBooking && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: '#fff', animation: 'panelSlideIn 0.3s ease both', flexShrink: 0, maxHeight: '280px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.bookingPanel.title')}</span>
            <button onClick={actions.toggleBooking} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><IconClose/></button>
          </div>

          {!client.active_subscription && (
            <div style={{ padding: '9px 12px', borderRadius: '10px', background: 'rgba(216,140,154,0.08)', border: '1px solid rgba(216,140,154,0.25)', color: '#B5677A', fontSize: '11px', fontWeight: 600, marginBottom: '12px' }}>
              {t('panel.bookingPanel.noSubscription')}
            </div>
          )}

          {/* Date carousel — 7 колонок CSS Grid, всегда влезают в ширину панели без скролла */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'center', minWidth: 0 }}>
            <button
              onClick={() => actions.shiftBookingWindow(-7)}
              disabled={bookingWindowStart === 0}
              style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: bookingWindowStart === 0 ? 'default' : 'pointer', opacity: bookingWindowStart === 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', flex: 1, minWidth: 0 }}>
              {next7Days.map(day => (
                <button
                  key={day.offset}
                  onClick={() => actions.setBookingDate(day.offset)}
                  style={{ minWidth: 0, padding: '8px 2px', borderRadius: '10px', border: `1px solid ${actions.bookingDate === day.offset ? 'var(--peach)' : 'var(--border)'}`, background: actions.bookingDate === day.offset ? 'rgba(249,160,139,0.12)' : 'transparent', cursor: 'pointer', fontFamily: 'Manrope', transition: 'all 0.2s', textAlign: 'center' }}
                >
                  <div style={{ fontSize: '9px', fontWeight: 700, color: actions.bookingDate === day.offset ? 'var(--peach)' : 'var(--text3)', textTransform: 'uppercase', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{day.dayName}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: actions.bookingDate === day.offset ? 'var(--peach)' : 'var(--text)' }}>{day.dayNum}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => actions.shiftBookingWindow(7)}
              style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          {/* Занятия на выбранный день (реальное расписание) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
            {actions.bookingLessons.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
                {t('panel.bookingPanel.noLessons')}
              </div>
            )}
            {actions.bookingLessons.map(l => {
              const full = l.booked_count >= l.total_spots;
              const disabled = full || l.status === 'cancelled';
              const active = actions.bookingLessonId === l.id;
              return (
                <button
                  key={l.id}
                  disabled={disabled}
                  onClick={() => actions.setBookingLessonId(l.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', border: `1px solid ${active ? 'var(--peach)' : 'var(--border)'}`, background: active ? 'rgba(249,160,139,0.12)' : 'transparent', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'Manrope', transition: 'all 0.2s', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: active ? 'var(--peach)' : 'var(--text)' }}>{l.start_time.slice(11, 16)}</span>
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}>{full ? t('panel.bookingPanel.full') : `${l.booked_count}/${l.total_spots}`}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={actions.confirmBooking}
            disabled={actions.bookingLessonId == null}
            style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,var(--peach),#F5866E)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: actions.bookingLessonId == null ? 'default' : 'pointer', opacity: actions.bookingLessonId == null ? 0.5 : 1, fontFamily: 'Manrope', boxShadow: '0 4px 14px -2px rgba(249,160,139,0.4)', transition: 'all 0.2s' }}
          >{t('panel.bookingPanel.confirm')}</button>
        </div>
      )}

      {/* П.14 — BONUS PANEL */}
      {actions.showBonus && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: '#fff', animation: 'panelSlideIn 0.3s ease both', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.bonusPanel.title')}</span>
            <button onClick={actions.toggleBonus} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><IconClose/></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {BONUS_OPTION_IDS.map(id => {
              const isSelected = actions.selectedBonus === id;
              const label = t(`panel.bonusOptions.${id}.label`);
              const description = t(`panel.bonusOptions.${id}.description`);
              return (
                <button
                  key={id}
                  className="cl-bonus-opt"
                  onClick={() => actions.selectBonus(id, label, BONUS_POINTS[id])}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--peach)' : 'var(--border)'}`, background: isSelected ? 'rgba(249,160,139,0.08)' : 'transparent', cursor: 'pointer', fontFamily: 'Manrope', textAlign: 'left', transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: isSelected ? 'rgba(249,160,139,0.2)' : 'rgba(240,192,64,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? 'var(--peach)' : '#c8a84b', flexShrink: 0, transition: 'all 0.2s' }}>
                    {isSelected ? <IconCheck/> : <IconGift/>}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? 'var(--peach)' : 'var(--text)' }}>{label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {actions.deletingNoteId != null && (
        <ConfirmModal
          title={t('panel.notes.deleteTitle')}
          message={t('panel.notes.deleteMessage')}
          danger
          onConfirm={actions.confirmDeleteNote}
          onClose={actions.cancelDeleteNote}
        />
      )}
    </div>
  );
}

// ─── EXPORTED COMPONENT ───────────────────────────────────────────────────────
export interface ClientProfileSliderProps {
  client: ClientData | null;
  profile?: ClientProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
}

export function ClientProfileSlider({ client, profile, isOpen, onClose, onDelete }: ClientProfileSliderProps) {
  return (
    <>
      <style>{`
        .right-panel-wrapper {
          /* Панель вне потока: сетка не пересчитывается каждый кадр её анимации.
             Место под неё освобождает margin у gridWrap, а карточки доезжает FLIP. */
          position: absolute;
          top: 0; right: 0;
          height: 100%;
          width: var(--drawer-w, 420px);
          transform: translateX(calc(100% + 24px));
          opacity: 0;
          transition:
            transform 0.38s cubic-bezier(0.16, 1, 0.3, 1),
            opacity 0.25s ease-out;
          overflow: hidden;
          pointer-events: none;
          background: #fff;
          box-shadow: -10px 0 30px rgba(0,0,0,0.03);
          border-radius: 16px;
        }
        .right-panel-wrapper.is-open {
          transform: none;
          opacity: 1;
          pointer-events: auto;
        }
        .right-panel-inner {
          width: var(--drawer-w, 420px);
          height: 100%;
          display: flex; flex-direction: column;
          overscroll-behavior: contain;
        }
      `}</style>
      <div className={`right-panel-wrapper ${isOpen ? 'is-open' : ''}`}>
        <div className="right-panel-inner">
          {client && <ClientPanel client={client} profile={profile} onClose={onClose} onDelete={onDelete}/>}
        </div>
      </div>
    </>
  );
}
