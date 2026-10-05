import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Button } from '../../../../components/ui/index';
import { FiltersGuide } from './FiltersGuide';
import { CATEGORY_ICONS } from './categoryIcons';
import { AdaptiveFilters } from './AdaptiveFilters';
import type { CategoryStat } from '../../../../api/clients/clients.types';
import styles from './ClientsToolbar.module.css';

export interface ClientsToolbarProps {
  categories: CategoryStat[]; activeCatKey: string; onCatChange: (key: string) => void;
  searchQuery: string; onSearch: (q: string) => void; onAddClick: () => void; canAdd?: boolean;
}
export function ClientsToolbar({ categories, activeCatKey, onCatChange, searchQuery, onSearch, onAddClick, canAdd = true }: ClientsToolbarProps) {
  const { t } = useTranslation('clients');
  return <div className={styles.row}>
    <AdaptiveFilters active={activeCatKey} onChange={onCatChange} label={t('toolbar.filters')}
      items={categories.map(cat => ({key: cat.key, label: t(`categories.${cat.key}`, {defaultValue: cat.label}), icon: CATEGORY_ICONS[cat.key], count: cat.count}))}/>
    <div className={styles.guide}><FiltersGuide categories={categories} activeCatKey={activeCatKey} onCatChange={onCatChange}/></div>
    <label className={styles.search}>
      <Search size={16} aria-hidden="true"/>
      <input type="search" value={searchQuery} onChange={e => onSearch(e.target.value)}
        placeholder={t('toolbar.searchPlaceholder')} aria-label={t('toolbar.searchPlaceholder')}/>
    </label>
    {canAdd && <Button size="sm" ariaLabel={t('toolbar.addClient')} onClick={onAddClick} icon={<Plus size={18} aria-hidden="true"/>}
      style={{width: 40, height: 40, padding: 0, flexShrink: 0}}>{null}</Button>}
  </div>;
}
