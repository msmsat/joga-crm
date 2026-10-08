import { useTranslation } from 'react-i18next';
import type { Service } from '../../types';
import { Button } from '../../../../../components/ui/index';
import { usePriceLabel } from '../../../../../hooks/usePriceLabel';

/**
 * Связи комплекса: у комплекса — его части по порядку визита, у части —
 * комплексы, куда она входит. Любая строка открывает ту услугу.
 */
export function ServiceBundle({ service, onPick }: { service: Service; onPick: (id: number) => void }) {
  const { t } = useTranslation(['catalog', 'common']);
  const priceLabel = usePriceLabel();
  const parts = service.bundle_items;

  return <>
    {parts.length > 0 && (
      <section className="svc-block">
        <h3 className="svc-h">{t('catalog:bundles.parts')}<span className="svc-count">{parts.length}</span></h3>
        <ol className="svc-parts">
          {parts.map((part, index) => (
            <li key={part.service_id}>
              <button type="button" className="svc-part" onClick={() => onPick(part.service_id)}>
                <span
                  className="svc-part-n"
                  style={{ background: `color-mix(in srgb, ${part.color ?? '#FCAE91'} 22%, var(--bg-card))` }}
                >{index + 1}</span>
                <span className="svc-part-name">{part.name}</span>
                <span className="svc-part-meta">
                  {part.duration_min} {t('common:units.min')} · {priceLabel(part.price_min, part.price_max, true)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="svc-muted" style={{ marginTop: 10 }}>{t('catalog:bundles.hint')}</p>
        {service.masters.length === 0 && <p className="svc-muted" style={{ marginTop: 6 }}>{t('catalog:bundles.noMasters')}</p>}
      </section>
    )}
    {service.in_bundles.length > 0 && (
      <section className="svc-block">
        <h3 className="svc-h">{t('catalog:bundles.inBundles')}</h3>
        <div className="svc-refs">
          {service.in_bundles.map(bundle => (
            <Button key={bundle.id} size="sm" variant="ghost" onClick={() => onPick(bundle.id)}>{bundle.name}</Button>
          ))}
        </div>
      </section>
    )}
  </>;
}
