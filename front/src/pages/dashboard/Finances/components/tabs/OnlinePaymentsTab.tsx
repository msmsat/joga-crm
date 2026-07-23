import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToastType } from '../../types';
import type { Gateway, GatewayType } from '../../../../../api/finances/finances.types';
import { useGateways } from '../../hooks/useFinances';
import { GatewayKeysModal } from '../modals/GatewayKeysModal';
import { Toggle } from '../ui/Toggle';
import { InfoHint } from '../../../../../components/ui/InfoHint';

const GATEWAY_TYPES: GatewayType[] = ['stripe', 'fondy'];

const LOGOS: Record<GatewayType, React.ReactNode> = {
  stripe: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity="0.12" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope, sans-serif" fill="currentColor">S</text>
    </svg>
  ),
  fondy: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity="0.12" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Manrope, sans-serif" fill="currentColor">F</text>
    </svg>
  ),
};

function maskKey(key: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}••••`;
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

function GatewayCard({ gatewayType, gateway, onToggle, onEdit }: {
  gatewayType: GatewayType;
  gateway: Gateway;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation('finances');
  return (
    <div style={{
      padding: '24px', borderRadius: '16px', background: '#FFFFFF',
      border: '1.5px solid rgba(26,26,26,0.1)', boxShadow: '0 8px 24px -4px rgba(26,26,26,0.04)',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
        background: 'rgba(249, 160, 139, 0.12)', color: '#F9A08B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {LOGOS[gatewayType]}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A1A1A', marginBottom: '2px' }}>
          {t(`onlinePayments.gateways.${gatewayType}.name`)}
        </div>
        <div style={{ fontSize: '12px', color: '#666666', lineHeight: 1.4 }}>
          {gateway.connected
            ? t('onlinePayments.gateways.maskedKey', { key: maskKey(gateway.public_key) })
            : t(`onlinePayments.gateways.${gatewayType}.desc`)}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px',
        background: gateway.connected ? 'rgba(163,201,168,0.15)' : 'rgba(26,26,26,0.05)',
        color: gateway.connected ? '#5BAB72' : '#999999',
        fontSize: '11px', fontWeight: 700, flexShrink: 0,
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
        {gateway.connected ? t('onlinePayments.gateways.connected') : t('onlinePayments.gateways.notConnected')}
      </div>

      {gateway.connected ? (
        <>
          <button
            onClick={onEdit}
            style={{
              padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Manrope', sans-serif", background: 'transparent',
              color: '#666666', border: '1px solid rgba(26,26,26,0.1)', flexShrink: 0,
            }}
          >
            {t('onlinePayments.gateways.editKeys')}
          </button>
          <Toggle on={gateway.is_active} onChange={onToggle} />
        </>
      ) : (
        <button
          onClick={onEdit}
          style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Manrope', sans-serif", border: 'none', flexShrink: 0,
            background: 'linear-gradient(135deg, #FCAE91, #F9A08B)', color: '#FFFFFF',
            boxShadow: '0 4px 14px -2px rgba(249,160,139,0.4)',
          }}
        >
          {t('onlinePayments.gateways.connect')}
        </button>
      )}
    </div>
  );
}

export default function OnlinePaymentsTab({ showToast }: { showToast: (msg: string, t?: ToastType) => void }) {
  const { t } = useTranslation('finances');
  const { gateways, updateGateway } = useGateways();
  const [editingType, setEditingType] = useState<GatewayType | null>(null);

  const byType = Object.fromEntries(gateways.map(g => [g.gateway_type, g])) as Record<GatewayType, Gateway | undefined>;
  const editingGateway = editingType ? byType[editingType] : null;

  async function handleToggle(gateway: Gateway) {
    try {
      await updateGateway(gateway.gateway_type, { is_active: !gateway.is_active });
      showToast(t('onlinePayments.toasts.gatewayUpdated'), 'success');
    } catch {
      // тост ошибки уже показан хуком
    }
  }

  return (
    <>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(26,26,26,0.12)',
        boxShadow: '0 16px 40px -8px rgba(26,26,26,0.04)', marginBottom: '24px', padding: '24px 32px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ fontSize: '13px', color: '#666666', lineHeight: 1.5 }}>{t('onlinePayments.description')}</div>
        <InfoHint title={t('tabs.onlinePayments')} text={t('info.onlinePayments')} />
      </div>

      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px', paddingLeft: '4px' }}>
        {t('onlinePayments.gatewaysTitle')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {GATEWAY_TYPES.map(gatewayType => {
          const gateway = byType[gatewayType];
          if (!gateway) return null;
          return (
            <GatewayCard
              key={gatewayType}
              gatewayType={gatewayType}
              gateway={gateway}
              onToggle={() => handleToggle(gateway)}
              onEdit={() => setEditingType(gatewayType)}
            />
          );
        })}
      </div>

      {editingType && editingGateway && (
        <GatewayKeysModal
          gatewayType={editingType}
          gateway={editingGateway}
          onClose={() => setEditingType(null)}
          onSubmit={async (payload) => {
            await updateGateway(editingType, payload);
            showToast(t('onlinePayments.toasts.gatewayUpdated'), 'success');
          }}
        />
      )}
    </>
  );
}
