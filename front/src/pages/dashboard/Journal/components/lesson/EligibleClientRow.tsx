// Строка окна «Добавить клиента»: кто это и чем будет покрыта его запись —
// абонементом, первым занятием или оплатой на месте. Раньше список показывал
// только владельцев абонемента, и у студии без проданных абонементов он был
// пуст при десятках клиентов в базе. Основание считает сервер
// (GET /schedule/lessons/{id}/eligible-clients), здесь — только подпись.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { EligibleClient } from '../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../lib/money';
import './eligibleClient.css';

interface Props {
  client: EligibleClient;
  selected: boolean;
  /** Основание ещё не пришло с сервера (клиента только что завели) — без подписи. */
  pending?: boolean;
  /** Валюта студии — для скидки первого занятия суммой. */
  currency?: string;
  onToggle: () => void;
}

export function EligibleClientRow({ client, selected, pending = false, currency, onToggle }: Props) {
  const initials = [client.name, client.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase();
  const tint = client.avatar_color || 'var(--peach)';
  return (
    <button type="button" className={`ec-row${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onToggle}>
      <span className="ec-avatar" style={{ '--ec-tint': tint } as React.CSSProperties}>{initials}</span>
      <span className="ec-text">
        <span className="ec-name">{client.name} {client.last_name ?? ''}</span>
        {client.phone && <span className="ec-phone">{client.phone}</span>}
      </span>
      {!pending && <FundingBadge client={client} currency={currency} />}
      <span className="ec-check" aria-hidden>{selected && <Icons.Check />}</span>
    </button>
  );
}

function FundingBadge({ client, currency }: { client: EligibleClient; currency?: string }) {
  const { t } = useTranslation('journal');
  switch (client.funding) {
    case 'subscription':
      return (
        <span className="ec-badge is-subscription"
              title={client.classes_left != null ? t('bookingPopup.funding.subscriptionHint', { left: client.classes_left }) : undefined}>
          {client.classes_left != null
            ? t('bookingPopup.funding.subscription', { left: client.classes_left })
            : t('bookingPopup.funding.subscriptionPlain')}
        </span>
      );
    case 'trial':
      return (
        <span className="ec-badge is-trial">
          {client.trial_amount != null
            ? t('bookingPopup.trialDiscountAmount', { amount: formatMoney(client.trial_amount, currency) })
            : client.trial_percent != null && client.trial_percent < 100
              ? t('bookingPopup.trialDiscount', { percent: client.trial_percent })
              : t('bookingPopup.trialLesson')}
        </span>
      );
    case 'free':
      return <span className="ec-badge is-free">{t('bookingPopup.funding.free')}</span>;
    default:
      return <span className="ec-badge is-pay" title={t('bookingPopup.funding.payHint')}>{t('bookingPopup.funding.pay')}</span>;
  }
}
