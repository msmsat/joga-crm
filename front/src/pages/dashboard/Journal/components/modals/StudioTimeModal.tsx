// «Время студии» — блок в журнале без занятия: уборка, подготовка зала,
// планёрка. Открывается кнопкой «Время студии» в окне создания занятия
// (с мастером, днём и временем клетки) и нажатием на уже стоящий блок —
// тогда то же окно правит его и умеет убрать.
//
// Слева — кусок колонки журнала с этим блоком (StudioTimePreview): человек
// видит результат до того, как нажал. На телефоне колонка превью уходит
// (ModalShell), окно — шит снизу, как все окна кита.
//
// Логика запросов — hooks/useStudioTime, правила — studioTimeModel.ts.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { NotebookPen, Minus, Plus, Trash2 } from 'lucide-react';
import {
  ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, Select, ConfirmModal,
  useModalClose,
} from '../../../../../components/ui/index';
import type { Trainer } from '../../types';
import { StudioTimePreview } from '../StudioTimePreview';
import { STUDIO_TIME_ICONS } from '../studioTimeIcons';
import {
  DURATION_PRESETS, DURATION_STEP, LABEL_PRESETS, MAX_DURATION, MAX_LABEL, MIN_DURATION,
  clampDuration, cleanLabel, draftErrors, durationParts, endOf, isValid, startOptions, toPayload,
  type StudioTimeDraft,
} from '../../studioTimeModel';
import '../studioTime.css';

interface Props {
  draft: StudioTimeDraft;
  trainers: Trainer[];
  timeStep: number;
  onClose: () => void;
  /** true — сохранено, окно закрывается; false — отказ сервера, черновик остаётся. */
  onSubmit: (draft: StudioTimeDraft, payload: ReturnType<typeof toPayload>) => Promise<boolean>;
  onDelete: (draft: StudioTimeDraft) => Promise<boolean>;
}

