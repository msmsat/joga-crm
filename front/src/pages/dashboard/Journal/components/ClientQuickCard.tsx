import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientsApi } from '../../../../api/clients/clients.api';
import { queryKeys } from '../../../../api/queryKeys';
import { Dialog, ModalHeader, ModalBody, ModalFooter, GhostButton, useToast } from '../../../../components/ui/index';
import { formatMoney } from '../../../../lib/money';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import {
  ClientContacts, ClientFacts, ClientHistory, ClientNextVisit, ClientNotesList, ClientProductCard, ClientReviews, Stat,
} from './lesson/ClientCardSections';
import './lesson/lessonCard.css';

/** Этаж выше попапа журнала (9000) и ниже подтверждений (9999). */
const FLOOR = 9500;

/**
 * Кто этот человек — прямо из занятия, по щелчку на строке записанного.
 *
 * Всё, что стоит вспомнить ДО занятия, в одном окне: как дозвониться, чем
 * платит, сколько раз был и сколько пропустил, что о нём записали, что он сам
 * говорил о занятиях. Профиль — из карточки клиента, визиты, неявки и отзывы —
 * одной серверной сводкой (GET /clients/{id}/digest). Править ничего нельзя:
 * для правки есть карточка целиком, ссылка на неё внизу.
 */
export function ClientQuickCard({ clientId, onClose }: { clientId: number; onClose: () => void }) {
  const { t, i18n } = useTranslation(['journal', 'clients', 'common']);
  const navigate = useNavigate();
  const toast = useToast();
  const currency = useStudioCurrency();

  const { data: client, isPending } = useQuery({
    queryKey: queryKeys.client(clientId),
    queryFn: () => clientsApi.getProfile(clientId),
  });
  const { data: digest } = useQuery({
    queryKey: queryKeys.clientDigest(clientId),
    queryFn: () => clientsApi.getDigest(clientId),
  });

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value)
      .then(() => toast.success(t('journal:clientCard.copied')))
      .catch(() => {});
  };

  const name = client ? [client.name, client.last_name].filter(Boolean).join(' ') : '';
  const initials = client ? [client.name, client.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase() : '';
  const since = client?.registration_date
    ? t('journal:clientCard.since', { date: new Date(client.registration_date).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) })
    : undefined;
  const points = client?.loyalty_points ?? 0;

  return (
    <Dialog onClose={onClose} zIndex={FLOOR} maxWidth="780px">
      <ModalHeader title={name || t('journal:clientCard.title')} subtitle={[client?.city, since].filter(Boolean).join(' · ') || undefined} />
      <ModalBody>
        {isPending || !client ? (
          <div className="cq-skeleton"><div /><div /><div /></div>
        ) : (
          <>
            <div className="cq-hero">
              <span className="cq-avatar" style={{ background: client.avatar_color ?? 'var(--peach)' }}>{initials}</span>
              <div className="cq-hero-main">
                <div className="cq-hero-chips">
                  <span className={`lc-badge${client.status === 'vip' ? ' is-star' : client.status === 'inactive' || client.status === 'frozen' ? '' : ' is-paid'}`}>
                    {t(`clients:status.${client.status}`)}
                  </span>
                  {client.loyalty_level && (
                    <span className="lc-badge" style={{ color: client.loyalty_level.color, background: `color-mix(in srgb, ${client.loyalty_level.color} 14%, transparent)` }}>
                      {client.loyalty_level.name}
                    </span>
                  )}
                  {(client.debt ?? 0) > 0 && (
                    <span className="lc-badge is-debt">{t('journal:clientCard.owes', { amount: formatMoney(client.debt, currency) })}</span>
                  )}
                  {client.tags?.map(tag => <span key={tag} className="lc-badge is-quiet">{tag}</span>)}
                </div>
              </div>
            </div>

            <div className="cq-stats">
              <Stat label={t('journal:clientCard.visits')} value={String(digest?.attended ?? client.visit_count)} />
              <Stat
                label={t('journal:clientCard.attendance')}
                value={digest?.attendance_rate != null ? `${digest.attendance_rate}%` : '—'}
                tone={digest?.attendance_rate != null && digest.attendance_rate < 70 ? 'rose' : undefined}
              />
              <Stat label={t('journal:clientCard.missed')} value={String(digest?.missed ?? 0)} tone={(digest?.missed ?? 0) > 0 ? 'rose' : undefined} />
              <Stat label={t('journal:clientCard.spent')} value={formatMoney(client.total_spent, currency)} />
              <Stat label={t('journal:clientCard.points')} value={String(points)} tone={points > 0 ? 'good' : undefined} />
              <Stat label={t('journal:clientCard.rating')} value={digest?.avg_rating != null ? `★ ${digest.avg_rating}` : '—'} />
            </div>

            <div className="cq-grid">
              <div className="cq-col">
                <ClientContacts client={client} onCopy={copy} />
                {client.products?.[0] && <ClientProductCard product={client.products[0]} />}
                {digest?.next_visit && <ClientNextVisit visit={digest.next_visit} />}
                <ClientFacts client={client} digest={digest ?? null} />
              </div>
              <div className="cq-col">
                <ClientNotesList notes={client.notes ?? []} zIndex={FLOOR + 100} />
                <ClientHistory digest={digest ?? null} currency={currency} />
                {digest && digest.reviews.length > 0 && <ClientReviews reviews={digest.reviews} />}
              </div>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('common:buttons.close')}</GhostButton>
        <button
          type="button"
          className="bp-btn primary text-btn"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => navigate(`/dashboard/clients?client=${clientId}`)}
        >
          {t('journal:clientCard.openFull')}
        </button>
      </ModalFooter>
    </Dialog>
  );
}
