import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input } from '../../../../../components/ui/index';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ChannelStatus } from '../../../../../api/notifications/notifications.types';

interface Props {
  status?: ChannelStatus;
  requestCodeMut: UseMutationResult<ChannelStatus, unknown, string>;
  verifyCodeMut: UseMutationResult<ChannelStatus, unknown, string>;
  onClose: () => void;
}

export function EmailVerifyModal({ status, requestCodeMut, verifyCodeMut, onClose }: Props) {
  const { t } = useTranslation('notifications');
  const alreadyVerified = status?.details?.verified === true;
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(alreadyVerified ? String(status?.details?.email ?? '') : '');
  const [code, setCode] = useState('');

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const codeValid = /^\d{6}$/.test(code.trim());

  return (
    <ModalShell size="sm" onClose={onClose}>
      <ModalHeader title={t('emailCh.title')} subtitle={t('emailCh.subtitle')} />
      <ModalBody>
        {alreadyVerified && step === 'email' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(91,171,114,0.12)',
            color: '#5BAB72', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, width: 'fit-content',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5BAB72', display: 'inline-block' }} />
            {t('emailCh.verifiedLabel')}: {String(status?.details?.email)}
          </div>
        )}

        {step === 'email' ? (
          <Input
            label={t('emailCh.emailLabel')}
            value={email}
            onChange={setEmail}
            placeholder={t('emailCh.emailPlaceholder')}
            error={email && !emailValid ? t('emailCh.invalidEmail') : undefined}
          />
        ) : (
          <>
            <div style={{ fontSize: '13px', color: '#666666' }}>
              {t('emailCh.codeSentTo')} <strong>{email}</strong>. {t('emailCh.codeHint')}
            </div>
            <Input
              label={t('emailCh.codeLabel')}
              value={code}
              onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
            <button
              type="button"
              onClick={() => requestCodeMut.mutate(email.trim())}
              disabled={requestCodeMut.isPending}
              style={{ background: 'none', border: 'none', color: '#F9A08B', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}
            >
              {t('emailCh.resend')}
            </button>
          </>
        )}

        <div style={{
          padding: '12px 14px', borderRadius: '10px', background: 'rgba(26,26,26,0.03)',
          fontSize: '11.5px', color: '#999999', lineHeight: 1.6,
        }}>
          {t('emailCh.viaVelora')}
        </div>
      </ModalBody>
      <ModalFooter>
        {step === 'email' ? (
          <>
            <GhostButton>{t('emailCh.cancel')}</GhostButton>
            <PrimaryButton
              onClick={() => requestCodeMut.mutate(email.trim(), { onSuccess: () => setStep('code') })}
              disabled={!emailValid}
              loading={requestCodeMut.isPending}
            >
              {t('emailCh.sendCode')}
            </PrimaryButton>
          </>
        ) : (
          <>
            <GhostButton onClick={() => setStep('email')}>{t('emailCh.back')}</GhostButton>
            <PrimaryButton
              onClick={() => verifyCodeMut.mutate(code.trim(), { onSuccess: onClose })}
              disabled={!codeValid}
              loading={verifyCodeMut.isPending}
            >
              {t('emailCh.verify')}
            </PrimaryButton>
          </>
        )}
      </ModalFooter>
    </ModalShell>
  );
}
