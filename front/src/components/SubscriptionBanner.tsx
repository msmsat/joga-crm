import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BillingPlan } from '../api/billing/billing.types';
import { billingApi } from '../api/billing/billing.api';

// Баннер «подписка заканчивается/обновится» за 3 дня (задача 12c). Только owner —
// план и карты тянутся с owner-only эндпоинтов; у остальных ролей план = null.
const PLAN_NAMES: Record<string, string> = { start: 'Старт', pro: 'Pro', business: 'Business' };
const WARN_DAYS = 3;

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(iso));

// Ключ дизмисса на сегодня: закрыли — не показываем до конца дня, назавтра снова.
const dismissKey = (iso: string) => `velora:sub-banner:${iso.slice(0, 10)}:${new Date().toISOString().slice(0, 10)}`;

export default function SubscriptionBanner({ plan }: { plan: BillingPlan | null | undefined }) {
  const navigate = useNavigate();
  const [hasCard, setHasCard] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const expiresAt = plan?.expires_at ?? null;
  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
    : Infinity;
  const show = expiresAt !== null && daysLeft <= WARN_DAYS && daysLeft >= 0;

  useEffect(() => {
    if (!show) return;
    setDismissed(localStorage.getItem(dismissKey(expiresAt!)) === '1');
    billingApi.getPaymentCards().then((c) => setHasCard(c.length > 0)).catch(() => setHasCard(false));
  }, [show, expiresAt]);

  if (!plan || !show || dismissed) return null;

  const isTrial = plan.status === 'trial';
  // Спокойный info-баннер только если карта привязана И автопродление включено.
  const willRenew = !isTrial && hasCard && plan.auto_renewal;
  const date = fmtDate(expiresAt!);
  const planLabel = PLAN_NAMES[plan.plan_name] ?? plan.plan_name;

  const text = isTrial
    ? `Пробный период заканчивается ${date} — выберите тариф`
    : willRenew
      ? `Подписка ${planLabel} обновится ${date}`
      : `Подписка ${planLabel} заканчивается ${date}`;

  const close = () => { localStorage.setItem(dismissKey(expiresAt!), '1'); setDismissed(true); };

  const accent = willRenew ? '#A3C9A8' : '#F9A08B';   // pistachio / peach
  const bg = willRenew ? 'rgba(163,201,168,0.12)' : 'rgba(249,160,139,0.12)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 24px', background: bg, borderBottom: `1px solid ${accent}40`,
      fontSize: '13.5px', fontWeight: 600, color: 'var(--text, #1A1A1A)',
    }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>

      {!willRenew && (
        <button
          onClick={() => navigate('/dashboard/billing')}
          style={{
            height: '30px', padding: '0 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #FCAE91, #F9A08B)', color: '#FFFFFF',
            fontSize: '12.5px', fontWeight: 700, fontFamily: 'var(--font)', flexShrink: 0,
          }}
        >
          {isTrial ? 'Выбрать тариф' : 'Оплатить'}
        </button>
      )}

      <button
        onClick={close}
        aria-label="Скрыть"
        style={{
          width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--muted, #666666)', flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}
