// Шаги 1–3 мастера записи: клиент, услуга, мастер. Выбор строки сразу ведёт
// на следующий шаг — отдельной кнопки «Далее» нет.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClientsList, useClientCategories } from '../../../../Clients/hooks/useClientsList';
import { getAvatarColor, getInitials } from '../../../../Clients/utils/mapClient';
import { usePriceLabel } from '../../../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../../../hooks/useDurationLabel';
import type { BookingWizardState } from './useBookingWizard';
import { WizardChips, WizardEmpty, WizardRow, WizardSearch } from './WizardParts';

export function ClientStep({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'clients', 'common']);
  const list = useClientsList();
  const categories = useClientCategories();
  // Подгрузка следующей страницы, когда список докрутили почти до конца.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (list.hasMore && !list.isLoading && el.scrollTop + el.clientHeight > el.scrollHeight - 200) void list.loadMore();
  };
  return (
    <>
      <div className="bw-tools">
        <WizardSearch value={list.rawSearch} onChange={list.setRawSearch}
                      placeholder={t('journal:resourceBooking.searchClient')} />
        <WizardChips value={list.category || 'all'} onPick={list.setCategory}
                     options={categories.map(c => ({
                       value: c.key,
                       label: c.key === 'all' ? t('journal:toolbar.all') : t(`clients:categories.${c.key}`, { defaultValue: c.label }),
                     }))} />
      </div>
      <div className="bw-list" onScroll={onScroll}>
        {list.clients.map(c => (
          <WizardRow key={c.id} active={w.client?.id === c.id}
                     avatar={getInitials(c.name, c.last_name)} color={getAvatarColor(c.id, c.avatar_color)}
                     title={`${c.name} ${c.last_name ?? ''}`.trim()} hint={c.phone ?? c.email}
                     onClick={() => w.pickClient(c.id, `${c.name} ${c.last_name ?? ''}`.trim())} />
        ))}
        {list.clients.length === 0 && (
          <WizardEmpty>{list.isLoading ? t('common:loading') : t('journal:resourceBooking.noClients')}</WizardEmpty>
        )}
      </div>
    </>
  );
}

export function ServiceStep({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'common']);
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  // Направления — категории услуг из Каталога, в порядке появления.
  const categories = useMemo(
    () => [...new Set(w.serviceList.map(s => s.category).filter((c): c is string => !!c))],
    [w.serviceList]);
  const q = search.trim().toLowerCase();
  const shown = w.serviceList.filter(s =>
    (!category || s.category === category) && (!q || s.name.toLowerCase().includes(q)));
  return (
    <>
      <div className="bw-tools">
        <WizardSearch value={search} onChange={setSearch} placeholder={t('journal:wizard.searchService')} />
        <WizardChips value={category} onPick={setCategory}
                     options={[{ value: '', label: t('journal:toolbar.all') }, ...categories.map(c => ({ value: c, label: c }))]} />
      </div>
      <div className="bw-list">
        {shown.map(s => (
          <WizardRow key={s.id} active={w.service?.id === s.id}
                     avatar="" color={s.color ?? 'var(--peach)'} title={s.name}
                     hint={`${priceLabel(s.price_min ?? s.price, s.price_max ?? s.price, true)} · ${
                       durationLabel(s.duration_from ?? s.duration_min, s.duration_to ?? s.duration_min)}`}
                     onClick={() => w.pickService(s)} />
        ))}
        {shown.length === 0 && <WizardEmpty>{t('journal:resourceBooking.noServices')}</WizardEmpty>}
      </div>
    </>
  );
}

export function MasterStep({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation('journal');
  const { trainers } = w;
  return (
    <div className="bw-list">
      {w.masters.map(m => {
        const look = trainers.find(tr => tr.id === m.id);
        return (
          <WizardRow key={m.id ?? 'any'} active={w.teacherId === m.id}
                     avatar={look?.initials ?? '∗'} color={look?.color ?? 'var(--peach)'}
                     title={m.name} hint={w.isResource ? w.resource.priceAt(m.id, w.service?.id ?? null) : undefined}
                     onClick={() => w.pickMaster(m.id)} />
        );
      })}
      {w.masters.length === 0 && <WizardEmpty>{t('wizard.noMasters')}</WizardEmpty>}
    </div>
  );
}
