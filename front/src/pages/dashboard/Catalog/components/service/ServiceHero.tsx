import { useTranslation } from 'react-i18next';
import type { Service } from '../../types';
import { Button } from '../../../../../components/ui/index';
import * as Icons from '../../../../../components/Icons';
import { usePriceLabel } from '../../../../../hooks/usePriceLabel';
import { TimeRibbon } from './TimeRibbon';

/** Кнопка-иконка кита — квадратная: поля как у кнопки с подписью ей велики. */
const ICON_ONLY = { padding: '9px 11px' };

interface Props {
  service: Service;
  categoryLabel: string;
  /** Подключено ли мини-приложение: без него метка «онлайн-запись» ничего не значит. */
  hasMiniapp: boolean;
  canShareQr: boolean;
  onQr: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Шапка карточки: кто это (метки, название, описание), почём и сколько длится. */
export function ServiceHero({ service, categoryLabel, hasMiniapp, canShareQr, onQr, onEdit, onDelete }: Props) {
  const { t } = useTranslation(['catalog', 'common']);
  const priceLabel = usePriceLabel();
  const isBundle = service.bundle_items.length > 0;
  const seats = service.type === 'group' && (service.max_clients ?? 0) > 1 ? service.max_clients : null;
  const { duration_from: from, duration_to: to } = service;

  return (
    <section className="svc-hero">
      <ul className="svc-tags">
        <li className="svc-tag svc-tag-id"><span className="svc-tag-dot" />{categoryLabel}</li>
        <li className="svc-tag svc-tag-id">
          {isBundle ? t('catalog:bundles.badge')
            : service.type === 'group' ? t('catalog:services.card.group') : t('catalog:services.card.individual')}
        </li>
        {hasMiniapp && (
          <li className={`svc-tag ${service.is_bookable ? 'is-on' : 'is-off'}`}>
            <span className="svc-tag-dot" />
            {service.is_bookable ? t('catalog:services.card.onlineOn') : t('catalog:services.card.onlineOff')}
          </li>
        )}
      </ul>

      <div className="svc-actions">
        <Button variant="ghost" size="sm" icon={<Icons.Edit />} onClick={onEdit}>{t('common:buttons.edit')}</Button>
        {canShareQr && (
          <Button variant="ghost" size="sm" icon={<Icons.QrCode />} ariaLabel={t('common:qr.serviceAction')} style={ICON_ONLY} onClick={onQr}>{null}</Button>
        )}
        <Button variant="ghost" size="sm" icon={<Icons.Trash />} ariaLabel={t('common:buttons.delete')} style={ICON_ONLY} onClick={onDelete}>{null}</Button>
      </div>

      <h2 className="svc-name">{service.name}</h2>
      {service.description.trim() && <p className="svc-desc">{service.description}</p>}

      <div className="svc-figs">
        <div className="svc-fig">
          <span className="svc-fig-v">
            {priceLabel(service.price_min, service.price_max, true)}
            {service.bundle_full_price != null && (
              <del className="svc-fig-was">{priceLabel(service.bundle_full_price, service.bundle_full_price, true)}</del>
            )}
          </span>
          <span className="svc-fig-l">{t('catalog:services.stats.price')}</span>
        </div>
        <div className="svc-fig">
          <span className="svc-fig-v">
            {to > from ? `${from}–${to}` : from}
            <span className="svc-fig-unit">{t('common:units.min')}</span>
          </span>
          <span className="svc-fig-l">{t('catalog:services.stats.duration')}</span>
        </div>
        {seats && (
          <div className="svc-fig">
            <span className="svc-fig-v">{seats}</span>
            <span className="svc-fig-l">{t('catalog:modals.service.statSeats')}</span>
          </div>
        )}
      </div>

      <TimeRibbon before={service.buffer_before_min} from={from} to={to} after={service.buffer_after_min} />
    </section>
  );
}