export function StudioTimeModal({ draft: initial, trainers, timeStep, onClose, onSubmit, onDelete }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const [draft, setDraft] = useState<StudioTimeDraft>(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  // Закрытие окна кита с анимацией ухода — его отдаёт контекст ModalShell,
  // а подтверждение удаления живёт снаружи окна, в своём портале.
  const closeRef = useRef<() => void>(onClose);
  const editing = initial.id != null;
  const set = (patch: Partial<StudioTimeDraft>) => setDraft(d => ({ ...d, ...patch }));

  const errors = draftErrors(draft);
  const payload = toPayload(draft, editing ? initial : undefined);
  const changed = !editing || Object.keys(payload).length > 0;
  const ready = isValid(draft) && changed && !saving;
  const trainer = trainers.find(item => item.id === draft.staffId);
  const presets = LABEL_PRESETS.map(key => ({ key, label: t(`journal:studioTime.presets.${key}`) }));
  const times = useMemo(() => startOptions(timeStep, draft.start), [timeStep, draft.start]);
  const until = endOf(draft.start, draft.duration);
  const duration = (minutes: number) => {
    const { key, h, m } = durationParts(minutes);
    return t(`journal:studioTime.${key}`, { h, m });
  };

  const submit = async () => {
    setTouched(true);
    if (!ready) return;
    setSaving(true);
    const ok = await onSubmit({ ...draft, label: cleanLabel(draft.label) }, payload);
    setSaving(false);
    if (ok) closeRef.current();
  };

  return (
    <>
      <ModalShell size="lg" onClose={onClose} dismissible={!saving} maxWidth="820px" leftWidth="300px"
                  left={<StudioTimePreview draft={draft} trainer={trainer} label={cleanLabel(draft.label)} />}
                  leftStyle={{ background: 'var(--st-left-bg)', padding: '30px 26px 24px', justifyContent: 'flex-start' }}>
        <ModalHeader
          title={editing ? t('journal:studioTime.editTitle') : t('journal:studioTime.title')}
          subtitle={editing ? t('journal:studioTime.editSubtitle') : t('journal:studioTime.subtitle')}
        />
        <ModalBody>
          <fieldset className="st-form" disabled={saving}>
            <div className="st-field">
              <Input
                label={t('journal:studioTime.name')}
                value={draft.label}
                // Ошибка — только когда название набрали и стёрли. На уходе фокуса
                // её подпись сдвигала чипы под пальцем, и нажатие на готовое
                // название промахивалось.
                onChange={label => { setTouched(true); set({ label: label.slice(0, MAX_LABEL) }); }}
                placeholder={t('journal:studioTime.namePlaceholder')}
                icon={<NotebookPen size={16} strokeWidth={1.8} />}
                error={touched && errors.label ? t('journal:studioTime.errors.name') : undefined}
                autoFocus={!editing}
              />
              <div className="st-chips" role="list">
                {presets.map(({ key, label }) => {
                  const Icon = STUDIO_TIME_ICONS[key];
                  return (
                    <button key={key} type="button" role="listitem"
                            className={`st-chip st-chip-icon${cleanLabel(draft.label) === label ? ' is-on' : ''}`}
                            onClick={() => set({ label })}>
                      <Icon size={14} strokeWidth={1.9} aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="st-field">
              <div className="st-label">{t('journal:studioTime.staff')}</div>
              <div className="st-staff" role="radiogroup" aria-label={t('journal:studioTime.staff')}>
                {trainers.map(item => {
                  const on = item.id === draft.staffId;
                  return (
                    <button key={item.id} type="button" role="radio" aria-checked={on}
                            className={`st-person${on ? ' is-on' : ''}`}
                            style={on ? { borderColor: item.color, background: item.bg } : undefined}
                            onClick={() => set({ staffId: item.id })}>
                      <span className="st-person-av" style={on ? { background: item.color, color: '#fff' } : undefined}>{item.initials}</span>
                      <span className="st-person-name" style={on ? { color: item.color } : undefined}>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="st-row">
              <Input type="date" label={t('journal:studioTime.date')} value={draft.date}
                     onChange={date => { if (date) set({ date }); }} />
              <div className="st-field">
                <div className="st-label">{t('journal:studioTime.start')}</div>
                <Select value={draft.start} onChange={start => set({ start })}
                        options={times.map(time => ({ value: time, label: time }))} />
              </div>
            </div>

            <div className="st-field">
              <div className="st-label">{t('journal:studioTime.duration')}</div>
              <div className="st-duration">
                <div className="st-chips st-chips-tight">
                  {DURATION_PRESETS.map(minutes => (
                    <button key={minutes} type="button"
                            className={`st-chip${draft.duration === minutes ? ' is-on' : ''}`}
                            onClick={() => set({ duration: minutes })}>
                      {duration(minutes)}
                    </button>
                  ))}
                </div>
                <div className="st-stepper">
                  <button type="button" className="st-step" aria-label={`−${DURATION_STEP}`}
                          disabled={draft.duration <= MIN_DURATION}
                          onClick={() => set({ duration: clampDuration(draft.duration - DURATION_STEP) })}>
                    <Minus size={15} strokeWidth={2} />
                  </button>
                  <div className="st-step-value">
                    <strong>{duration(draft.duration)}</strong>
                    <span>{t('journal:studioTime.until', { time: until.time })}{until.nextDay ? ' +1' : ''}</span>
                  </div>
                  <button type="button" className="st-step" aria-label={`+${DURATION_STEP}`}
                          disabled={draft.duration >= MAX_DURATION}
                          onClick={() => set({ duration: clampDuration(draft.duration + DURATION_STEP) })}>
                    <Plus size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </fieldset>
        </ModalBody>
        <ModalFooter>
          <CloseBridge closeRef={closeRef} />
          {editing && (
            <button type="button" className="st-delete" disabled={saving} onClick={() => setAskDelete(true)}>
              <Trash2 size={15} strokeWidth={1.9} />
              <span>{t('journal:studioTime.delete')}</span>
            </button>
          )}
          <GhostButton>{t('common:buttons.cancel')}</GhostButton>
          <PrimaryButton onClick={() => void submit()} disabled={!ready} loading={saving}>
            {editing ? t('common:buttons.save') : t('journal:studioTime.create')}
          </PrimaryButton>
        </ModalFooter>
      </ModalShell>

      {askDelete && (
        <ConfirmModal
          danger
          title={t('journal:studioTime.deleteConfirm.title')}
          message={t('journal:studioTime.deleteConfirm.message', { label: cleanLabel(initial.label) })}
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
