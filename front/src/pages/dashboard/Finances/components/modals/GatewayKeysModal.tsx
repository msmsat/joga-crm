import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input } from '../../../../../components/ui/modal';
import type { Gateway, GatewayType, GatewayUpdate } from '../../../../../api/finances/finances.types';

interface GatewayKeysModalProps {
  gatewayType: GatewayType;
  gateway: Gateway;
  onClose: () => void;
  onSubmit: (payload: GatewayUpdate) => Promise<void>;
}

export function GatewayKeysModal({ gatewayType, gateway, onClose, onSubmit }: GatewayKeysModalProps) {
  const { t } = useTranslation('finances');
  const [publicKey, setPublicKey] = useState(gateway.public_key ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = publicKey.trim().length > 0 && (gateway.connected || secretKey.trim().length > 0);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload: GatewayUpdate = { public_key: publicKey.trim(), is_active: true };
      if (secretKey.trim()) payload.secret_key = secretKey.trim();
      await onSubmit(payload);
      onClose();
    } catch {
      // тост показывает родитель
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell size="sm" onClose={onClose}>
      <ModalHeader title={t(`onlinePayments.gateways.${gatewayType}.name`)} subtitle={t('onlinePayments.keysModal.subtitle')} />
      <ModalBody>
        <Input
          label={t('onlinePayments.keysModal.publicKey')}
          value={publicKey}
          onChange={setPublicKey}
          placeholder={t('onlinePayments.keysModal.publicKeyPlaceholder')}
        />
        <Input
          label={t('onlinePayments.keysModal.secretKey')}
          value={secretKey}
          onChange={setSecretKey}
          placeholder={gateway.connected ? t('onlinePayments.keysModal.secretKeyPlaceholderSet') : t('onlinePayments.keysModal.secretKeyPlaceholder')}
          type="password"
        />
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('common.cancel')}</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={!canSave} loading={saving}>
          {t('common.save')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
