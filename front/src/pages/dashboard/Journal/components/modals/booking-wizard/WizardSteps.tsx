// Шаги мастера записи: клиент, услуга, мастер. Выбор строки сразу ведёт
// на следующий незаполненный шаг; «Продолжить» в подвале — для того, что уже
// выбрано (заведённый здесь же клиент, возврат на шаг полоской).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClientsList, useClientCategories } from '../../../../Clients/hooks/useClientsList';
import { getAvatarColor, getInitials, nameInitials } from '../../../../Clients/utils/mapClient';
import { usePriceLabel } from '../../../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../../../hooks/useDurationLabel';
import type { BookingWizardState } from './useBookingWizard';
import { WizardChips, WizardEmpty, WizardRow, WizardSearch } from './WizardParts';
import * as Icons from '../../../../../../components/Icons';

/** onCreate — «+ Новый клиент»: лист меняется на форму клиента (NewClientStep). */
export function ClientStep({ w, onCreate }: { w: BookingWizardState; onCreate: () => void }) {
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
        <button type="button" className="bw-row bw-row-new" onClick={onCreate}>
          <span className="bw-av"><Icons.Plus /></span>
          <span className="bw-row-text"><span className="bw-row-title">{t('clients:addModal.title')}</span></span>
        </button>
        {/* Заведённый здесь клиент — первым и с галочкой: его осталось подтвердить. */}
        {w.fresh && (
          <WizardRow key={`fresh-${w.fresh.id}`} active={w.client?.id === w.fresh.id}
                     avatar={nameInitials(w.fresh.name)} color={getAvatarColor(w.fresh.id, null)}
                     title={w.fresh.name} hint={w.fresh.hint}
                     onClick={() => w.pickClient(w.fresh!.id, w.fresh!.name)} />
        )}
        {list.clients.filter(c => c.id !== w.fresh?.id).map(c => (
          <WizardRow key={c.id} active={w.client?.id === c.id}
                     avatar={getInitials(c.name, c.last_name)} color={getAvatarColor(c.id, c.avatar_color)}
                     title={`${c.name} ${c.last_name ?? ''}`.trim()} hint={c.phone ?? c.email}
                     onClick={() => w.pickClient(c.id, `${c.name} ${c.last_name ?? ''}`.trim())} />
        ))}
        {list.clients.length === 0 && !w.fresh && (
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
  const states = w.masters.map(m => w.masterStates.get(m.id));
  const allBusy = states.length > 0 && states.every(st => st?.kind === 'busy');
  return (
    <div className="bw-list">
      {/* Время названо первым шагом — сразу видно, кто в него свободен. */}
      {allBusy && <div className="bw-note">{t('wizard.allBusy', { time: w.time })}</div>}
      {w.masters.map((m, i) => {
        const look = trainers.find(tr => tr.id === m.id);
        const st = states[i];
        const price = w.isResource ? w.resource.priceAt(m.id, w.service?.id ?? null) : undefined;
        if (st?.kind === 'busy') {
          // Занят — строка приглушена; ближайшее свободное время справа, тап
          // берёт мастера вместе с ним. Свободного до конца дня нет — не выбрать.
          return (
            <WizardRow key={m.id ?? 'any'} muted disabled={st.nearest == null}
                       avatar={look?.initials ?? '∗'} color={look?.color ?? 'var(--peach)'} title={m.name}
                       hint={st.nearest ? t('wizard.busyAt', { time: w.time }) : t('resourceBooking.noSlots')}
                       aside={st.nearest ? <span className="jf-chip bw-nearest">{st.nearest}</span> : undefined}
                       onClick={() => { if (st.nearest) w.pickMaster(m.id, st.nearest); }} />
          );
        }
        const hint = st?.kind === 'join'
          ? `${t('wizard.existing')} · ${st.lesson.booked_count}/${st.lesson.total_spots}`
          : price;
        return (
          // Подсвечен выбранный — или мастер колонки, по которой тапнули;
          // «любой» до выбора не отмечен: это не выбор, а пустое значение.
          <WizardRow key={m.id ?? 'any'} active={w.teacherId === m.id && (w.masterChosen || m.id != null)}
                     avatar={look?.initials ?? '∗'} color={look?.color ?? 'var(--peach)'}
                     title={m.name} hint={hint}
                     onClick={() => w.pickMaster(m.id)} />
        );
      })}
      {w.masters.length === 0 && <WizardEmpty>{t('wizard.noMasters')}</WizardEmpty>}
    </div>
  );
}
