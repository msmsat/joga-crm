import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { clientsApi } from '../../../../api/clients/clients.api';
import { queryKeys } from '../../../../api/queryKeys';
import { Dialog, ModalHeader, ModalBody, ModalFooter, GhostButton, NotePhotos, useToast } from '../../../../components/ui/index';
import { formatMoney } from '../../../../lib/money';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';

const IconInstagram = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
    <line x1="17.5" y1="6.5" x2="17.5" y2="6.5" strokeWidth="2.4" strokeLinecap="round"/>
  </svg>
);

const IconCake = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 20h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z"/><path d="M12 8V5"/><path d="M8 8V6"/><path d="M16 8V6"/>
  </svg>
);

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
  </svg>
);

/** Этаж выше попапа журнала (9000) и ниже подтверждений (9999). */
const FLOOR = 9500;

/**
 * Кто этот человек — прямо из занятия, по щелчку на строке записанного.
 *
 * Отметить приход и посмотреть, с кем имеешь дело, — разные задачи, и раньше
 * вторая требовала уйти в Клиентов, найти там строку и вернуться. Здесь то,
 * что нужно ДО занятия: как дозвониться, чем клиент платит, что о нём уже
 * записали. Править ничего нельзя — для правки есть карточка целиком, ссылка
 * на неё внизу.
 */
export function ClientQuickCard({ clientId, onClose }: { clientId: number; onClose: () => void }) {
  const { t } = useTranslation('journal');
  const navigate = useNavigate();
  const toast = useToast();
  const currency = useStudioCurrency();

  const { data: client, isPending } = useQuery({
    queryKey: queryKeys.client(clientId),
    queryFn: () => clientsApi.getProfile(clientId),
  });

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value)
      .then(() => toast.success(t('clientCard.copied')))
      .catch(() => {});
  };

  const name = client ? [client.name, client.last_name].filter(Boolean).join(' ') : '';
  const product = client?.products?.[0] ?? null;

  return (
    <Dialog onClose={onClose} zIndex={FLOOR}>
      <ModalHeader title={name || t('clientCard.title')} subtitle={client?.city ?? undefined}/>
      <ModalBody>
        {isPending || !client ? (
          <div style={{ height: 180 }}/>
        ) : (
          <>
            {/* Связь: то, ради чего карточку и открывают посреди занятия. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {client.phone && (
                <ContactRow
                  icon={<Icons.PhoneIcon width={15} height={15}/>}
                  value={client.phone}
                  hint={client.phone_verified ? t('clientCard.phoneVerified') : undefined}
                  href={`tel:${client.phone}`}
                  onCopy={() => copy(client.phone!)}
                />
              )}
              {client.instagram && (
                <ContactRow
                  icon={<IconInstagram/>}
                  value={`@${client.instagram}`}
                  href={`https://instagram.com/${client.instagram}`}
                  onCopy={() => copy(client.instagram!)}
                />
              )}
              {client.email && (
                <ContactRow icon={<Icons.MailIcon width={15} height={15}/>} value={client.email} href={`mailto:${client.email}`} onCopy={() => copy(client.email!)}/>
              )}
              {client.birth_date && (
                <ContactRow icon={<IconCake/>} value={new Date(client.birth_date).toLocaleDateString()}/>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <Stat label={t('clientCard.visits')} value={String(client.visit_count)}/>
              <Stat label={t('clientCard.spent')} value={formatMoney(client.total_spent, currency)}/>
              <Stat
                label={t('clientCard.debt')}
                value={formatMoney(client.debt ?? 0, currency)}
                tone={(client.debt ?? 0) > 0 ? 'rose' : undefined}
              />
            </div>

            {product && (
              <div style={{
                padding: '12px 14px', borderRadius: 14,
                background: 'rgba(249,160,139,0.07)', border: '1px solid rgba(249,160,139,0.2)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--onyx)' }}>{product.type}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                  {product.used} / {product.total} · {new Date(product.expires_at).toLocaleDateString()}
                </div>
              </div>
            )}

            {client.tags && client.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {client.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    padding: '4px 10px', borderRadius: 999, background: 'rgba(var(--ink),0.04)',
                  }}>{tag}</span>
                ))}
              </div>
            )}

            {/* Заметки — последние из карточки. Ради них сюда и заходят чаще
                всего: травма, предпочтения, чего не делать. */}
            {client.notes && client.notes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {t('clientCard.notes')}
                </div>
                {client.notes.map(note => (
                  <div key={note.id} style={{
                    padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(var(--ink),0.02)', border: '1px solid rgba(var(--ink),0.04)',
                  }}>
                    {note.text && (
                      <div style={{ fontSize: 12.5, color: 'var(--onyx)', lineHeight: 1.55 }}>{note.text}</div>
                    )}
                    <NotePhotos photos={note.photos ?? []} zIndex={FLOOR + 100}/>
                  </div>
                ))}
              </div>
            )}
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
          {t('clientCard.openFull')}
        </button>
      </ModalFooter>
    </Dialog>
  );
}

function ContactRow({ icon, value, hint, href, onCopy }: {
  icon: React.ReactNode;
  value: string;
  hint?: string;
  href?: string;
  onCopy?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      {href ? (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--onyx)', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >{value}</a>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--onyx)' }}>{value}</span>
      )}
      {hint && (
        <span style={{ fontSize: 10, fontWeight: 800, color: '#86b08c', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{hint}</span>
      )}
      {onCopy && (
        <button type="button" className="btn-icon" style={{ marginLeft: 'auto', color: 'var(--border)' }} onClick={onCopy}>
          <IconCopy/>
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(var(--ink),0.02)' }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: tone === 'rose' ? 'var(--rose)' : 'var(--onyx)', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 3 }}>{label}</div>
    </div>
  );
}
