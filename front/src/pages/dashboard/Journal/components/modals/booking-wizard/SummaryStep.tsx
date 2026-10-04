// Итог мастера записи — с него мастер открывается. Всё выбранное одним списком, у каждой строки
// «Изменить» — ведёт в тот раздел, где это выбирается, и обратно сюда, если
// после правки выбирать больше нечего. Итог открывается в любой момент, так что
// пустое здесь — «Не выбрано» с кнопкой «Выбрать». Место (зал нового занятия,
// филиал) выбирается прямо здесь: своего раздела у него нет. Записывает кнопка
// «Подтвердить» в подвале (BookingWizard). У индивидуальной записи перед
// заметкой — цена, своя скидка и отметки «Оплата» / «Посещение» (SettleBlock).
// Последним — заметка к записи: текст
// и снимки (кнопкой «Фото», перетаскиванием, Ctrl+V); ложится в занятие записи.
import { useTranslation } from 'react-i18next';
import {
  CLIENT_STEP, MASTER_STEP, SERVICE_STEP, TIME_STEP, isTime, type BookingWizardState,
} from './useBookingWizard';
import { NotePhotos, NoteDropZone } from '../../../../../../components/ui/index';
import { WizardChips } from './WizardParts';
import { SettleBlock } from './SettleBlock';

export function SummaryRow({ label, value, hint, onChange }: {
  label: string; value: string; hint?: string; onChange?: () => void;
}) {
  const { t } = useTranslation('journal');
  return (
    <div className={`bw-sum-row${value ? '' : ' empty'}`}>
      <div className="bw-sum-text">
        <span className="jf-title">{label}</span>
        <span className="bw-sum-value">{value || t('wizard.notChosen')}</span>
        {hint && <span className="bw-row-hint">{hint}</span>}
      </div>
      {onChange && (
        <button type="button" className="bw-sum-change" onClick={onChange}>
          {value ? t('wizard.change') : t('wizard.choose')}
        </button>
      )}
    </div>
  );
}

export function SummaryStep({ w }: { w: BookingWizardState }) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  // «Любой свободный» на проверке — уже конкретный человек: его назначил сервер.
  const master = !w.masterChosen ? undefined
    : w.teacherId == null && w.resource.quote ? w.resource.quote.terms.domain.trainer_name
    : w.masters.find(m => m.id === w.teacherId)?.name;
  const day = new Date(`${w.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' });

  // Индивидуальная — филиал (если их несколько), групповая — зал нового
  // занятия; у стоящего занятия место уже задано, менять тут нечего.
  const place = !w.service ? null : w.isResource
    ? w.resource.choice.branchOptions.length > 1 && (
      <WizardChips value={w.resource.branchId ?? 0} onPick={id => w.resource.setBranchId(id)}
                   options={w.resource.choice.branchOptions.map(b => ({ value: b.id, label: b.name }))} />)
    : w.joined ? null
    : w.noHall ? w.branches.length > 1 && (
      <WizardChips value={w.branch ?? 0} onPick={w.setBranchId}
                   options={w.branches.map(b => ({ value: b.id, label: b.name }))} />)
    : w.halls.length > 1 && (
      <WizardChips value={w.hallId ?? 0} onPick={w.setHallId}
                   options={w.halls.map(h => ({ value: h.id, label: h.name }))} />);
  const placeLabel = w.isResource || w.noHall ? t('journal:resourceBooking.branch') : t('journal:newBooking.location');

  return (
    <div className="bw-list bw-summary">
      <SummaryRow label={t('journal:wizard.when')} value={isTime(w.time) ? `${day}, ${w.time}` : ''}
           hint={w.joined ? t('journal:wizard.existing') : undefined} onChange={() => w.goTo(TIME_STEP)} />
      {w.needsClient && (
        <SummaryRow label={t('journal:resourceBooking.client')} value={w.clientName}
                    hint={w.clientOptional && w.client == null ? t('journal:wizard.clientOptional') : undefined}
                    onChange={() => w.goTo(CLIENT_STEP)} />
      )}
      <SummaryRow label={t('journal:resourceBooking.service')} value={w.service?.name ?? ''}
                  hint={w.soloLesson ? t('journal:newBooking.individual') : undefined} onChange={() => w.goTo(SERVICE_STEP)} />
      <SummaryRow label={t('journal:resourceBooking.staff')} value={master ?? ''} onChange={() => w.goTo(MASTER_STEP)} />
      {/* Время сменили после выбора мастера — и он в него оказался занят. */}
      {w.conflict && <div className="kp-error bw-sum-error" role="alert">{t('journal:wizard.selectionConflict')}</div>}
      {place && (
        <div className="bw-field bw-sum-place">
          <span className="jf-title">{placeLabel}</span>
          {place}
        </div>
      )}
      {/* Индивидуальная запись: цена, своя скидка на это занятие и отметки
          «Оплата» и «Посещение» (SettleBlock). Запись создаётся неоплаченной;
          что отмечено, проводится вместе с подтверждением. Групповая — прежний
          итог: её оплату по-прежнему ведёт касса. */}
      {!w.service ? null : w.isResource && w.resource.quote ? (
        <>
          {w.durationMin ? (
            <div className="bw-sum-total"><span>{`${w.durationMin} ${t('common:units.min')}`}</span></div>
          ) : null}
          <SettleBlock w={w} />
        </>
      ) : (
        <div className="bw-sum-total">
          <span>{w.durationMin ? `${w.durationMin} ${t('common:units.min')}` : ''}</span>
          <span className="bw-sum-price">{w.priceText}</span>
        </div>
      )}
      <div className="bw-field bw-sum-note">
        <span className="jf-title">{t('journal:lessonNotes.short')}</span>
        <NoteDropZone onFiles={w.notePhotos.add}>
          <div className="bw-note-box">
            <textarea className="bw-note-input" rows={2} value={w.notes} disabled={w.saving}
                      placeholder={t('journal:lessonNotes.placeholder')} onChange={e => w.setNotes(e.target.value)} />
            <NotePhotos compact photos={w.notePhotos.photos} pending={w.notePhotos.pending}
                        onAdd={w.notePhotos.add} onRemove={w.notePhotos.remove} />
          </div>
        </NoteDropZone>
      </div>
    </div>
  );
}
