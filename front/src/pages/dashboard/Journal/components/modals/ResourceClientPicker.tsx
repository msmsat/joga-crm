import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { Select, type SelectOption } from '../../../../../components/ui/index';
import { errorMessage } from '../../../../../api/errorMessage';

export function ResourceClientPicker({ value, onChange, disabled = false }: {
  value: number | null; onChange: (id: number) => void; disabled?: boolean;
}) {
  const { t } = useTranslation(['journal', 'common']);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<SelectOption | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ['clients', 'resource-picker', debounced],
    queryFn: () => clientsApi.getList({ search: debounced, limit: 50, offset: 0 }),
  });
  const options = (query.data?.items ?? []).map(item => ({
    value: String(item.id), label: `${item.name} ${item.last_name ?? ''}`.trim(),
    hint: debounced && item.email?.toLowerCase().includes(debounced.toLowerCase())
      ? item.email : item.phone || item.email || undefined,
  }));
  if (selected && !options.some(option => option.value === selected.value)) {
    options.unshift({ ...selected, hint: selected.hint });
  }
  return <div style={{ display: 'grid', gap: 6 }}>
    <label className="vk-label">{t('journal:resourceBooking.client')}</label>
    <Select value={value == null ? '' : String(value)} options={options}
      placeholder={t('journal:resourceBooking.chooseClient')}
      searchable searchPlaceholder={t('journal:resourceBooking.searchClient')}
      onSearchChange={setSearch} disabled={disabled}
      loading={query.isFetching || search.trim() !== debounced}
      emptyText={query.isFetching || search.trim() !== debounced
        ? t('common:loading') : t('journal:resourceBooking.noClients')}
      onChange={id => {
        setSelected(options.find(option => option.value === id) ?? null);
        onChange(Number(id));
      }} />
    {query.error && <div role="alert">{errorMessage(query.error, t)}
      <button type="button" onClick={() => void query.refetch()}>{t('common:errors.retry')}</button>
    </div>}
  </div>;
}
