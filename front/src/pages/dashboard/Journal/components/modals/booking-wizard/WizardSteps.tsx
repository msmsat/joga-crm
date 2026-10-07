// Разделы мастера записи: клиент, услуга, мастер. Выбор строки сразу ведёт
// в следующий незаполненный раздел; «Продолжить» в подвале — для того, что уже
// выбрано (заведённый здесь же клиент, возврат кнопкой в шапке).
// Справа от поиска в каждом разделе — кнопка даты и времени (when, WhenPicker):
// она стоит над списком и не уезжает при прокрутке.
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useClientsList, useClientCategories } from '../../../../Clients/hooks/useClientsList';
import { getAvatarColor, getInitials, nameInitials } from '../../../../Clients/utils/mapClient';
import { usePriceLabel } from '../../../../../../hooks/usePriceLabel';
import { useDurationLabel } from '../../../../../../hooks/useDurationLabel';
import { isTime, type BookingWizardState } from './useBookingWizard';
import { WizardChips, WizardEmpty, WizardRow, WizardSearch } from './WizardParts';
import { PastLessonsInline, PastLessonsToggle } from '../../pastLessons';
import * as Icons from '../../../../../../components/Icons';

type StepProps = { w: BookingWizardState; when: ReactNode };

/** onCreate — «+ Новый клиент»: лист меняется на форму клиента (NewClientStep). */
export function ClientStep({ w, when, onCreate }: StepProps & { onCreate: () => void }) {
  const { t } = useTranslation(['journal', 'clients', 'common']);
  const list = useClientsList();
  const categories = useClientCategories();
  // Подгрузка следующей страницы, когда список докрутили почти до конца.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (list.hasMore && !list.isLoading && el.scrollTop + el.clientHeight > el.scrollHeight - 200) void list.loadMore();
  };
  // Необязательного клиента повторное касание снимает — занятие останется без него.
  const choose = (id: number, name: string) =>
    w.clientOptional && w.client?.id === id ? w.clearClient() : w.pickClient(id, name);
  // Прошлые занятия раскрываются под строкой — у одного клиента за раз.
  // Нажатие на занятие записывает этого клиента так же (w.repeat).
  const [historyOf, setHistoryOf] = useState<number | null>(null);
  return (
    <>
      <div className="bw-tools">
        <div className="bw-tools-row">
          <WizardSearch value={list.rawSearch} onChange={list.setRawSearch}
                        placeholder={t('journal:resourceBooking.searchClient')} />
          {when}
        </div>
        {w.clientOptional && <p className="bw-optional">{t('journal:wizard.clientOptional')}</p>}
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
                     onClick={() => choose(w.fresh!.id, w.fresh!.name)} />
        )}
        {list.clients.filter(c => c.id !== w.fresh?.id).map(c => (
          <WizardRow key={c.id} active={w.client?.id === c.id}
                     avatar={getInitials(c.name, c.last_name)} color={getAvatarColor(c.id, c.avatar_color)}
                     title={`${c.name} ${c.last_name ?? ''}`.trim()} hint={c.phone ?? c.email}
                     onClick={() => choose(c.id, `${c.name} ${c.last_name ?? ''}`.trim())}
                     side={<PastLessonsToggle open={historyOf === c.id} count={c.visit_count}
                                              onToggle={() => setHistoryOf(id => (id === c.id ? null : c.id))} />}
                     below={<PastLessonsInline clientId={c.id} open={historyOf === c.id} canRepeat={w.canRepeat}
                                               onRepeat={repeat => w.repeat({ id: c.id, name: `${c.name} ${c.last_name ?? ''}`.trim() }, repeat)} />} />
        ))}
        {list.clients.length === 0 && !w.fresh && (
          <WizardEmpty>{list.isLoading ? t('common:loading') : t('journal:resourceBooking.noClients')}</WizardEmpty>
        )}
      </div>
    </>
  );
}

