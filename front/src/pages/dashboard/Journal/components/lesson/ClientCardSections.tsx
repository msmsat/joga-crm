// Разделы карточки клиента в Журнале (ClientQuickCard): контакты, абонемент,
// ближайшая запись, факты, заметки, лента посещений и отзывы.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type {
  ClientDigest, ClientNote, ClientProduct, ClientProfile, DigestReview, DigestVisit,
} from '../../../../../api/clients/clients.types';
import { NotePhotos } from '../../../../../components/ui/index';
import { FundingChips } from './FundingChips';
import './lessonCard.css';

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

function useDate() {
  const { i18n } = useTranslation();
  return (value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(i18n.language, opts) : '—';
}

/** Полных лет на сегодня. */
const ageOf = (birth: string) => {
  const b = new Date(`${birth}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age -= 1;
  return age;
};

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'good' }) {
  return (
    <div className={`cq-stat${tone ? ` is-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cq-section">
      <div className="lc-eyebrow">{title}</div>
      {children}
    </section>
  );
}

export function ClientContacts({ client, onCopy }: { client: ClientProfile; onCopy: (value: string) => void }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  const rows = [
    client.phone && { icon: <Icons.PhoneIcon width={15} height={15}/>, value: client.phone, href: `tel:${client.phone}`,
      hint: client.phone_verified ? t('clientCard.phoneVerified') : undefined, copy: client.phone },
    client.instagram && { icon: <IconInstagram/>, value: `@${client.instagram}`, href: `https://instagram.com/${client.instagram}`, copy: client.instagram },
    client.email && { icon: <Icons.MailIcon width={15} height={15}/>, value: client.email, href: `mailto:${client.email}`, copy: client.email },
    client.birth_date && { icon: <IconCake/>, value: `${date(client.birth_date, { day: 'numeric', month: 'long' })} · ${t('clientCard.age', { value: ageOf(client.birth_date) })}` },
  ].filter(Boolean) as { icon: React.ReactNode; value: string; href?: string; hint?: string; copy?: string }[];
  if (rows.length === 0) return null;
  return (
    <Section title={t('clientCard.contacts')}>
      <div className="cq-contacts">
        {rows.map(r => (
          <div key={r.value} className="cq-contact">
            <span className="cq-contact-icon">{r.icon}</span>
            {r.href
              ? <a className="cq-contact-value" href={r.href} target={r.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{r.value}</a>
              : <span className="cq-contact-value">{r.value}</span>}
            {r.hint && <span className="cq-contact-hint">{r.hint}</span>}
            {r.copy && (
              <button type="button" className="cq-copy" aria-label={t('clientCard.copy')} onClick={() => onCopy(r.copy!)}>
                <IconCopy/>
              </button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ClientProductCard({ product }: { product: ClientProduct }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  const left = Math.max(0, product.total - product.used);
  return (
    <Section title={t('clientCard.subscription')}>
      <div className="cq-product">
        <div className="cq-product-head">
          <span className="cq-product-name">{product.type}</span>
          <span className="cq-product-left">{t('clientCard.left', { left, total: product.total })}</span>
        </div>
        <div className="cq-product-bar"><span style={{ width: `${product.total ? Math.min(100, product.used / product.total * 100) : 0}%` }} /></div>
        <div className="cq-product-meta">
          {product.is_frozen ? t('clientCard.frozen') : t('clientCard.until', { date: date(product.expires_at) })}
        </div>
      </div>
    </Section>
  );
}

export function ClientNextVisit({ visit }: { visit: DigestVisit }) {
  const { t, i18n } = useTranslation('journal');
  const at = new Date(visit.start_time);
  return (
    <Section title={t('clientCard.nextVisit')}>
      <div className="cq-next">
        <div className="cq-next-date">
          {at.getDate()}
          <small>{at.toLocaleDateString(i18n.language, { month: 'short' })}</small>
        </div>
        <div className="cq-next-main">
          <div className="cq-next-title">{visit.name}</div>
          <div className="cq-next-sub">
            {at.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
            {visit.teacher_name ? ` · ${visit.teacher_name}` : ''}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function ClientFacts({ client, digest }: { client: ClientProfile; digest: ClientDigest | null }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  const facts = [
    [t('clientCard.firstVisit'), date(digest?.first_visit)],
    [t('clientCard.lastVisit'), date(digest?.last_visit ?? client.last_visit_date)],
    digest?.favorite_trainer && [t('clientCard.favoriteTrainer'), digest.favorite_trainer],
    digest?.favorite_lesson && [t('clientCard.favoriteLesson'), digest.favorite_lesson],
    [t('clientCard.cancellations'), String(digest?.cancelled ?? 0)],
    client.source && [t('clientCard.source'), client.source],
  ].filter(Boolean) as [string, string][];
  return (
    <Section title={t('clientCard.about')}>
      <div className="cq-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="lc-tile">
            <span className="lc-tile-label">{label}</span>
            <span className="lc-tile-value" title={value}>{value}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ClientNotesList({ notes, zIndex }: { notes: ClientNote[]; zIndex: number }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  return (
    <Section title={t('clientCard.notes')}>
      {notes.length === 0
        ? <div className="cq-empty">{t('clientCard.noNotes')}</div>
        : notes.map(note => (
          <div key={note.id} className="cq-note">
            {note.text && <div className="cq-note-text">{note.text}</div>}
            <NotePhotos photos={note.photos ?? []} zIndex={zIndex} />
            <div className="cq-note-date">{date(note.updated_at ?? note.created_at)}</div>
          </div>
        ))}
    </Section>
  );
}

const STATUS_TONE: Record<DigestVisit['status'], string> = {
  attended: 'is-paid', missed: 'is-debt', cancelled: '', upcoming: 'is-peach',
};

export function ClientHistory({ digest, currency, zIndex }: { digest: ClientDigest | null; currency?: string; zIndex: number }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  if (!digest) return <div className="cq-skeleton"><div /></div>;
  return (
    <Section title={t('clientCard.history')}>
      {digest.history.length === 0
        ? <div className="cq-empty">{t('clientCard.noHistory')}</div>
        : (
          <div className="cq-timeline">
            {digest.history.map(v => (
              <div key={v.reservation_id} className={`cq-visit is-${v.status}`}>
                <span className="cq-visit-dot" />
                <div className="cq-visit-main">
                  <div className="cq-visit-title">{v.name}</div>
                  <div className="cq-visit-sub">
                    {date(v.start_time)}{v.teacher_name ? ` · ${v.teacher_name}` : ''}
                    {v.booked_at ? ` · ${t('clientCard.bookedOn', { date: date(v.booked_at, { day: 'numeric', month: 'short' }) })}` : ''}
                  </div>
                  {/* Пришёл ли — и как записан, чем оплачен: скидка, баллы,
                      сертификат, абонемент или долг. */}
                  <div className="lc-badges cq-visit-chips">
                    <span className={`lc-badge ${STATUS_TONE[v.status]}`}>{t(`clientCard.status.${v.status}`)}</span>
                  </div>
                  {v.status !== 'cancelled' && (
                    <FundingChips currency={currency} funding={{
                      price: v.price, trialPercent: v.trial_discount_percent,
                      trialAmount: v.trial_discount_amount, isTrial: v.is_trial,
                      subscriptionName: v.subscription_name, bySubscription: Boolean(v.subscription_name),
                      debt: v.debt, paidAmount: v.paid_amount, payment: v.payment,
                    }} />
                  )}
                  {v.review_text && <div className="cq-visit-review">«{v.review_text}»</div>}
                  {v.review_photos?.length > 0 && (
                    <div className="cq-visit-photos"><NotePhotos photos={v.review_photos} compact zIndex={zIndex} /></div>
                  )}
                </div>
                {v.rating != null
                  ? <span className="cq-visit-side is-star">★ {v.rating}</span>
                  : <span />}
              </div>
            ))}
          </div>
        )}
    </Section>
  );
}

export function ClientReviews({ reviews }: { reviews: DigestReview[] }) {
  const { t } = useTranslation('journal');
  const date = useDate();
  return (
    <Section title={t('clientCard.reviews')}>
      {reviews.map((r, i) => (
        <div key={i} className="cq-note">
          <div className="cq-visit-side is-star">{'★'.repeat(Math.max(0, Math.min(5, r.rating)))}</div>
          {r.text && <div className="cq-note-text">{r.text}</div>}
          <div className="cq-note-date">{date(r.created_at)}</div>
        </div>
      ))}
    </Section>
  );
}
