import { useTranslation } from 'react-i18next';
import { Button, Select } from '../../../../../components/ui/index';
import type { Service } from '../../types';

const svg = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ICON_UP = <svg {...svg}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>;
const ICON_DOWN = <svg {...svg}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>;
const ICON_REMOVE = <svg {...svg}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;

/** Ordered composition. The same controls work with a mouse, keyboard and touch. */
export function BundleEditor({ services, parts, partIds, onChange, error }: {
  services: Service[];
  parts: Service[];
  partIds: number[];
  onChange: (ids: number[]) => void;
  error: string | undefined;
}) {
  const { t } = useTranslation(['catalog', 'common']);
  const eligible = services.filter(s => !s.bundle_items.length && (s.type === 'individual' || s.booking_mode === 'resource') && !partIds.includes(s.id));
  function move(index: number, offset: number) {
    const ids = [...partIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    onChange(ids);
  }
  return <section className="cat-bundle-editor" aria-label={t('catalog:bundles.parts')}>
    <label className="vk-label">{t('catalog:bundles.parts')} · {partIds.length}/10</label>
    <p className="cat-bundle-muted">{t('catalog:bundles.hint')}</p>
    <div className="cat-bundle-parts">
      {parts.map((part, index) => <div className="cat-bundle-editor-row" key={part.id}>
        <div className="cat-bundle-part-name"><strong>{index + 1}. {part.name}</strong><span className="cat-bundle-muted">{part.duration_min} {t('common:units.min')}</span></div>
        <div className="cat-bundle-controls">
          <Button size="sm" variant="ghost" ariaLabel={t('catalog:bundles.up')} disabled={index === 0} onClick={() => move(index, -1)}>{ICON_UP}</Button>
          <Button size="sm" variant="ghost" ariaLabel={t('catalog:bundles.down')} disabled={index === parts.length - 1} onClick={() => move(index, 1)}>{ICON_DOWN}</Button>
          <Button size="sm" variant="ghost" ariaLabel={t('common:buttons.delete')} onClick={() => onChange(partIds.filter(id => id !== part.id))}>{ICON_REMOVE}</Button>
        </div>
      </div>)}
    </div>
    {partIds.length < 10 && <Select value="" placeholder={t('catalog:bundles.addPart')} searchable
      searchPlaceholder={t('catalog:bundles.addPart')} emptyText={t('catalog:bundles.size')}
      options={eligible.map(s => ({ value: String(s.id), label: s.name }))}
      onChange={value => { if (value) onChange([...partIds, Number(value)]); }} />}
    <p className="cat-bundle-muted" role={error ? 'alert' : undefined}>{error || t('catalog:bundles.size')}</p>
  </section>;
}
