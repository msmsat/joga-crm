// «Время студии» — блок в журнале без занятия: уборка, подготовка зала,
// планёрка. Одно окно в двух видах:
//  • карточка (view) — открывается нажатием на блок в сетке, всем ролям: что
//    сделать, когда, кого касается, заметка и фото. У владельца внизу
//    «Изменить» — та же карточка становится формой, не закрываясь;
//  • форма (edit) — правка блока владельцем или новый блок из переключателя
//    «Занятие | Время студии» в окне создания (с мастером, днём и временем).
//
// Слева в обоих видах — когда и кусок колонки журнала с этим блоком
// (StudioTimePreview). На телефоне колонка превью уходит (ModalShell), окно —
// шит снизу, как все окна кита.
//
// Крестик закрывает окно. «Назад» из формы возвращает туда, откуда пришли: в
// карточку блока или в окно создания занятия. Сохранение закрывает окно.
//
// Логика запросов — hooks/useStudioTime, правила — studioTimeModel.ts.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, PencilLine, Trash2 } from 'lucide-react';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, ConfirmModal, useModalClose,
} from '../../../../../components/ui/index';
import { useNotePhotos } from '../../../../../hooks/useNotePhotos';
import type { Trainer } from '../../types';
import { StudioTimePreview } from '../StudioTimePreview';
import { StudioTimeDetails } from '../studio-time/StudioTimeDetails';
import { StudioTimeForm } from '../studio-time/StudioTimeForm';
import { useStaffHours } from '../../hooks/useStaffHours';
import type { StudioTimeMode } from '../../hooks/useStudioTime';
import {
  MAX_PHOTOS, cleanLabel, draftErrors, durationParts, isValid, outsideHours, toPayload, type StudioTimeDraft,
} from '../../studioTimeModel';
import '../studioTime.css';

interface Props {
  draft: StudioTimeDraft;
  /** С чего начинается окно: карточка блока или сразу форма. */
  mode: StudioTimeMode;
  /** Владелец: ставит, правит и убирает. Остальные видят только карточку. */
  canManage: boolean;
  trainers: Trainer[];
  timeStep: number;
  onClose: () => void;
  /** Окно открыли из создания занятия: «Назад» возвращает в него. */
  onBack?: () => void;
  /** true — сохранено, окно закрывается; false — отказ сервера, черновик остаётся. */
  onSubmit: (draft: StudioTimeDraft, payload: ReturnType<typeof toPayload>) => Promise<boolean>;
  onDelete: (draft: StudioTimeDraft) => Promise<boolean>;
}