export function ServiceStep({ w, when }: StepProps) {
  const { t } = useTranslation(['journal', 'common']);
  const priceLabel = usePriceLabel();
  const durationLabel = useDurationLabel();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showAll, setShowAll] = useState(false);
  // Только услуги, на которые в названное время можно записать. Пока время
  // не названо — все. Пока расписание грузится — ждём, а не мигаем списком.
  const timed = isTime(w.time);
  const loading = w.availability.loading;
  const free = useMemo(
    () => w.serviceList.filter(s => showAll || s.id === w.service?.id || w.serviceStates.get(s.id)?.kind !== 'busy'),
    [w.serviceList, w.serviceStates, w.service, showAll]);
  // Направления — категории услуг из Каталога, в порядке появления.
  const categories = useMemo(
    () => [...new Set(free.map(s => s.category).filter((c): c is string => !!c))],
    [free]);
  const q = search.trim().toLowerCase();
  const shown = loading && !showAll ? [] : free.filter(s =>
    (!category || s.category === category) && (!q || s.name.toLowerCase().includes(q)));
  return (
    <>
      <div className="bw-tools">
        <div className="bw-tools-row">
          <WizardSearch value={search} onChange={setSearch} placeholder={t('journal:wizard.searchService')} />
          {when}
        </div>
        {/* «Индивидуальное» — формат занятия, а не фильтр: список услуг тот же,
            групповая встанет занятием на одного клиента. */}
        <div className="bw-tools-row bw-tools-end">
          <button type="button" className="bw-filter-toggle" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>
            {t(showAll ? 'journal:wizard.onlyAvailable' : 'journal:wizard.showAll')}
          </button>
          {w.canSolo && (
            <button type="button" className={`bw-solo${w.solo ? ' is-on' : ''}`} aria-pressed={w.solo}
                    title={t('journal:newBooking.individualHint')} onClick={w.toggleSolo}>
              <Icons.User />
              <span className="bw-solo-label">{t('journal:newBooking.individual')}</span>
            </button>
          )}
        </div>
        <WizardChips value={category} onPick={setCategory}
                     options={[{ value: '', label: t('journal:toolbar.all') }, ...categories.map(c => ({ value: c, label: c }))]} />
      </div>
      <div className="bw-list">
        {shown.map(s => (
          <WizardRow key={s.id} active={w.service?.id === s.id} muted={w.serviceStates.get(s.id)?.kind === 'busy'}
                     aside={w.serviceStates.get(s.id)?.kind === 'busy' ? <span className="bw-unavailable">{t('journal:wizard.unavailable')}</span> : undefined}
                     avatar="" color={s.color ?? 'var(--peach)'} title={s.name}
                     hint={`${priceLabel(s.price_min ?? s.price, s.price_max ?? s.price, true)} · ${
                       durationLabel(s.duration_from ?? s.duration_min, s.duration_to ?? s.duration_min)}`}
                     onClick={() => w.pickService(s)} />
        ))}
        {shown.length === 0 && (
          <WizardEmpty>
            {loading ? t('common:loading')
              : timed && free.length === 0 ? t('journal:wizard.noServicesAt', { time: w.time })
              : t('journal:resourceBooking.noServices')}
          </WizardEmpty>
        )}
      </div>
    </>
  );
}

export function MasterStep({ w, when }: StepProps) {
  const { t } = useTranslation(['journal', 'common']);
  const [showAll, setShowAll] = useState(false);
  const stateOf = (id: number | null) => w.masterStates.get(id)?.kind ?? (w.availability.loading ? 'unknown' : 'busy');
  const shown = w.masters.filter(m => showAll || (w.masterChosen && m.id === w.teacherId) || stateOf(m.id) === 'free');
  return (
    <>
      <div className="bw-tools">
        <div className="bw-tools-row bw-tools-end">
          {w.service && <span className="bw-tools-label">{w.service.name}</span>}
          {when}
        </div>
        <button type="button" className="bw-filter-toggle" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>
          {t(showAll ? 'journal:wizard.onlyAvailable' : 'journal:wizard.showAll')}
        </button>
      </div>
      <div className="bw-list">
        {shown.map(m => {
          const look = w.trainers.find(tr => tr.id === m.id);
          const busy = stateOf(m.id) === 'busy';
          return <WizardRow key={m.id ?? 'any'} active={w.masterChosen && w.teacherId === m.id} muted={busy}
            avatar={look?.initials ?? '∗'} color={look?.color ?? 'var(--peach)'} title={m.name}
            hint={busy ? t('journal:wizard.unavailable') : w.isResource ? w.resource.priceAt(m.id, w.service?.id ?? null) : undefined}
            onClick={() => w.pickMaster(m.id)} />;
        })}
        {shown.length === 0 && <WizardEmpty>{w.availability.loading ? t('common:loading') : t('journal:wizard.noMasters')}</WizardEmpty>}
      </div>
    </>
  );
}
