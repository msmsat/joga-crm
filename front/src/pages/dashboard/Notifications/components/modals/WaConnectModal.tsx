import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostButton, PrimaryButton, ConfirmModal } from '../../../../../components/ui/index';
import { ChannelModalShell, Notice, DetailRow, DangerButton } from './ChannelModalLayout';
import { CHANNEL_BRAND } from './channelBrand';
import { waBusinessVerified, waPaymentConnected, waTemplates } from '../../utils';
import { WaVerificationGuide } from './WaVerificationGuide';
import type { UseMutationResult } from '@tanstack/react-query';
import { notificationsApi } from '../../../../../api/notifications';
import type { ChannelStatus, WaPricing, WaTemplateSummary, WaTemplatesSyncResult } from '../../../../../api/notifications/notifications.types';

// Платёжный центр Meta. Точного per-WABA диплинка Meta публично не описывает,
// поэтому ведём в корень — там студия выбирает свой бизнес и жмёт Payment
// settings. Дубль services/whatsapp.py: BILLING_URL, один статический адрес.
const BILLING_URL = 'https://business.facebook.com/billing_hub';

interface Props {
  status?: ChannelStatus;
  // Embedded Signup: мутация не отдаёт статус, а уводит браузер в мастер Meta.
  connectMut: UseMutationResult<{ url: string }, unknown, void>;
  disconnectMut: UseMutationResult<ChannelStatus, unknown, void>;
  checkPaymentMut: UseMutationResult<ChannelStatus, unknown, void>;
  syncTemplatesMut: UseMutationResult<WaTemplatesSyncResult, unknown, void>;
  onClose: () => void;
}