export function StudioTimeModal({ draft: initial, mode: startMode, canManage, trainers, timeStep, onClose, onBack, onSubmit, onDelete }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const [mode, setMode] = useState<StudioTimeMode>(canManage ? startMode : 'view');
  const [form, setForm] = useState<Omit<StudioTimeDraft, 'photos'>>(initial);
  const photos = useNotePhotos(initial.photos);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  // Закрытие окна кита с анимацией ухода — его отдаёт контекст ModalShell,
  // а подтверждение удаления живёт снаружи окна, в своём портале.
  const closeRef = useRef<() => void>(onClose);
  const editing = initial.id != null;
  const set = (patch: Partial<StudioTimeDraft>) => setForm(d => ({ ...d, ...patch }));

  const draft: StudioTimeDraft = { ...form, photos: photos.photos };
  const shown = mode === 'view' ? initial : draft;
  const errors = draftErrors(draft);
  const payload = toPayload(draft, editing ? initial : undefined);
  const changed = !editing || Object.keys(payload).length > 0;
  // Снимок ещё летит — сохранить сейчас значило бы потерять его молча.
  const uploading = photos.pending.length > 0;
  const ready = isValid(draft) && changed && !saving && !uploading;
  // Часы нужны только форме: карточка ничего не ставит и не предупреждает.
  const hours = useStaffHours(shown.date, mode === 'edit');
  const outside = hours ? outsideHours(hours, draft) : [];
  const duration = useCallback((minutes: number) => {
    const { key, h, m } = durationParts(minutes);
    return t(`journal:studioTime.${key}`, { h, m });
  }, [t]);
  const roomForPhotos = MAX_PHOTOS - photos.photos.length - photos.pending.length;
  const addPhotos = (files: FileList | File[] | null) => photos.add(Array.from(files ?? []).slice(0, Math.max(0, roomForPhotos)));

  // Сохранили — окно уходит. Закрытие берётся из кадра ПОСЛЕ снятия «сохраняю»:
  // в кадре сохранения окно незакрываемо (dismissible=false), и вызов прямо из
  // обработчика молча ничего не делал — окно оставалось висеть открытым.
  useEffect(() => { if (saved) closeRef.current(); }, [saved]);

  const submit = async () => {
    setTouched(true);
    if (!ready) return;
    setSaving(true);
    const ok = await onSubmit({ ...draft, label: cleanLabel(draft.label) }, payload);
    setSaving(false);
    if (ok) setSaved(true);
  };
  // Из формы правки — обратно в карточку, без несохранённого.
  const toCard = () => {
    setForm(initial);
    photos.reset(initial.photos);
    setTouched(false);
    setMode('view');
  };

  const title = mode === 'view' ? cleanLabel(initial.label) || t('journal:studioTime.title')
    : editing ? t('journal:studioTime.editTitle') : t('journal:studioTime.title');
  const subtitle = mode === 'view' ? t('journal:studioTime.action')
    : editing ? t('journal:studioTime.editSubtitle') : t('journal:studioTime.subtitle');

  return (
    <>
      <ModalShell size="lg" onClose={onClose} dismissible={!saving} maxWidth="960px" leftWidth="290px"
                  left={<StudioTimePreview draft={shown} trainers={trainers} label={cleanLabel(shown.label)}
                                           duration={duration(shown.duration)}
                                           kicker={mode === 'view' ? t('journal:studioTime.inJournal') : undefined}
                                           hint={mode === 'edit'} />}
                  leftStyle={{ background: 'var(--st-left-bg)', padding: '28px 26px 24px', justifyContent: 'flex-start' }}>
        <ModalHeader title={title} subtitle={subtitle} />
        <ModalBody>
          {mode === 'view' ? (
            <StudioTimeDetails draft={initial} trainers={trainers} duration={duration(initial.duration)} />
          ) : (
            <StudioTimeForm
              draft={draft} anchor={{ date: initial.date, staffId: initial.staffIds[0] }} trainers={trainers}
              timeStep={timeStep} outside={outside} saving={saving} duration={duration}
              photos={{ ...photos, add: addPhotos, canAdd: roomForPhotos > 0 }}
              nameError={touched && errors.label ? t('journal:studioTime.errors.name') : undefined}
              onChange={set} onLabelTyped={() => setTouched(true)}
            />
          )}
        </ModalBody>
        <ModalFooter>
          <CloseBridge closeRef={closeRef} />
          {mode === 'view' ? (
            canManage ? (
              <>
                <GhostButton>{t('common:buttons.close')}</GhostButton>
                <PrimaryButton onClick={() => setMode('edit')}>
                  <PencilLine size={16} strokeWidth={2} aria-hidden />{t('journal:studioTime.edit')}
                </PrimaryButton>
              </>
            ) : (
              <PrimaryButton onClick={() => closeRef.current()}>{t('journal:studioTime.gotIt')}</PrimaryButton>
            )
          ) : (
            <>
              {editing && (
                <button type="button" className="st-delete" disabled={saving} onClick={() => setAskDelete(true)}>
                  <Trash2 size={15} strokeWidth={1.9} />
                  <span>{t('journal:studioTime.delete')}</span>
                </button>
              )}
              {editing || onBack ? (
                // Окно создания встаёт на место сразу — под уходящим этим окном, а
                // не после него: так «Назад» выглядит возвратом, а не новым окном.
                <GhostButton onClick={editing ? toCard : () => { onBack?.(); closeRef.current(); }}>
                  <span className="st-back"><ArrowLeft size={15} strokeWidth={2} aria-hidden />{t('common:buttons.back')}</span>
                </GhostButton>
              ) : (
                <GhostButton>{t('common:buttons.cancel')}</GhostButton>
              )}
              <PrimaryButton onClick={() => void submit()} disabled={!ready} loading={saving}>
                {editing ? t('common:buttons.save') : t('journal:studioTime.create')}
              </PrimaryButton>
            </>
          )}
        </ModalFooter>
      </ModalShell>

      {askDelete && (
        <ConfirmModal
          danger
          title={t('journal:studioTime.deleteConfirm.title')}
          message={t(initial.staffIds.length > 1 ? 'journal:studioTime.deleteConfirm.messageTeam' : 'journal:studioTime.deleteConfirm.message',
            { label: cleanLabel(initial.label) })}
          confirmText={t('journal:studioTime.deleteConfirm.confirm')}
          onConfirm={async () => {
            if (!(await onDelete(initial))) throw new Error('studio time not removed');
            closeRef.current();
          }}
          onClose={() => setAskDelete(false)}
        />
      )}
    </>
  );
}

/** Отдаёт наружу закрытие ModalShell: оно доступно только внутри окна. */
function CloseBridge({ closeRef }: { closeRef: RefObject<() => void> }) {
  const close = useModalClose();
  useEffect(() => { closeRef.current = close; }, [close, closeRef]);
  return null;
}
