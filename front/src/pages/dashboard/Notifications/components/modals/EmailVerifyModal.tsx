import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostButton, PrimaryButton, Input } from '../../../../../components/ui/index';
import { ChannelModalShell, Notice, DetailRow } from './ChannelModalLayout';
import { CHANNEL_BRAND } from './channelBrand';
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
  const verifiedEmail = String(status?.details?.email ?? '');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(alreadyVerified ? verifiedEmail : '');
  const [code, setCode] = useState('');

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const codeValid = /^\d{6}$/.test(code.trim());

  return (
    <ChannelModalShell
      brand={CHANNEL_BRAND.email}
      name={t('emailCh.title')}
      tagline={t('emailCh.subtitle')}
      connected={alreadyVerified}
      detail={verifiedEmail || '—'}
      title={alreadyVerified && step === 'email' ? t('chModal.details') : t('chModal.setup')}
      onClose={onClose}
      footer={step === 'email' ? (
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
    >
      {step === 'email' ? (
        <>
          {alreadyVerified && (
            <>
              <Notice tone="ok">
                <strong>{t('chModal.ready')}</strong> — {t('chModal.readyHint')}
              </Notice>
              <DetailRow label={t('emailCh.verifiedLabel')} value={verifiedEmail || '—'} />
            </>
          )}
          <Input
            label={t('emailCh.emailLabel')}
            value={email}
            onChange={setEmail}
            placeholder={t('emailCh.emailPlaceholder')}
            error={email && !emailValid ? t('emailCh.invalidEmail') : undefined}
          />
        </>
      ) : (
        <>
          <Notice>
            {t('emailCh.codeSentTo')} <strong>{email}</strong>. {t('emailCh.codeHint')}
          </Notice>
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
            style={{
              background: 'none', border: 'none', color: '#E8836A', fontSize: '12px',
              fontWeight: 800, cursor: 'pointer', padding: 0, alignSelf: 'flex-start',
            }}
          >
            {t('emailCh.resend')}
          </button>
        </>
      )}

      <Notice>{t('emailCh.viaVelora')}</Notice>
    </ChannelModalShell>
  );
}
