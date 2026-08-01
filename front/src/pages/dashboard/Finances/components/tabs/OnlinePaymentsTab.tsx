import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import type { Gateway } from '../../../../../api/finances/finances.types';
import { useGateways } from '../../hooks/useFinances';
import { Toggle } from '../ui/Toggle';
import { InfoHint } from '../../../../../components/ui/InfoHint';

const STRIPE_LOGO = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity="0.12" />
    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope, sans-serif" fill="currentColor">S</text>
  </svg>
);

// 5 состояний подключения. Разделены потому, что действие владельца в каждом
// разное: начать анкету, дозаполнить её, исправить отклонённые данные, подождать
// проверку, ничего не делать.
//
// `action` и `review` снаружи одинаковы (charges_enabled=false), но путать их
// нельзя: в первом Stripe ждёт данные от владельца, и «ожидание проверки» тут
// значит просидеть сутки зря. Различает их requirements_due.
type StripeState = 'none' | 'incomplete' | 'action' | 'review' | 'active';

function stripeState(g: Gateway): StripeState {
  if (!g.account_id) return 'none';
  if (g.charges_enabled) return 'active';
  if (g.requirements_due) return g.details_submitted ? 'action' : 'incomplete';
  return 'review';
}

const STATE_COLORS: Record<StripeState, { bg: string; fg: string }> = {
  none: { bg: 'rgba(var(--ink),0.05)', fg: 'var(--text3)' },
  incomplete: { bg: 'rgba(216,140,154,0.15)', fg: '#C2697A' },
  action: { bg: 'rgba(216,140,154,0.15)', fg: '#C2697A' },
  review: { bg: 'rgba(252,174,145,0.18)', fg: '#D4805F' },
  active: { bg: 'rgba(163,201,168,0.15)', fg: '#5BAB72' },
};

function StripeCard({ gateway, onConnect, isConnecting, onToggle }: {
  gateway: Gateway;
  onConnect: () => void;
  isConnecting: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('finances');
  const state = stripeState(gateway);
  const colors = STATE_COLORS[state];

  return (
    <div style={{
      padding: '24px', borderRadius: '16px', background: 'var(--bg-card)',
      border: '1.5px solid rgba(var(--ink),0.1)', boxShadow: '0 8px 24px -4px rgba(26,26,26,0.04)',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
        background: 'rgba(249, 160, 139, 0.12)', color: '#F9A08B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {STRIPE_LOGO}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '2px' }}>
          {t('onlinePayments.gateways.stripe.name')}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
          {t(`onlinePayments.gateways.states.${state}.hint`)}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px',
        background: colors.bg, color: colors.fg,
        fontSize: '11px', fontWeight: 700, flexShrink: 0,
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
        {t(`onlinePayments.gateways.states.${state}.label`)}
      </div>

      <button
        onClick={onConnect}
        disabled={isConnecting}
        style={{
          padding: '10px 20px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
          cursor: isConnecting ? 'default' : 'pointer', fontFamily: "'Manrope', sans-serif",
          flexShrink: 0, opacity: isConnecting ? 0.6 : 1,
          ...(state === 'active'
            ? { background: 'transparent', color: 'var(--muted)', border: '1px solid rgba(var(--ink),0.1)' }
            : {
              border: 'none', background: 'linear-gradient(135deg, #FCAE91, #F9A08B)', color: '#FFFFFF',
              boxShadow: '0 4px 14px -2px rgba(249,160,139,0.4)',
            }),
        }}
      >
        {t(`onlinePayments.gateways.states.${state}.action`)}
      </button>

      {/* Тумблер только когда Stripe реально готов принимать: раньше выключать нечего. */}
      {state === 'active' && <Toggle on={gateway.is_active} onChange={onToggle} />}
    </div>
  );
}

export default function OnlinePaymentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const { gateways, updateGateway, connectStripe, isConnecting } = useGateways();
  const stripe = gateways.find(g => g.gateway_type === 'stripe');

  // Возврат с формы Stripe (?stripe=return|refresh). Статус уже перезапрошен —
  // useGateways монтируется заново, — остаётся объяснить, что произошло.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('stripe');
    if (!flag) return;
    showToast(
      t(flag === 'refresh' ? 'onlinePayments.toasts.stripeLinkExpired' : 'onlinePayments.toasts.stripeReturned'),
      flag === 'refresh' ? 'error' : 'success',
    );
    params.delete('stripe');
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }, [showToast, t]);

  async function handleToggle(gateway: Gateway) {
    try {
      await updateGateway('stripe', { is_active: !gateway.is_active });
      showToast(t('onlinePayments.toasts.gatewayUpdated'), 'success');
    } catch {
      // тост ошибки уже показан хуком
    }
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid rgba(var(--ink),0.12)',
        boxShadow: '0 16px 40px -8px rgba(26,26,26,0.04)', marginBottom: '24px', padding: '24px 32px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>{t('onlinePayments.description')}</div>
        <InfoHint title={t('tabs.onlinePayments')} text={t('info.onlinePayments')} />
      </div>

      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--onyx)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px', paddingLeft: '4px' }}>
        {t('onlinePayments.gatewaysTitle')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {stripe && (
          <StripeCard
            gateway={stripe}
            onConnect={connectStripe}
            isConnecting={isConnecting}
            onToggle={() => handleToggle(stripe)}
          />
        )}
      </div>
    </>
  );
}
