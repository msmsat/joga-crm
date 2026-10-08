import { useTranslation } from 'react-i18next';
import type { Service } from '../../types';
import { usePriceLabel } from '../../../../../hooks/usePriceLabel';
import { useBusinessTerms } from '../../../../../hooks/useBusinessTerms';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('');

/**
 * Кто оказывает услугу и на каких условиях. Свои цена или время мастера
 * (Сотрудники → «Роль») помечены точкой: именно из-за них у услуги в шапке
 * диапазон «от–до», и без пометки не понять, у кого он.
 * Заголовок — словом студии: тренеры, мастера, специалисты.
 */
export function ServicePeople({ service }: { service: Service }) {
  const { t } = useTranslation(['catalog', 'common']);
  const priceLabel = usePriceLabel();
  const { staff } = useBusinessTerms();
  const title = staff?.plural
    ? staff.plural.charAt(0).toLocaleUpperCase() + staff.plural.slice(1)
    : t('catalog:bundles.masters');
  const isOwn = (m: Service['masters'][number]) =>
    m.price !== service.price || (m.duration_min ?? service.duration_min) !== service.duration_min;
  const anyOwn = service.masters.some(isOwn);

  return (
    <section className="svc-block">
      <h3 className="svc-h">{title}<span className="svc-count">{service.masters.length}</span></h3>
      <ul className="svc-people">
        {service.masters.map(master => (
          <li key={master.user_id} className="svc-person">
            <span className="svc-ava" aria-hidden="true">{initials(master.name)}</span>
            <span className="svc-person-text">
              <span className="svc-person-name">{master.name}</span>
              <span className="svc-person-sub">{master.duration_min ?? service.duration_min} {t('common:units.min')}</span>
            </span>
            <span className={`svc-person-v${isOwn(master) ? ' is-own' : ''}`}>
              {isOwn(master) && <span className="svc-own-dot" />}
              {priceLabel(master.price, master.price, true)}
            </span>
          </li>
        ))}
      </ul>
      {anyOwn && <p className="svc-own-note"><span className="svc-own-dot" />{t('catalog:services.card.ownTerms')}</p>}
    </section>
  );
}
