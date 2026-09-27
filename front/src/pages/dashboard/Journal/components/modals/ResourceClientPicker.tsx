import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { Select, type SelectOption } from '../../../../../components/ui/index';
import { errorMessage } from '../../../../../api/errorMessage';
import * as Icons from '../../../../../components/Icons';
import { AddClientModal as NewClientModal } from '../../../Clients/components/modals/AddClientModal';

/** Выбор клиента из списка с поиском и «+ Новый клиент» рядом с подписью.
 *  Кроме записи в Журнале — промокод на клиента в Лояльности: там выбор
 *  необязателен, поэтому есть `onClear` (код снова для всех). */
export function ResourceClientPicker({
  value, onChange, disabled = false, labelClass = 'vk-label', label, placeholder, onClear, clearLabel,
}: {
  value: number | null; onChange: (id: number) => void; disabled?: boolean;
  /** Клавиатурное окно журнала подписывает поля своим классом (kp-section-title). */
  labelClass?: string;
  /** Подпись и текст пустого поля; по умолчанию — клиент записи. */
  label?: string; placeholder?: string;
  /** Выбор можно снять: кнопка появляется у подписи, пока клиент выбран. */
  onClear?: () => void; clearLabel?: string;
}) {
  const { t } = useTranslation(['journal', 'common', 'clients']);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<SelectOption | null>(null);
  // «+ Новый клиент» рядом с подписью: заведённый клиент сразу выбран.
  const [creating, setCreating] = useState(false);
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <label className={labelClass}>{label ?? t('journal:resourceBooking.client')}</label>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
        {onClear && value != null && (
          <button type="button" className="rcp-new rcp-clear" disabled={disabled} onClick={onClear}>
            <Icons.X /> {clearLabel}
          </button>
        )}
        <button type="button" className="rcp-new" disabled={disabled} onClick={() => setCreating(true)}>
          <Icons.Plus /> {t('clients:addModal.title')}
        </button>
      </span>
    </div>
    <Select value={value == null ? '' : String(value)} options={options}
      placeholder={placeholder ?? t('journal:resourceBooking.chooseClient')}
      searchable searchPlaceholder={t('journal:resourceBooking.searchClient')}
      onSearchChange={setSearch} disabled={disabled}
      loading={query.isFetching || search.trim() !== debounced}
      emptyText={query.isFetching || search.trim() !== debounced
        ? t('common:loading') : t('journal:resourceBooking.noClients')}
      onChange={id => {
        setSelected(options.find(option => option.value === id) ?? null);
        onChange(Number(id));
      }} />
    {/* Окно формы — порталом в body, но события React всплывают по дереву:
        без этой обёртки клик в форме закрыл бы окно записи под ней. */}
    <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <NewClientModal isOpen={creating} onClose={() => setCreating(false)} onSuccess={(form, id) => {
        setSelected({ value: String(id), label: form.name.trim(), hint: form.phone || form.email.trim() || undefined });
        onChange(id);
      }} />
    </div>
    {query.error && <div role="alert">{errorMessage(query.error, t)}
      <button type="button" onClick={() => void query.refetch()}>{t('common:errors.retry')}</button>
    </div>}
  </div>;
}