export function WaConnectModal({
  status, connectMut, disconnectMut, checkPaymentMut, syncTemplatesMut, onClose,
}: Props) {
  const { t } = useTranslation('notifications');
  const connected = status?.connected ?? false;
  const payment = waPaymentConnected(status);
  const verified = waBusinessVerified(status);
  const templates = waTemplates(status);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pricing, setPricing] = useState<WaPricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    notificationsApi.getWaPricing().then(p => { if (!cancelled) setPricing(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Карту добавляют на стороне Meta, вебхука об этом нет. Спрашиваем при каждом
  // открытии: типичный путь — ушёл в Business Manager, привязал карту, вернулся,
  // и показывать ему здесь вчерашнее «оплата не добавлена» нельзя.
  const recheck = checkPaymentMut.mutate;
  useEffect(() => {
    if (connected) recheck();
  }, [connected, recheck]);

  const phone = String(status?.details?.display_phone_number ?? '—');

  const pricingText = pricing
    ? `≈ ${pricing.price_per_message} ${pricing.currency} ${t('wa.perMessage')}${pricing.source === 'default' ? ` (${t('wa.approxPrice')})` : ''}, ${t('wa.viaMeta')}`
    : t('wa.pricingLoading');

  const billingLink = (
    <a href={BILLING_URL} target="_blank" rel="noreferrer" style={{ color: '#E8836A', fontWeight: 800 }}>
      {t('wa.paymentLink')}
    </a>
  );

  return (
    <>
      <ChannelModalShell
        brand={CHANNEL_BRAND.whatsapp}
        name={t('wa.title')}
        tagline={connected ? t('wa.subtitleConnected') : t('wa.subtitleDisconnected')}
        connected={connected}
        detail={phone}
        title={connected ? t('chModal.details') : t('chModal.setup')}
        onClose={onClose}
        footer={connected ? (
          <>
            <GhostButton>{t('wa.close')}</GhostButton>
            <DangerButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
              {t('wa.disconnect')}
            </DangerButton>
          </>
        ) : (
          <>
            <GhostButton>{t('wa.cancel')}</GhostButton>
            <PrimaryButton onClick={() => connectMut.mutate()} loading={connectMut.isPending}>
              {t('wa.connect')}
            </PrimaryButton>
          </>
        )}
      >
        {connected ? (
          <>
            <Notice tone="ok">
              <strong>{t('chModal.ready')}</strong> — {t('chModal.readyHint')}
            </Notice>
            <DetailRow label={t('chModal.phone')} value={phone} />

            {payment === true && (
              <Notice tone="ok">
                <strong>{t('wa.paymentOkTitle')}</strong> — {t('wa.paymentOk')}
              </Notice>
            )}

            {payment === false && (
              <Notice tone="warn">
                <strong>{t('wa.paymentMissingTitle')}</strong> — {t('wa.paymentMissing')} {billingLink}.
                <RecheckButton
                  label={t('wa.paymentRecheck')}
                  pending={checkPaymentMut.isPending}
                  onClick={() => checkPaymentMut.mutate()}
                />
              </Notice>
            )}

            {payment === null && (
              <Notice>
                {t('wa.paymentUnknown')}
                <RecheckButton
                  label={t('wa.paymentRecheck')}
                  pending={checkPaymentMut.isPending}
                  onClick={() => checkPaymentMut.mutate()}
                />
              </Notice>
            )}

            {/* Верификация бизнеса — условие, независимое от карты. Показываем
                инструкцию только когда Meta прямо ответила «не пройдена»
                (141010), а не при null: пугать студию из-за таймаута нельзя. */}
            {verified === false && <WaVerificationGuide />}

            {/* Шаблоны — третье обязательное условие доставки: без одобренного
                шаблона Meta не даёт написать первым. Заводятся сами при
                подключении номера, здесь показываем вердикт модерации. */}
            <TemplatesNotice summary={templates} syncMut={syncTemplatesMut} />
          </>
        ) : (
          <Notice tone="warn">
            <strong>{t('wa.paymentRequiredTitle')}</strong> — {t('wa.paymentRequired')} {billingLink}.
          </Notice>
        )}

        <Notice tone="warn">
          <strong>{t('wa.paidWarning')}</strong> — {pricingText}. {t('wa.windowNotice')}
        </Notice>
      </ChannelModalShell>

      {confirmingDisconnect && (
        <ConfirmModal
          title={t('wa.disconnectTitle')}
          message={t('wa.disconnectMessage')}
          confirmText={t('wa.disconnect')}
          danger
          onConfirm={async () => { await disconnectMut.mutateAsync(); }}
          onClose={() => setConfirmingDisconnect(false)}
        />
      )}
    </>
  );
}

// Вердикт Meta по шаблонам. Раньше здесь стоял неизменный текст с кнопкой, и
// отклонённый шаблон означал молча мёртвое уведомление: ни статуса, ни повода
// заглянуть. Кнопка «перезавести» осталась на случай, когда автосинхронизация
// при подключении не прошла (Meta лежала, номер подключён до её появления).
function TemplatesNotice({
  summary, syncMut,
}: {
  summary: WaTemplateSummary | null;
  syncMut: UseMutationResult<WaTemplatesSyncResult, unknown, void>;
}) {
  const { t } = useTranslation('notifications');
  const action = (
    <RecheckButton
      label={syncMut.isPending ? t('wa.templatesPending') : t('wa.templatesAction')}
      pending={syncMut.isPending}
      onClick={() => syncMut.mutate()}
    />
  );

  // Статусы ещё не читали: либо номер подключили до автосинхронизации, либо Meta
  // не ответила. Пугать нечем — показываем прежнее объяснение и кнопку.
  if (!summary) {
    return (
      <Notice>
        <strong>{t('wa.templatesTitle')}</strong> — {t('wa.templates')}
        {action}
      </Notice>
    );
  }

  if (summary.rejected > 0) {
    return (
      <Notice tone="warn">
        <strong>{t('wa.templatesRejectedTitle', { count: summary.rejected })}</strong>{' '}
        {t('wa.templatesRejected')}
        <div style={{ marginTop: '6px', fontWeight: 700 }}>
          {summary.rejected_events.map(id => t(`events.${id}.title`)).join(', ')}
        </div>
        {action}
      </Notice>
    );
  }

  if (summary.pending > 0) {
    return (
      <Notice>
        <strong>{t('wa.templatesPendingTitle', { count: summary.pending })}</strong>{' '}
        {t('wa.templatesPendingHint', { approved: summary.approved })}
      </Notice>
    );
  }

  return (
    <Notice tone="ok">
      <strong>{t('wa.templatesOkTitle')}</strong> — {t('wa.templatesOk', { count: summary.approved })}
    </Notice>
  );
}

// Карту могли привязать в соседней вкладке — даём перечитать состояние, не
// закрывая модалку.
function RecheckButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        display: 'block', marginTop: '8px', padding: 0, background: 'none', border: 'none',
        color: 'inherit', font: 'inherit', fontWeight: 800, textDecoration: 'underline',
        textUnderlineOffset: '3px', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}
